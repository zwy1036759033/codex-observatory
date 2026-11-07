package agent_watcher

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPreviewLimitsWithoutChangingNormalLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "preview.txt")
	if err := os.WriteFile(path, []byte("package x\r\n// 中文\nthird\n"), 0600); err != nil {
		t.Fatal(err)
	}
	lines, err := readCodePreview(path, 2)
	if err != nil || len(lines) != 2 || lines[0] != "package x" || lines[1] != "// 中文" {
		t.Fatalf("normal preview: %q %v", lines, err)
	}
	if err := os.WriteFile(path, []byte(strings.Repeat("x", 4*1024*1024)), 0600); err != nil {
		t.Fatal(err)
	}
	lines, err = readCodePreview(path, 30)
	if err != nil || len(lines) != 1 || len([]rune(lines[0])) != 2049 {
		t.Fatalf("large file preview limit: %d %v", len(lines), err)
	}
}
