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

func codexRecord(kind string, payload interface{}) string {
	data, _ := json.Marshal(map[string]interface{}{"timestamp": time.Now().UTC().Format(time.RFC3339Nano), "type": kind, "payload": payload})
	return string(data) + "\n"
}

func codexFixture(t *testing.T, thread string) (string, string) {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, "sessions", "2026", "11", "06")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "rollout-2026-11-06T00-00-00-"+thread+".jsonl")
	header := codexRecord("session_meta", map[string]interface{}{"id": thread})
	if err := os.WriteFile(path, []byte(header), 0600); err != nil {
		t.Fatal(err)
	}
	return root, path
}

func appendCodex(t *testing.T, path, text string) {
	t.Helper()
	f, e := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0600)
	if e != nil {
		t.Fatal(e)
	}
	defer f.Close()
	if _, e = f.WriteString(text); e != nil {
		t.Fatal(e)
	}
}

func TestCodexIncrementalPartialMalformedAndTruncate(t *testing.T) {
	t.Setenv("AGENT_COCKPIT_CODEX_THREAD", "")
	root, path := codexFixture(t, "thread-a")
	var events []AgentEvent
	w := NewCodexWatcher([]string{root, root}, func(e AgentEvent) { events = append(events, e) })
	start := codexRecord("event_msg", map[string]string{"type": "task_started"})
	appendCodex(t, path, start)
	w.PollOnce()
	w.PollOnce()
	if len(events) != 1 || events[0].SessionID != "thread-a" {
		t.Fatalf("initial/dedup: %+v", events)
	}
	call := codexRecord("response_item", map[string]string{"type": "function_call", "name": "exec_command", "call_id": "c1", "arguments": "secret must never leave log"})
	appendCodex(t, path, call[:len(call)-4])
	w.PollOnce()
	if len(events) != 1 {
		t.Fatal("partial line consumed")
	}
	appendCodex(t, path, call[len(call)-4:]+"not json\n")
	w.PollOnce()
	if len(events) != 2 || events[1].Action != "RUN_CMD" {
		t.Fatalf("completed line not processed: %+v", events)
	}
	appendCodex(t, path, codexRecord("response_item", map[string]string{"type": "function_call_output", "call_id": "c1", "output": "secret output"}))
	w.PollOnce()
	if len(events) != 3 || events[2].Action != "TOOL_COMPLETE" {
		t.Fatal("tool correlation failed")
	}
	// File truncation must reset the offset rather than wait for old size.
	if err := os.WriteFile(path, []byte(start), 0600); err != nil {
		t.Fatal(err)
	}
	w.PollOnce()
	if len(events) != 4 {
		t.Fatalf("truncated log not resumed: %d", len(events))
	}
}

func TestCodexOnlyPublicContent(t *testing.T) {
	var events []AgentEvent
	w := NewCodexWatcher(nil, func(e AgentEvent) { events = append(events, e) })
	state := &codexCursor{session: "s", calls: map[string]string{}}
	payloads := []map[string]interface{}{
		{"type": "reasoning", "summary": "SECRET", "encrypted_content": "SECRET"},
		{"type": "message", "role": "assistant", "channel": "analysis", "content": []map[string]string{{"type": "output_text", "text": "SECRET"}}},
		{"type": "message", "role": "assistant", "content": []map[string]string{{"type": "output_text", "text": "SECRET"}}},
		{"type": "message", "role": "developer", "channel": "commentary", "content": []map[string]string{{"type": "output_text", "text": "SECRET"}}},
		{"type": "message", "role": "user", "content": "SECRET"},
		{"type": "function_call_output", "call_id": "unknown", "output": "SECRET"},
		{"type": "message", "role": "assistant", "phase": "commentary", "content": []map[string]string{{"type": "output_text", "text": "Checking the build"}}},
		{"type": "message", "role": "assistant", "channel": "final", "content": []map[string]string{{"type": "output_text", "text": "Finished"}}},
	}
	for i, p := range payloads {
		w.parseLine(state, []byte(codexRecord("response_item", p)), int64(i), false)
	}
	w.parseLine(state, []byte(codexRecord("event_msg", map[string]interface{}{"type": "item_completed", "item": map[string]string{"type": "Reasoning", "raw_content": "SECRET", "summary_text": "SECRET"}})), 90, false)
	if len(events) != 2 || events[0].Action != "PROGRESS" || events[1].Action != "REPLY_COMPLETE" {
		t.Fatalf("public filter: %+v", events)
	}
	data, _ := json.Marshal(events)
	if strings.Contains(string(data), "SECRET") {
		t.Fatal("private data escaped")
	}
}

func TestCodexDesktopNestedToolsAndLifecycle(t *testing.T) {
	var events []AgentEvent
	store := NewMemoryStore(20)
	w := NewCodexWatcher(nil, func(e AgentEvent) { events = append(events, e); store.Push(e) })
	state := &codexCursor{session: "s", calls: map[string]string{}}
	payloads := []interface{}{
		map[string]interface{}{"type": "task_started"},
		map[string]interface{}{"type": "item_completed", "item": map[string]interface{}{"type": "CommandExecution", "command": "SECRET", "aggregated_output": "SECRET", "exit_code": 1}},
		map[string]interface{}{"type": "item_completed", "item": map[string]interface{}{"type": "McpToolCall", "server": "github", "tool": "fetch", "status": "completed", "arguments": "SECRET", "result": "SECRET"}},
		map[string]interface{}{"type": "task_complete"},
	}
	for i, p := range payloads {
		w.parseLine(state, []byte(codexRecord("event_msg", p)), int64(i), false)
	}
	if len(events) != 4 || events[1].Details["exitCode"] != 1 || events[2].Target != "github / fetch" {
		t.Fatalf("nested tools: %+v", events)
	}
	if store.GetSessions()[0].Status != "idle" {
		t.Fatal("completed turn stayed busy")
	}
	data, _ := json.Marshal(events)
	if strings.Contains(string(data), "SECRET") {
		t.Fatal("tool content escaped")
	}
}

