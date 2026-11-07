package agent_watcher

import (
	"encoding/json"
	"regexp"
	"strings"
)

var operationRE = regexp.MustCompile(`(?i)^(?:&\s*)?(?:["']?[^\s]*[\\/])?(go(?:\.exe)?|gofmt(?:\.exe)?|npm(?:\.cmd)?|pnpm|yarn|node(?:\.exe)?|python(?:\.exe)?|git(?:\.exe)?|rg(?:\.exe)?|Get-Content|Get-ChildItem|Copy-Item|Start-Process|Stop-Process|Remove-Item)["']?(?:\s+|$)(.*)$`)
var credentialRE = regexp.MustCompile(`(?i)(gh[pousr]_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|sk-[a-z0-9_-]{20,}|bearer\s+[^\s"']+|(?:token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+)`)

// Actual shell operations only; script literals and output are never retained.
func commandLabel(raw json.RawMessage) string {
	var args []string
	var command string
	if json.Unmarshal(raw, &args) == nil && len(args) > 0 {
		command = args[len(args)-1]
	} else {
		_ = json.Unmarshal(raw, &command)
	}
	labels := []string{}
	quoted := false
	inline := ""
	for _, line := range strings.Split(command, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "@'") || strings.HasPrefix(line, "@\"") {
			quoted = true
			continue
		}
		if quoted {
			if strings.HasPrefix(line, "'@") || strings.HasPrefix(line, "\"@") {
				quoted = false
				if strings.Contains(line, "python") {
					inline = "python · 内联脚本"
				} else if strings.Contains(line, "node") {
					inline = "node · 内联脚本"
				}
			}
			continue
		}
		if m := operationRE.FindStringSubmatch(line); len(m) > 0 {
			label := codexLabel(credentialRE.ReplaceAllString(m[1]+" "+m[2], "[REDACTED]"))
			if len(labels) == 0 || labels[len(labels)-1] != label {
				labels = append(labels, label)
			}
		}
	}
	if len(labels) > 3 {
		labels = labels[len(labels)-3:]
	}
	if len(labels) > 0 {
		return strings.Join(labels, " → ")
	}
	if inline != "" {
		return inline
	}
	return "终端脚本"
}
