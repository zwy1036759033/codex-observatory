package agent_watcher

// Read local Codex activity without launching another agent or changing its logs.
// Only public commentary/final messages and allowlisted tool metadata are emitted.
// Reasoning, encrypted content, prompts, arguments and tool output are never copied.
import (
	"bufio"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const codexReadLimit = 2 * 1024 * 1024

type codexCursor struct {
	offset  int64
	info    os.FileInfo
	session string
	cwd     string
	// Tool names only; never retain tool arguments or outputs.
	calls      map[string]string
	discarding bool
}

type CodexWatcher struct {
	mu       sync.Mutex
	roots    []string
	thread   string
	files    map[string]*codexCursor
	emit     func(AgentEvent)
	now      func() time.Time
	nextScan time.Time
	paths    []string
}

func NewCodexWatcher(roots []string, emit func(AgentEvent)) *CodexWatcher {
	return &CodexWatcher{
		roots: roots, thread: os.Getenv("AGENT_COCKPIT_CODEX_THREAD"),
		files: make(map[string]*codexCursor), emit: emit, now: time.Now,
	}
}

// PollOnce keeps complete-line offsets: an unfinished JSON record is retried next
// time. Work and memory per poll are bounded, even for large, noisy session logs.
func (cw *CodexWatcher) PollOnce() {
	cw.mu.Lock()
	defer cw.mu.Unlock()
	if cw.now().Before(cw.nextScan) {
		for _, path := range cw.paths {
			if info, err := os.Stat(path); err == nil {
				cw.tail(path, info)
			}
		}
		return
	}
	cw.nextScan = cw.now().Add(5 * time.Second)
	type candidate struct {
		path string
		info os.FileInfo
	}
	var candidates []candidate
	seen := make(map[string]bool)
	for _, root := range cw.roots {
		sessions := filepath.Join(root, "sessions")
		if filepath.Base(root) == "sessions" {
			sessions = root
		}
		_ = filepath.WalkDir(sessions, func(path string, entry fs.DirEntry, err error) error {
			if err != nil || entry.IsDir() {
				return nil
			}
			if !strings.HasPrefix(entry.Name(), "rollout-") || !strings.HasSuffix(entry.Name(), ".jsonl") {
				return nil
			}
			if cw.thread != "" && !strings.HasSuffix(entry.Name(), "-"+cw.thread+".jsonl") {
				return nil
			}
			info, err := entry.Info()
			if err != nil || seen[path] {
				return nil
			}
			seen[path] = true
			candidates = append(candidates, candidate{path, info})
			return nil
		})
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].info.ModTime().After(candidates[j].info.ModTime()) })
	retained := make(map[string]bool)
	cw.paths = nil
	for _, c := range candidates {
		retained[c.path] = true
		cw.paths = append(cw.paths, c.path)
		cw.tail(c.path, c.info)
	}
	for path := range cw.files {
		if !retained[path] {
			delete(cw.files, path)
		}
	}
}

