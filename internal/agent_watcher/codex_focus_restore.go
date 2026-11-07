package agent_watcher

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Read at most 2 MiB before the normal replay window, only at log discovery.
// Retain no transcript, patch body or code cache: saved source is read by diskCode.
func (cw *CodexWatcher) restoreCodeFocus(file *os.File, state *codexCursor, before int64) {
	if before <= 0 || cw.emit == nil {
		return
	}
	start := max(int64(0), before-codexReadLimit)
	data, err := io.ReadAll(io.NewSectionReader(file, start, before-start))
	if err != nil {
		return
	}
	// Drop incomplete records at either boundary; the normal tail owns the last.
	end := bytes.LastIndexByte(data, '\n')
	if end < 0 {
		return
	}
	data = data[:end]
	for len(data) > 0 {
		prev := bytes.LastIndexByte(data, '\n')
		line := data[prev+1:]
		if prev < 0 && start > 0 {
			break
		}
		if len(line) <= 1024*1024 && bytes.Contains(line, []byte(`"FileChange"`)) {
			var record struct {
				Timestamp string `json:"timestamp"`
				Type      string `json:"type"`
				Payload   struct {
					Type string `json:"type"`
					Item struct {
						Type    string          `json:"type"`
						Changes json.RawMessage `json:"changes"`
					} `json:"item"`
				} `json:"payload"`
			}
			if json.Unmarshal(line, &record) == nil && record.Type == "event_msg" && record.Payload.Type == "item_completed" && record.Payload.Item.Type == "FileChange" {
				stamp, e := time.Parse(time.RFC3339Nano, record.Timestamp)
				if e == nil {
					for _, path := range changedPaths(record.Payload.Item.Changes) {
						if !filepath.IsAbs(path) && state.cwd != "" {
							path = filepath.Join(state.cwd, path)
						}
						info, e := os.Stat(path)
						if !previewable(path) || e != nil || info.IsDir() {
							continue
						}
						cw.emit(AgentEvent{ID: "CDX-focus-" + state.session + "-" + record.Timestamp, Timestamp: stamp.UnixMilli(), Source: "codex", SessionID: state.session, Type: EventToolCall, Action: "FILE_CHANGED", Target: path, Summary: "Codex · 恢复最近代码回放 · " + codexLabel(filepath.Base(path))})
						return
					}
				}
			}
		}
		if prev < 0 {
			break
		}
		data = data[:prev]
	}
}
