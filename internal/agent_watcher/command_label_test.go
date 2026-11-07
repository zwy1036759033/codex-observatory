package agent_watcher

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestActualCommandLabels(t *testing.T) {
	cases := []struct{ script, want string }{
		{"npm run build", "npm run build"},
		{"& '..\\toolchain\\go\\bin\\go.exe' test -p 1 ./...", "go.exe test"},
		{"node work/spider-qa.cjs", "node work/spider-qa.cjs"},
		{"@'\nnode invented-command-inside-string\n'@ | python", "python · 内联脚本"},
	}
	for _, c := range cases {
		b, _ := json.Marshal([]string{"powershell.exe", "-Command", c.script})
		got := commandLabel(b)
		if !strings.Contains(got, c.want) {
			t.Errorf("wanted %q, got %q", c.want, got)
		}
	}
	secret := "ghp_" + strings.Repeat("x", 40)
	b, _ := json.Marshal("node build.js --token=" + secret)
	if strings.Contains(commandLabel(b), secret) {
		t.Fatal("credential copied into feed")
	}
}