func (cw *CodexWatcher) tail(path string, info os.FileInfo) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()
	state := cw.files[path]
	initial := state == nil || !os.SameFile(state.info, info) || info.Size() < state.offset
	if initial {
		state = &codexCursor{info: info, calls: make(map[string]string)}
		// Session metadata is always read separately, even when replay starts near EOF.
		header, _ := bufio.NewReader(io.LimitReader(file, 65536)).ReadBytes('\n')
		var meta struct {
			Payload struct {
				ID  string `json:"id"`
				CWD string `json:"cwd"`
			} `json:"payload"`
		}
		if json.Unmarshal(header, &meta) == nil {
			state.session = meta.Payload.ID
			state.cwd = meta.Payload.CWD
		}
		if state.session == "" {
			state.session = strings.TrimSuffix(filepath.Base(path), ".jsonl")
		}
		// Monitor dormant sessions too, without replaying their history on startup.
		// If an old chat is resumed, the next append is read from this exact offset.
		if cw.now().Sub(info.ModTime()) > 24*time.Hour {
			state.offset = info.Size()
			cw.files[path] = state
			return
		}
		state.offset = max(int64(0), info.Size()-256*1024)
		if state.offset > 0 {
			_, _ = file.Seek(state.offset-1, io.SeekStart)
			reader := bufio.NewReader(io.LimitReader(file, codexReadLimit))
			line, _ := reader.ReadBytes('\n')
			state.offset += int64(len(line)) - 1
			state.discarding = len(line) > 0 && line[len(line)-1] != '\n'
		}
		cw.files[path] = state
		// Restore the latest verified edit that fell outside the short feed replay.
		// This runs once per recent log and never replays its old messages/tools.
		cw.restoreCodeFocus(file, state, state.offset)
	}
	if info.Size() <= state.offset {
		return
	}
	_, err = file.Seek(state.offset, io.SeekStart)
	if err != nil {
		return
	}
	reader := bufio.NewReader(io.LimitReader(file, codexReadLimit))
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) == 0 {
			break
		}
		if line[len(line)-1] != '\n' {
			if state.discarding || len(line) > 1024*1024 {
				state.discarding = true
				state.offset += int64(len(line))
			}
			break
		}
		start := state.offset
		state.offset += int64(len(line))
		if state.discarding || len(line) > 1024*1024 {
			state.discarding = false
			continue
		}
		cw.parseLine(state, line, start, initial)
		if err != nil {
			break
		}
	}
}

type codexPayload struct {
	Type    string          `json:"type"`
	ID      string          `json:"id"`
	CallID  string          `json:"call_id"`
	Name    string          `json:"name"`
	Role    string          `json:"role"`
	Channel string          `json:"channel"`
	Phase   string          `json:"phase"`
	Content json.RawMessage `json:"content"`
	Item    json.RawMessage `json:"item"`
}

