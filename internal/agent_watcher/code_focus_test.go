package agent_watcher

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRealCodexCodeChangeMapAndSameFileRevision(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "current.ts")
	s := &DefaultWatcherService{workspaceDir: root}
	if len(s.GetWorkspaceCode().Lines) != 0 {
		t.Fatal("template code displayed before a real edit")
	}
	lines := []string{}
	for i := 0; i < 70; i++ {
		lines = append(lines, fmt.Sprintf("const line%d = %d;", i, i))
	}
	os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0600)
	var observed []AgentEvent
	w := NewCodexWatcher(nil, func(ev AgentEvent) { observed = append(observed, ev); s.RecordEvent(ev) })
	state := &codexCursor{session: "real-session", cwd: root, calls: map[string]string{}}
	change := func() {
		r := map[string]any{"timestamp": time.Now().UTC().Format(time.RFC3339Nano), "type": "event_msg", "payload": map[string]any{"type": "item_completed", "item": map[string]any{"type": "FileChange", "changes": map[string]any{"current.ts": map[string]any{"type": "update", "content": "DO_NOT_COPY_TOOL_CONTENT"}}}}}
		b, _ := json.Marshal(r)
		w.parseLine(state, b, 0, false)
	}
	change()
	first := s.GetWorkspaceCode()
	if first.Path != path || first.AgentCode != "CDX-01" || first.SessionID != "real-session" || first.Lines[0] != lines[0] {
		t.Fatalf("actual code was not followed: %+v", first)
	}
	lines[48] = "const actuallyChanged = 'real saved code';"
	os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0600)
	change()
	next := s.GetWorkspaceCode()
	if next.Revision == first.Revision || next.StartLine <= 1 || !strings.Contains(strings.Join(next.Lines, "\n"), "actuallyChanged") {
		t.Fatal("same-file change not focused", next.StartLine)
	}
	b, _ := json.Marshal(observed)
	if strings.Contains(string(b), "DO_NOT_COPY_TOOL_CONTENT") {
		t.Fatal("tool content copied")
	}
	other := filepath.Join(root, "unrelated.ts")
	os.WriteFile(other, []byte("const unrelated = true;"), 0600)
	s.RecordEvent(AgentEvent{Source: "codex", Type: EventToolCall, Action: "FILE_CHANGED", Target: other, Timestamp: next.ObservedAt - 1000})
	if s.GetWorkspaceCode().Path != path {
		t.Fatal("older session replay replaced current edit")
	}
	s.PreviewFile(other)
	if s.GetWorkspaceCode().Path != path {
		t.Fatal("unrelated directory file replaced known Codex edit")
	}
	os.Remove(path)
	s.PreviewFile(path)
	if len(s.GetWorkspaceCode().Lines) != 0 {
		t.Fatal("deleted file still shown as live")
	}
}

func TestChangedPathsBothSchemas(t *testing.T) {
	for _, raw := range []string{`{"src/a.ts":{"type":"update","content":"not retained"}}`, `[{"path":"src/a.ts"}]`} {
		p := changedPaths(json.RawMessage(raw))
		if len(p) != 1 || p[0] != "src/a.ts" {
			t.Fatalf("schema not decoded %s: %v", raw, p)
		}
	}
}

func TestWorkspaceHasNoInitialDemoAndFollowsSavedFile(t *testing.T) {
	root := t.TempDir()
	s := &DefaultWatcherService{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w := NewWorkspaceWatcher(ctx, root, s, nil)
	if len(s.GetWorkspaceCode().Lines) != 0 {
		t.Fatal("initial sample displayed")
	}
	path := filepath.Join(root, "actual.js")
	os.WriteFile(path, []byte("const currentSavedCode = 42;\n"), 0600)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(strings.Join(s.GetWorkspaceCode().Lines, "\n"), "currentSavedCode") {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("filesystem write was not followed", w.GetDirectory())
}
