package agent_watcher

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// WorkspaceWatcher monitors a user-specified directory for real source code modifications
type WorkspaceWatcher struct {
	mu          sync.Mutex
	ctx         context.Context
	cancel      context.CancelFunc
	fsWatcher   *fsnotify.Watcher
	currentDir  string
	service     *DefaultWatcherService
	onEvent     func(AgentEvent)
	recentFiles []string
	lastActive  time.Time
}

var (
	ignoredDirs = map[string]bool{
		".git":              true,
		"node_modules":      true,
		"dist":              true,
		"build":             true,
		"bin":               true,
		".next":             true,
		".gemini":           true,
		".idea":             true,
		".vscode":           true,
		"vendor":            true,
		"target":            true,
		".system_generated": true,
		"wailsjs":           true,
		"tmp":               true,
	}

	validExts = map[string]bool{
		".go":   true,
		".ts":   true,
		".tsx":  true,
		".js":   true,
		".mjs":  true,
		".cjs":  true,
		".jsx":  true,
		".py":   true,
		".json": true,
		".yaml": true,
		".yml":  true,
		".css":  true,
		".html": true,
		".md":   true,
		".rs":   true,
		".c":    true,
		".cpp":  true,
		".h":    true,
		".sql":  true,
		".sh":   true,
		".ps1":  true,
	}
)

// NewWorkspaceWatcher creates and starts a directory filesystem monitor
func NewWorkspaceWatcher(ctx context.Context, initialDir string, service *DefaultWatcherService, onEvent func(AgentEvent)) *WorkspaceWatcher {
	wCtx, cancel := context.WithCancel(ctx)
	absDir, err := filepath.Abs(initialDir)
	if err != nil || absDir == "" {
		absDir, _ = os.Getwd()
	}

	ww := &WorkspaceWatcher{
		ctx:        wCtx,
		cancel:     cancel,
		currentDir: absDir,
		service:    service,
		onEvent:    onEvent,
		lastActive: time.Now(),
	}

	service.SetWorkspaceDir(absDir)
	ww.start()
	return ww
}

// SetDirectory dynamically switches the monitored workspace directory
func (ww *WorkspaceWatcher) SetDirectory(dir string) error {
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	info, err := os.Stat(absDir)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("directory does not exist: %s", absDir)
	}
	ww.mu.Lock()

	if absDir == ww.currentDir && ww.fsWatcher != nil {
		ww.mu.Unlock()
		return nil
	}

	ww.currentDir = absDir
	ww.service.SetWorkspaceDir(absDir)

	// Close old watcher if active
	if ww.fsWatcher != nil {
		_ = ww.fsWatcher.Close()
		ww.fsWatcher = nil
	}

	// Rescan files and start watching new directory
	ww.scanInitialFiles()
	ww.initFsWatcher()
	ww.lastActive = time.Now()

	// loadFileContent locks ww.mu itself and emits into the dashboard. Release
	// here so changing directories cannot stop the entire supervisor poll loop.
	ww.mu.Unlock()

	if ww.onEvent != nil {
		ww.onEvent(AgentEvent{Timestamp: time.Now().UnixMilli(), Source: "workspace", Type: EventStatus, Action: "WORKSPACE_CHANGED", Target: absDir, Summary: "已切换文件监视目录；等待实际代码修改"})
	}
	return nil
}

// GetDirectory returns the current monitored directory
func (ww *WorkspaceWatcher) GetDirectory() string {
	ww.mu.Lock()
	defer ww.mu.Unlock()
	return ww.currentDir
}

func (ww *WorkspaceWatcher) start() {
	ww.mu.Lock()
	ww.scanInitialFiles()
	ww.initFsWatcher()
	ww.mu.Unlock()
	go func() {
		<-ww.ctx.Done()
		ww.mu.Lock()
		if ww.fsWatcher != nil {
			_ = ww.fsWatcher.Close()
			ww.fsWatcher = nil
		}
		ww.mu.Unlock()
	}()

}

