package main

import (
	"agent-cockpit/internal/config"
	"testing"
)

func TestVisualStylePersistsAcrossRestart(t *testing.T) {
	t.Chdir(t.TempDir())
	app := NewApp(config.DefaultConfig())
	for _, style := range []string{"cockpit", "haloflux"} {
		if err := app.SetVisualStyle(style); err != nil {
			t.Fatal(err)
		}
		restored, ok := config.LoadConfigFile()
		if !ok || restored.VisualStyle != style {
			t.Fatalf("style not restored: %+v", restored)
		}
	}
	if err := app.SetVisualStyle("invalid"); err == nil {
		t.Fatal("invalid style accepted")
	}
	restored, _ := config.LoadConfigFile()
	if restored.VisualStyle != "haloflux" {
		t.Fatal("invalid style altered saved configuration")
	}
}
