# Local Codex activity adapter and selectable visuals

## Delivered build (2026-11-07)

Both visual styles include optional spider/energy trails and nebula depth, adapted from Kirito14IT/prompt-spider-ui (MIT). They share the original canvas clock and independent persistent switches. Main titles are CODEX. The removed memory hub, its process and database dependencies are absent. Live code previews follow actual saved Codex file changes, including the current desktop path-map schema; no demo or idle random-file rotation is used. TASK FEED shows actual normalized calls and sanitized shell operation labels.

Single-instance enforcement, fixed WebView2 profiles, bounded reads, coalesced snapshots and explicit render/subscription cleanup remain in place. Startup is enabled unless STARTUP-PAUSED is deliberately present. Prior incident root cause and long-term stability have not been established by short validation runs.

Changes: Codex JSONL tailer, focused-thread launcher, public-message/tool metadata allowlist, desktop nested-tool events, partial-line/rotation handling, bounded reads, accurate idle/lifecycle state, no invented completion percentages, and directory-switch deadlock fix.

The frontend provides a mouse-directed light-ring renderer and the original AgentCockpit stage, selected in CONSOLE / 视觉风格. The setting is persisted by SetVisualStyle to config.yaml. Mouse camera uses exponential smoothing, clamped travel and returns to overview on pointer leave; fixed timed shots are not executed. A reduced-motion preference decreases camera travel. Pause stops animation while activity ingestion continues.

Display mode changes do not arm password protection: normal windows, fullscreen display and wallpaper remain interactive. Only the explicit lock action or configured lock timer arms protection. Wallpaper/config events clear stale lock state. Manual locking retains its Chinese unlock dialog and accepts only the configured password. Particle RERUN regenerates particles, clears vortices, resets simulation time/steps and restores advection with visible reset feedback.

## Build

Use the Go version in go.mod and Node/npm:

    npm ci
    npm run build
    go test ./...
    go build -tags desktop,production -ldflags "-H windowsgui -s -w" -o Codex-Observatory.exe .

Launch with AGENT_COCKPIT_CODEX_THREAD set to the desired thread UUID, or leave it unset for recent local sessions. CODEX_HOME is honored if already set, with the usual home/.codex location also discovered. A diagnostic is available with go run ./cmd/codex-probe (counts only, no transcript text).

## Upstream notices

Original AgentCockpit: https://github.com/levywang/AgentCockpit (MIT, see LICENSE).

Required Notice: Copyright (c) 2026 Ryder191 (RYDER CODE / Ms MAIKEBAIs CAT) - https://github.com/Ryder191/haloflux

Required Notice: Noncommercial use only. Any commercial use is strictly prohibited. No commercial licenses are offered.

The rendering module is adapted from HALOFLUX lab.html. Its full license is in licenses/HALOFLUX-LICENSE.txt and original project documentation in licenses/HALOFLUX-README.md. Modifications isolate the renderer lifecycle and connect public Codex telemetry, mouse camera, pause and speed. UI title branding is omitted at the user's request; upstream notices are retained in files and author credit remains visible. This combined distribution is for noncommercial use only; backend MIT licensing remains as noted in its files.

Publication note: the private focused-chat launcher is not distributed. Original AgentCockpit MIT terms are preserved at licenses/AGENTCOCKPIT-LICENSE.txt; see root LICENSE for the combined distribution notice. Startup now recovers the most recent verified edit from a bounded additional 2 MiB metadata window so real project words survive a short-feed replay gap.