func TestCodexThreadFilterAndLargeTail(t *testing.T) {
	t.Setenv("AGENT_COCKPIT_CODEX_THREAD", "wanted")
	root, path := codexFixture(t, "wanted")
	other := filepath.Join(filepath.Dir(path), "rollout-other.jsonl")
	record := codexRecord("event_msg", map[string]string{"type": "task_started"})
	if err := os.WriteFile(other, []byte(record), 0600); err != nil {
		t.Fatal(err)
	}
	appendCodex(t, path, strings.Repeat("x", 300000)+"\n"+record)
	var events []AgentEvent
	w := NewCodexWatcher([]string{root}, func(e AgentEvent) { events = append(events, e) })
	w.PollOnce()
	if len(events) != 1 || events[0].SessionID != "wanted" {
		t.Fatalf("tail/filter: %+v", events)
	}
	// Huge appended record spans multiple polls; later activity must still arrive.
	appendCodex(t, path, strings.Repeat("x", codexReadLimit+200)+"\n"+record)
	w.PollOnce()
	w.PollOnce()
	w.PollOnce()
	if len(events) != 2 {
		t.Fatalf("oversize recovery: %d", len(events))
	}
}

func TestCodexIgnoreHistoricalAndKeepUnicode(t *testing.T) {
	var events []AgentEvent
	w := NewCodexWatcher(nil, func(e AgentEvent) { events = append(events, e) })
	record := strings.Replace(codexRecord("event_msg", map[string]string{"type": "task_started"}), time.Now().UTC().Format("2006-01-02"), "2000-01-01", 1)
	w.parseLine(&codexCursor{}, []byte(record), 0, true)
	if len(events) != 0 {
		t.Fatal("historical events replayed")
	}
	value := codexLabel(strings.Repeat("中文", 300))
	if len([]rune(value)) != 241 || !json.Valid([]byte(`"`+value+`"`)) {
		t.Fatal("unicode truncation failed")
	}
}

func TestLiveMetricsAreEmptyWhenIdle(t *testing.T) {
	store := NewMemoryStore(10)
	s := &DefaultWatcherService{store: store}
	snap := s.GetStagePipelineData()
	if snap.ActiveAgents != 0 || snap.TotalEvents != 0 || snap.DoneOutputs != 0 || len(snap.RecentPackets) != 0 {
		t.Fatalf("fabricated activity: %+v", snap)
	}
	for _, src := range snap.Sources {
		if src.Active || src.ByteRate != "0 ev/min" {
			t.Fatalf("fabricated rate: %+v", src)
		}
	}
	for _, hub := range snap.Hubs {
		if hub.EventsCount != 0 || hub.Quality != -1 {
			t.Fatal("fabricated hub")
		}
	}
}

func TestWorkspaceDirectorySwitchDoesNotDeadlock(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := NewMemoryStore(10)
	service := &DefaultWatcherService{store: store}
	w := NewWorkspaceWatcher(ctx, t.TempDir(), service, func(ev AgentEvent) { store.Push(ev); service.RecordEvent(ev); service.GetFullDashboardSnapshot() })
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "sample.go"), []byte("package example\n"), 0600); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- w.SetDirectory(dir) }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("directory switch deadlocked")
	}
	if len(store.GetRecent(0)) != 1 {
		t.Fatal("directory event not delivered")
	}
	if w.fsWatcher != nil {
		_ = w.fsWatcher.Close()
	}
}

func TestCodexAllSessionsWithoutCapAndDormantResume(t *testing.T) {
	t.Setenv("AGENT_COCKPIT_CODEX_THREAD", "")
	root, first := codexFixture(t, "session-0")
	dir := filepath.Dir(first)
	activity := codexRecord("event_msg", map[string]string{"type": "task_started"})
	appendCodex(t, first, activity)
	for i := 1; i < 40; i++ {
		id := fmt.Sprintf("session-%d", i)
		data := codexRecord("session_meta", map[string]string{"id": id}) + activity
		if err := os.WriteFile(filepath.Join(dir, "rollout-"+id+".jsonl"), []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
	}
	dormant := filepath.Join(dir, "rollout-dormant.jsonl")
	if err := os.WriteFile(dormant, []byte(codexRecord("session_meta", map[string]string{"id": "dormant"})+activity), 0600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-72 * time.Hour)
	if err := os.Chtimes(dormant, old, old); err != nil {
		t.Fatal(err)
	}
	sessions := map[string]int{}
	w := NewCodexWatcher([]string{root}, func(e AgentEvent) { sessions[e.SessionID]++ })
	w.PollOnce()
	if len(sessions) != 40 || sessions["dormant"] != 0 {
		t.Fatalf("all-session discovery: %d sessions", len(sessions))
	}
	appendCodex(t, dormant, activity)
	w.PollOnce()
	if len(sessions) != 41 || sessions["dormant"] != 1 {
		t.Fatalf("resumed old session missing: %+v", sessions)
	}
	w.PollOnce()
	if sessions["session-0"] != 1 || sessions["dormant"] != 1 {
		t.Fatal("duplicate replay")
	}
}
