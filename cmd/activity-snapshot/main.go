// Local verification of the same normalized events used by the desktop UI.
package main

import (
	"agent-cockpit/internal/agent_watcher"
	"encoding/json"
	"os"
)

func main() {
	store := agent_watcher.NewMemoryStore(500)
	service := agent_watcher.GetWatcherService(store)
	if len(os.Args) > 1 {
		service.SetWorkspaceDir(os.Args[1])
	}
	w := agent_watcher.NewCodexWatcher(agent_watcher.DetectToolPaths().CodexDirs, func(ev agent_watcher.AgentEvent) { store.Push(ev); service.RecordEvent(ev) })
	w.PollOnce()
	_ = json.NewEncoder(os.Stdout).Encode(service.GetFullDashboardSnapshot())
}
