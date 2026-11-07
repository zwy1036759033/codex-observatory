// A local diagnostic: reports counts only, never transcript content.
package main

import (
	"agent-cockpit/internal/agent_watcher"
	"encoding/json"
	"os"
	"time"
)

func main() {
	actions := map[string]int{}
	sessions := map[string]bool{}
	count := 0
	w := agent_watcher.NewCodexWatcher(agent_watcher.DetectToolPaths().CodexDirs, func(ev agent_watcher.AgentEvent) {
		count++
		actions[ev.Action]++
		sessions[ev.SessionID] = true
	})
	w.PollOnce()
	before := count
	time.Sleep(1600 * time.Millisecond)
	w.PollOnce()
	_ = json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"events": count, "newEvents": count - before, "actions": actions, "sessions": sessions})
	if count == 0 {
		os.Exit(2)
	}
}