func (cw *CodexWatcher) parseLine(state *codexCursor, line []byte, offset int64, replay bool) {
	var record struct {
		Timestamp string          `json:"timestamp"`
		Type      string          `json:"type"`
		Payload   json.RawMessage `json:"payload"`
	}
	if json.Unmarshal(line, &record) != nil {
		return
	}
	stamp, err := time.Parse(time.RFC3339Nano, record.Timestamp)
	if err != nil {
		return
	}
	if replay && cw.now().Sub(stamp) > 10*time.Minute {
		return
	}
	var p codexPayload
	if json.Unmarshal(record.Payload, &p) != nil {
		return
	}
	ev := AgentEvent{Timestamp: stamp.UnixMilli(), Source: "codex", SessionID: state.session, Type: EventStatus}
	ev.ID = fmt.Sprintf("CDX-%x-%d", sha256.Sum256([]byte(state.session)), offset)
	if record.Type == "event_msg" {
		switch p.Type {
		case "task_started", "turn_started":
			ev.Action = "TURN_STARTED"
			ev.Summary = "Codex · 开始处理请求"
		case "task_complete", "task_completed", "turn_completed":
			ev.Action = "TURN_COMPLETE"
			ev.Summary = "Codex · 本轮完成"
		case "turn_aborted":
			ev.Action = "TURN_ABORTED"
			ev.Summary = "Codex · 本轮已中断"
		case "item_completed":
			// New desktop logs include nested tools not exposed as raw calls.
			var item struct {
				Type     string          `json:"type"`
				Tool     string          `json:"tool"`
				Server   string          `json:"server"`
				Status   string          `json:"status"`
				ExitCode *int            `json:"exit_code"`
				Changes  json.RawMessage `json:"changes"`
				Command  json.RawMessage `json:"command"`
			}
			if json.Unmarshal(p.Item, &item) != nil {
				return
			}
			switch item.Type {
			case "CommandExecution":
				ev.Type = EventToolCall
				ev.Action = "TOOL_COMPLETE"
				ev.Target = commandLabel(item.Command)
				ev.Summary = "Codex · " + ev.Target
				if strings.Contains(strings.ToLower(item.Status), "progress") || strings.EqualFold(item.Status, "running") {
					ev.Action = "RUN_CMD"
					ev.Summary += " · 运行中"
				}
				if item.ExitCode != nil {
					ev.Details = map[string]interface{}{"exitCode": *item.ExitCode}
					ev.Summary += fmt.Sprintf(" (exit %d)", *item.ExitCode)
				}
			case "McpToolCall":
				ev.Type = EventToolCall
				ev.Action = "TOOL_COMPLETE"
				ev.Target = codexLabel(item.Server + " / " + item.Tool)
				ev.Summary = "Codex · " + ev.Target + " · " + codexLabel(item.Status)
			case "FileChange":
				ev.Type = EventToolCall
				ev.Action = "FILE_CHANGED"
				ev.Target = "workspace"
				ev.Summary = "Codex · 文件修改完成"
				paths := changedPaths(item.Changes)
				for _, path := range paths {
					if !filepath.IsAbs(path) && state.cwd != "" {
						path = filepath.Join(state.cwd, path)
					}
					if previewable(path) {
						ev.Target = path
						ev.Summary += " · " + codexLabel(filepath.Base(path))
						break
					}
				}
			default:
				return // In particular: never decode Reasoning or raw_content.
			}
		default:
			return
		}
	} else if record.Type == "response_item" {
		switch p.Type {
		case "message":
			if p.Role != "assistant" {
				return
			}
			phase := p.Phase
			if phase == "" {
				phase = p.Channel
			}
			if phase != "commentary" && phase != "final" && phase != "final_answer" {
				return
			}
			var parts []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			}
			if json.Unmarshal(p.Content, &parts) != nil {
				return
			}
			var text []string
			for _, part := range parts {
				if part.Type == "output_text" || part.Type == "text" {
					text = append(text, part.Text)
				}
			}
			if len(text) == 0 {
				return
			}
			ev.Type = EventStatus
			ev.Action = "PROGRESS"
			ev.Target = "public message"
			ev.Summary = "Codex · " + codexLabel(strings.Join(text, " "))
			if phase != "commentary" {
				ev.Action = "REPLY_COMPLETE"
				ev.Summary = "Codex · 回复已生成"
			}
		case "function_call", "custom_tool_call":
			name := codexLabel(p.Name)
			if name == "" {
				return
			}
			if len(state.calls) >= 256 {
				state.calls = make(map[string]string)
			}
			if p.CallID != "" {
				state.calls[p.CallID] = name
			}
			ev.Type = EventToolCall
			ev.Action = codexToolAction(name)
			ev.Target = name
			ev.Summary = "Codex · 调用 " + name
		case "function_call_output", "custom_tool_call_output":
			name, ok := state.calls[p.CallID]
			if !ok {
				return
			}
			delete(state.calls, p.CallID)
			ev.Type = EventToolCall
			ev.Action = "TOOL_COMPLETE"
			ev.Target = name
			ev.Summary = "Codex · " + name + " 返回"
		default:
			return // Includes reasoning, analysis, encrypted_content and tool arguments.
		}
	} else {
		return
	}
	if cw.emit != nil {
		cw.emit(ev)
	}
}

func codexLabel(value string) string {
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) > 240 {
		value = string(runes[:240]) + "…"
	}
	return value
}

func codexToolAction(name string) string {
	name = strings.ToLower(name)
	switch {
	case strings.Contains(name, "apply_patch") || strings.Contains(name, "edit_file") || strings.Contains(name, "write_file"):
		return "FILE_CHANGED"
	case strings.Contains(name, "search") || strings.Contains(name, "grep"):
		return "SEARCH_GREP"
	case strings.Contains(name, "read") || strings.Contains(name, "fetch"):
		return "READ_TOOL"
	case strings.Contains(name, "exec") || strings.Contains(name, "shell"):
		return "RUN_CMD"
	default:
		return "TOOL_CALL"
	}
}
