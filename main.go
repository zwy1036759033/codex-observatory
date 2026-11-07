package main

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"

	"agent-cockpit/internal/config"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:dist
var assets embed.FS

func main() {
	// Leave an incident-affected installation stopped until explicitly re-enabled.
	if exe, err := os.Executable(); err == nil {
		if _, err := os.Stat(filepath.Join(filepath.Dir(exe), "STARTUP-PAUSED")); err == nil {
			return
		}
	}
	// Parse console options and interactive prompts
	cfg := config.ParseConfig()

	// Create an instance of the app structure
	app := NewApp(cfg)

	// A single instance reuses one profile instead of creating a cache per PID.
	dataRoot := filepath.Join(os.Getenv("LOCALAPPDATA"), "AgentCockpit")
	_ = os.MkdirAll(dataRoot, 0755)
	wvDataDir := filepath.Join(dataRoot, "wv2_shared")
	instanceID := "codex-local-observatory-main"
	if cfg.IsChild {
		instanceID = fmt.Sprintf("codex-local-observatory-screen-%d", cfg.MonitorIndex)
		wvDataDir = filepath.Join(dataRoot, fmt.Sprintf("wv2_child_%d", cfg.MonitorIndex))
	}

	winOpts := &options.App{
		Title:  "CODEX - Local Observatory",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 3, G: 6, B: 5, A: 1},
		OnStartup:        app.startup,
		SingleInstanceLock: &options.SingleInstanceLock{UniqueId: instanceID, OnSecondInstanceLaunch: func(_ options.SecondInstanceData) {
			if app.ctx != nil {
				runtime.WindowShow(app.ctx)
				runtime.WindowUnminimise(app.ctx)
			}
		}},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewUserDataPath: wvDataDir,
		},
	}

	// Configure initial window presentation based on mode (Default: Windowed mode)
	if cfg.Mode == "wallpaper" {
		winOpts.Frameless = true
		winOpts.AlwaysOnTop = false
		winOpts.WindowStartState = options.Normal
	} else if cfg.Mode == "lock" {
		winOpts.Frameless = true
		winOpts.AlwaysOnTop = false
		winOpts.WindowStartState = options.Fullscreen
	} else {
		// Default: Windowed mode (1280x800, centered)
		winOpts.Frameless = false
		winOpts.AlwaysOnTop = false
		winOpts.WindowStartState = options.Normal
	}

	// Create application with options
	err := wails.Run(winOpts)

	if err != nil {
		fmt.Printf("[!] Wails Run Error: %v\n", err)
	}
}
