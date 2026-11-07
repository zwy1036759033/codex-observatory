package agent_watcher

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func previewable(path string) bool {
	if strings.EqualFold(filepath.Ext(path), ".md") {
		return false
	}
	if strings.HasPrefix(path, `\\`) || !validExts[strings.ToLower(filepath.Ext(path))] {
		return false
	}
	for _, part := range strings.FieldsFunc(filepath.Clean(path), func(r rune) bool { return r == '/' || r == '\\' }) {
		if ignoredDirs[part] || strings.HasPrefix(part, ".") {
			return false
		}
	}
	return true
}

// Called with service.mu held. Content always comes from the actual saved file,
// never a template, tool argument, model thought, or synthetic typing sample.
func (s *DefaultWatcherService) diskCode(path, source, session string, observed int64) {
	if source == "codex" && s.lastCode.AgentCode == "CDX-01" && observed < s.lastCode.ObservedAt {
		return
	}
	path = filepath.Clean(path)
	if !previewable(path) {
		return
	}
	info, e := os.Stat(path)
	if e != nil || info.IsDir() {
		if path == s.codePath {
			s.lastCode = WorkspaceCodeDTO{File: path, Lines: []string{}}
		}
		return
	}
	if source != "codex" && s.lastCode.AgentCode == "CDX-01" && path != s.codePath {
		return
	}
	lines, e := readCodePreview(path, 2048)
	if e != nil {
		return
	}
	revision := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join(lines, "\n"))))
	start := 1
	if path == s.codePath {
		start = s.lastCode.StartLine
		for i := 0; i < max(len(lines), len(s.codeLines)); i++ {
			if i >= len(lines) || i >= len(s.codeLines) || lines[i] != s.codeLines[i] {
				start = max(1, i-3)
				break
			}
		}
	}
	if start > len(lines) {
		start = max(1, len(lines)-20)
	}
	if source != "codex" && s.lastCode.AgentCode == "CDX-01" && revision == s.lastCode.Revision {
		return
	}
	end := min(len(lines), start-1+30)
	visible := []string{}
	if len(lines) > 0 {
		visible = append(visible, lines[start-1:end]...)
	}
	code, name := "FS-MON", "文件实况（来源未确认）"
	if source == "codex" {
		code, name = "CDX-01", "Codex · 已写入代码回放"
	}
	file := path
	if s.workspaceDir != "" {
		if rel, e := filepath.Rel(s.workspaceDir, path); e == nil && !strings.HasPrefix(rel, "..") {
			file = rel
		}
	}
	s.codePath = path
	s.codeLines = lines
	s.lastCode = WorkspaceCodeDTO{File: filepath.ToSlash(file), Path: path, AgentCode: code, AgentName: name, StartLine: start, Lines: visible, Revision: revision, UpdatedAt: info.ModTime().UnixMilli(), ObservedAt: observed, SessionID: session}
}

func (s *DefaultWatcherService) PreviewFile(path string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.diskCode(path, "workspace", "", time.Now().UnixMilli())
}