func (ww *WorkspaceWatcher) scanInitialFiles() {
	ww.recentFiles = make([]string, 0, 50)
	root := ww.currentDir

	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if ignoredDirs[name] || (strings.HasPrefix(name, ".") && name != ".") {
				return filepath.SkipDir
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if validExts[ext] {
			rel, relErr := filepath.Rel(root, path)
			if relErr == nil {
				ww.recentFiles = append(ww.recentFiles, rel)
			}
			if len(ww.recentFiles) >= 80 {
				return fs.SkipAll
			}
		}
		return nil
	})
}

func (ww *WorkspaceWatcher) initFsWatcher() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		fmt.Printf("[!] WorkspaceWatcher error creating fsnotify watcher: %v\n", err)
		return
	}
	ww.fsWatcher = watcher

	// Add subdirectories recursively
	root := ww.currentDir
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			name := d.Name()
			if ignoredDirs[name] || (strings.HasPrefix(name, ".") && name != ".") {
				return filepath.SkipDir
			}
			_ = watcher.Add(path)
		}
		return nil
	})

	go ww.listenEvents(watcher)
}

func (ww *WorkspaceWatcher) listenEvents(watcher *fsnotify.Watcher) {
	debounceMap := make(map[string]*time.Timer)
	var dMu sync.Mutex
	defer func() {
		dMu.Lock()
		defer dMu.Unlock()
		for _, timer := range debounceMap {
			timer.Stop()
		}
	}()

	for {
		select {
		case <-ww.ctx.Done():
			return
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			_ = err
		case ev, ok := <-watcher.Events:
			if !ok {
				return
			}

			// Add new subdirectories dynamically
			if ev.Op&fsnotify.Create != 0 {
				if fi, err := os.Stat(ev.Name); err == nil && fi.IsDir() {
					name := fi.Name()
					if !ignoredDirs[name] && !strings.HasPrefix(name, ".") {
						_ = watcher.Add(ev.Name)
					}
					continue
				}
			}

			// Filter source files
			ext := strings.ToLower(filepath.Ext(ev.Name))
			if !validExts[ext] {
				continue
			}

			// Debounce writes
			dMu.Lock()
			if t, exists := debounceMap[ev.Name]; exists {
				t.Stop()
			}
			fileName := ev.Name
			debounceMap[fileName] = time.AfterFunc(100*time.Millisecond, func() {
				dMu.Lock()
				delete(debounceMap, fileName)
				dMu.Unlock()

				ww.onFileChanged(fileName)
			})
			dMu.Unlock()
		}
	}
}

func (ww *WorkspaceWatcher) onFileChanged(fullPath string) {
	ww.mu.Lock()
	ww.lastActive = time.Now()
	root := ww.currentDir
	ww.mu.Unlock()

	rel, err := filepath.Rel(root, fullPath)
	if err != nil {
		rel = filepath.Base(fullPath)
	}

	// Update recent files list
	ww.mu.Lock()
	found := false
	for _, f := range ww.recentFiles {
		if f == rel {
			found = true
			break
		}
	}
	if !found {
		ww.recentFiles = append([]string{rel}, ww.recentFiles...)
		if len(ww.recentFiles) > 100 {
			ww.recentFiles = ww.recentFiles[:100]
		}
	}
	ww.mu.Unlock()

	ww.loadFileContent(rel, true)
}

// GetRecentFiles returns a copy of recently modified file paths
func (ww *WorkspaceWatcher) GetRecentFiles() []string {
	if ww == nil {
		return nil
	}
	ww.mu.Lock()
	defer ww.mu.Unlock()
	res := make([]string, len(ww.recentFiles))
	copy(res, ww.recentFiles)
	return res
}

func (ww *WorkspaceWatcher) loadFileContent(relPath string, emitEvent bool) {
	ww.mu.Lock()
	root := ww.currentDir
	ww.mu.Unlock()

	fullPath := filepath.Join(root, relPath)
	ww.service.PreviewFile(fullPath)

	if emitEvent && ww.onEvent != nil {
		ww.onEvent(AgentEvent{
			Timestamp: time.Now().UnixMilli(),
			Source:    "workspace",
			Type:      EventToolCall,
			Action:    "file_modify",
			Target:    filepath.ToSlash(relPath),
			Summary:   fmt.Sprintf("文件已更新 · %s", filepath.Base(relPath)),
		})
	}
}
