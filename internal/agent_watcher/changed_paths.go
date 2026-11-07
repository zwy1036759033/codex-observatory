package agent_watcher

import (
	"encoding/json"
	"sort"
)

// Desktop builds use either a path-keyed object or a list. Decode metadata only;
// do not retain patch contents, command arguments, or private reasoning.
func changedPaths(raw json.RawMessage) []string {
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) == nil {
		paths := make([]string, 0, len(object))
		for path := range object {
			paths = append(paths, path)
		}
		sort.Strings(paths)
		return paths
	}
	var list []struct {
		Path string `json:"path"`
	}
	paths := []string{}
	if json.Unmarshal(raw, &list) == nil {
		for _, v := range list {
			if v.Path != "" {
				paths = append(paths, v.Path)
			}
		}
	}
	return paths
}
