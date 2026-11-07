package agent_watcher

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRestoreRealCodeOutsideFeedReplay(t *testing.T) {
	t.Setenv("AGENT_COCKPIT_CODEX_THREAD", "")
	root, log := codexFixture(t, "focus-restore")
	path := filepath.Join(t.TempDir(), "current.ts")
	os.WriteFile(path, []byte("const actualCurrentProject = 1;\n"), 0600)
	change := codexRecord("event_msg", map[string]any{"type": "item_completed", "item": map[string]any{"type": "FileChange", "changes": map[string]any{path: map[string]any{"content": "PRIVATE_PATCH_NOT_EMITTED"}}}})
	appendCodex(t, log, change)
	// Enough subsequent activity to evict the edit from the 256 KiB replay.
	for i := 0; i < 8; i++ {
		appendCodex(t, log, codexRecord("response_item", map[string]any{"type": "reasoning", "text": strings.Repeat("x", 40*1024)}))
	}
	s := &DefaultWatcherService{}
	var edits []AgentEvent
	w := NewCodexWatcher([]string{root}, func(ev AgentEvent) { edits = append(edits, ev); s.RecordEvent(ev) })
	w.PollOnce()
	code := s.GetWorkspaceCode()
	if code.Path != path || code.AgentCode != "CDX-01" || len(code.Lines) != 1 || !strings.Contains(code.Lines[0], "actualCurrentProject") {
		t.Fatal("saved code was not restored outside replay window")
	}
	w.PollOnce()
	if len(edits) != 1 || strings.Contains(edits[0].Summary, "PRIVATE_PATCH") {
		t.Fatal("restore duplicated events or exposed patch content")
	}
}

func TestCodeRestoreHasBoundedLookback(t *testing.T) {
	t.Setenv("AGENT_COCKPIT_CODEX_THREAD", "")
	root, log := codexFixture(t, "bounded-focus")
	path := filepath.Join(t.TempDir(), "old.ts")
	os.WriteFile(path, []byte("const oldProject = 1;"), 0600)
	appendCodex(t, log, codexRecord("event_msg", map[string]any{"type": "item_completed", "item": map[string]any{"type": "FileChange", "changes": map[string]any{path: map[string]any{}}}}))
	for i := 0; i < 64; i++ {
		appendCodex(t, log, codexRecord("response_item", map[string]any{"type": "reasoning", "text": strings.Repeat("x", 40*1024)}))
	}
	s := &DefaultWatcherService{}
	w := NewCodexWatcher([]string{root}, s.RecordEvent)
	w.PollOnce()
	if len(s.GetWorkspaceCode().Lines) != 0 {
		t.Fatal("restored unrelated history beyond bounded lookback")
	}
}
