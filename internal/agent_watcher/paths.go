package agent_watcher

import (
	"os"
	"path/filepath"
	"runtime"
)

// ToolPaths contains discovered log and session directories for supported AI tools
type ToolPaths struct {
	AntigravityBrainDirs []string
	ClaudeCodeDirs       []string
	CodexDirs            []string
}

// DetectToolPaths scans the host environment (Windows / macOS / Linux) for active AI tool roots
func DetectToolPaths() ToolPaths {
	tp := ToolPaths{
		AntigravityBrainDirs: make([]string, 0),
		ClaudeCodeDirs:       make([]string, 0),
		CodexDirs:            make([]string, 0),
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return tp
	}

	// 1. Antigravity Brain Paths
	candidateAGY := []string{
		filepath.Join(home, ".gemini", "antigravity-ide", "brain"),
	}
	if runtime.GOOS == "windows" {
		if localApp := os.Getenv("LOCALAPPDATA"); localApp != "" {
			candidateAGY = append(candidateAGY,
				filepath.Join(localApp, ".gemini", "antigravity-ide", "brain"),
				filepath.Join(localApp, "Google", "Antigravity", "brain"),
			)
		}
	}
	for _, p := range candidateAGY {
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			tp.AntigravityBrainDirs = append(tp.AntigravityBrainDirs, p)
		}
	}

	// 2. Claude Code Paths
	candidateClaude := []string{
		filepath.Join(home, ".claude"),
		filepath.Join(home, ".claude-code"),
	}
	if cwd, err := os.Getwd(); err == nil {
		candidateClaude = append(candidateClaude, filepath.Join(cwd, ".claude"))
	}
	for _, p := range candidateClaude {
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			tp.ClaudeCodeDirs = append(tp.ClaudeCodeDirs, p)
		}
	}

	// 3. Codex Paths
	candidateCodex := []string{
		filepath.Join(home, ".codex"),
	}
	if custom := os.Getenv("CODEX_HOME"); custom != "" {
		candidateCodex = append([]string{custom}, candidateCodex...)
	}
	seenCodex := make(map[string]bool)
	for _, p := range candidateCodex {
		p, _ = filepath.Abs(p)
		if seenCodex[p] {
			continue
		}
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			tp.CodexDirs = append(tp.CodexDirs, p)
			seenCodex[p] = true
		}
	}

	return tp
}
