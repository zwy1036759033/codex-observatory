package agent_watcher

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ==============================================================================
// 1. Go Interfaces for Agent Watcher Telemetry & Five Panels
// ==============================================================================

// TaskFeedProvider provides real event log streams for Window 1 (TASK FEED)
type TaskFeedProvider interface {
	GetTaskFeed(limit int) []FeedItemDTO
}

// SolverTelemetryProvider provides real telemetry vectors for Window 2 (PARTICLE SOLVER)
type SolverTelemetryProvider interface {
	GetSolverTelemetry() SolverTelemetryDTO
}

// WorkspaceCodeProvider provides real workspace runtime code for Window 3 (WORKSPACE CODE)
type WorkspaceCodeProvider interface {
	GetWorkspaceCode() WorkspaceCodeDTO
}

// AgentDispatchProvider provides real agent orchestration state for Window 4 (AGENTS DISPATCH)
type AgentDispatchProvider interface {
	GetAgentDispatchList() []AgentDispatchDTO
}

// StagePipelineProvider provides top animation network and metrics (上方的动画与顶部指标)
type StagePipelineProvider interface {
	GetStagePipelineData() StagePipelineDataDTO
}

// AgentWatcherService unifies all providers into a cohesive real-time service
type AgentWatcherService interface {
	TaskFeedProvider
	SolverTelemetryProvider
	WorkspaceCodeProvider
	AgentDispatchProvider
	StagePipelineProvider
	GetRecentAgentEvents(limit int) []AgentEvent
	GetActiveSessions() []ActiveSession
	GetFullDashboardSnapshot() DashboardSnapshotDTO
	RecordEvent(ev AgentEvent)
}

// ==============================================================================
// 2. Data Transfer Objects (DTOs) for Frontend Dashboard Panels
// ==============================================================================

// FeedItemDTO represents an item in Window 1 (TASK FEED)
type FeedItemDTO struct {
	N       int    `json:"n"`
	Verb    string `json:"verb"` // FETCH | BUILD | CHECK | AUDIT | EXEC | EDIT | PROMPT | THINK | SPAWN
	Text    string `json:"text"`
	Source  string `json:"source"`
	TimeStr string `json:"timeStr"`
}

// SolverTelemetryDTO represents real throughput metrics for Window 2 (PARTICLE SOLVER)
type SolverTelemetryDTO struct {
	EventVelocity float64 `json:"eventVelocity"` // Events per minute
	ActiveSources int     `json:"activeSources"` // Number of distinct active sources
	EventCount    int     `json:"eventCount"`    // Total events captured
	ThroughputKB  float64 `json:"throughputKB"`  // Real data rate
	Status        string  `json:"status"`        // "OPTIMAL" | "ACTIVE" | "IDLE"
	CurrentTask   string  `json:"currentTask"`   // Concise description of active task
	LastVerb      string  `json:"lastVerb"`
}

// WorkspaceCodeDTO represents real code lines for Window 3 (WORKSPACE CODE)
type WorkspaceCodeDTO struct {
	File       string   `json:"file"`      // Active file name
	AgentCode  string   `json:"agentCode"` // "AGY-01", "CLD-01", "CDX-01"
	AgentName  string   `json:"agentName"` // Agent display name
	StartLine  int      `json:"startLine"` // 1-based start line
	Lines      []string `json:"lines"`     // Actual lines from active project file
	Path       string   `json:"path"`
	Revision   string   `json:"revision"`
	UpdatedAt  int64    `json:"updatedAt"`
	ObservedAt int64    `json:"observedAt"`
	SessionID  string   `json:"sessionId"`
}

// AgentDispatchDTO represents an active AI agent or process for Window 4 (AGENTS DISPATCH)
type AgentDispatchDTO struct {
	Code       string  `json:"code"`       // e.g. "AGY-01", "CLD-01", "PROC-01"
	Name       string  `json:"name"`       // e.g. "Antigravity Agent", "Claude Code CLI"
	Source     string  `json:"source"`     // "antigravity" | "claude_code" | "codex" | "system"
	Status     string  `json:"status"`     // "busy" | "idle" | "done"
	TaskTitle  string  `json:"taskTitle"`  // e.g. "Editing paths.go", "Idle"
	Progress   float64 `json:"progress"`   // 0.0 to 1.0
	ActionType string  `json:"actionType"` // "EDIT", "EXEC", "READ", "THINK"
}

// StagePipelineDataDTO represents top animation metrics and fiber packet tags (上方的动画与指标)
type StagePipelineDataDTO struct {
	TotalEvents   int              `json:"totalEvents"`
	ActiveAgents  int              `json:"activeAgents"`
	TotalSources  int              `json:"totalSources"`
	DoneOutputs   int              `json:"doneOutputs"`
	VerifiedCount int              `json:"verifiedCount"`
	PendingCount  int              `json:"pendingCount"`
	RecentPackets []string         `json:"recentPackets"` // Tags for moving fibers in MainStage
	HotHubIndex   int              `json:"hotHubIndex"`   // 0~2 for active hub glow
	Sources       []StageSourceDTO `json:"sources"`
	Hubs          []StageHubDTO    `json:"hubs"`
}

// StageSourceDTO represents a live gateway conduit feeding into MainStage
type StageSourceDTO struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Bus      string `json:"bus"`
	Tag      string `json:"tag"`
	Active   bool   `json:"active"`
	ByteRate string `json:"byteRate"`
	HubIndex int    `json:"hubIndex"`
}

// StageHubDTO represents one of the 3 primary convergence hubs on the stage
type StageHubDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Subtitle    string  `json:"subtitle"`
	Status      string  `json:"status"`
	Quality     float64 `json:"q"`
	EventsCount int     `json:"eventsCount"`
	ActiveSrcs  int     `json:"activeSrcs"`
}

// DashboardSnapshotDTO packages all real data for instantaneous one-shot sync
type DashboardSnapshotDTO struct {
	Feed      []FeedItemDTO        `json:"feed"`
	Solver    SolverTelemetryDTO   `json:"solver"`
	Code      WorkspaceCodeDTO     `json:"code"`
	Agents    []AgentDispatchDTO   `json:"agents"`
	StageData StagePipelineDataDTO `json:"stageData"`
	Timestamp int64                `json:"timestamp"`
}

// ==============================================================================
// 3. Concrete Implementation: DefaultWatcherService
// ==============================================================================

type DefaultWatcherService struct {
	mu           sync.RWMutex
	store        *MemoryStore
	feedCounter  int
	feedItems    []FeedItemDTO
	lastCode     WorkspaceCodeDTO
	codePath     string
	codeLines    []string
	workspaceDir string
	startTime    time.Time
	wsWatcher    *WorkspaceWatcher
}

var (
	globalService     *DefaultWatcherService
	globalServiceOnce sync.Once
)

// GetWatcherService returns the singleton implementation of AgentWatcherService
func GetWatcherService(store *MemoryStore) *DefaultWatcherService {
	globalServiceOnce.Do(func() {
		cwd, _ := os.Getwd()
		globalService = &DefaultWatcherService{
			store:        store,
			feedCounter:  0,
			feedItems:    make([]FeedItemDTO, 0, 100),
			workspaceDir: cwd,
			startTime:    time.Now(),
		}
		// Initialize with default fallback workspace code
	})
	return globalService
}

// SetWorkspaceWatcher registers the WorkspaceWatcher instance for real file queries
func (s *DefaultWatcherService) SetWorkspaceWatcher(ww *WorkspaceWatcher) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.wsWatcher = ww
}

// RecordEvent processes a newly captured event and generates real telemetry items
func (s *DefaultWatcherService) RecordEvent(ev AgentEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.feedCounter++
	verb := mapActionToVerb(ev.Type, ev.Action)

	// Format concise text for TaskFeedPanel
	text := ev.Summary
	if text == "" {
		text = fmt.Sprintf("[%s] %s %s", ev.Source, ev.Action, ev.Target)
	}

	timeStr := time.UnixMilli(ev.Timestamp).Format("15:04:05")

	item := FeedItemDTO{
		N:       s.feedCounter,
		Verb:    verb,
		Text:    text,
		Source:  ev.Source,
		TimeStr: timeStr,
	}

	if len(s.feedItems) >= 100 {
		s.feedItems = s.feedItems[1:]
	}
	s.feedItems = append(s.feedItems, item)

	// If event involves a file or code, update workspace code view
	if ev.Type == EventToolCall && (ev.Action == "EDIT_FILE" || ev.Action == "CREATE_FILE" || ev.Action == "FILE_CHANGED") {
		if ev.Target != "" {
			s.updateWorkspaceCodeFromEvent(ev)
		}
	}
}

func mapActionToVerb(evType EventType, action string) string {
	switch evType {
	case EventPrompt:
		return "PROMPT"
	case EventThought:
		return "THINK"
	case EventProcess:
		return "SPAWN"
	case EventNetAPI:
		return "API"
	case EventStatus:
		if action == "TURN_COMPLETE" || action == "REPLY_COMPLETE" {
			return "DONE"
		}
		return "STATUS"
	}

	switch action {
	case "EDIT_FILE":
		return "EDIT"
	case "FILE_CHANGED":
		return "EDIT"
	case "TOOL_COMPLETE":
		return "DONE"
	case "CREATE_FILE":
		return "BUILD"
	case "RUN_CMD":
		return "EXEC"
	case "SEARCH_GREP":
		return "CHECK"
	case "READ_FILE":
		return "FETCH"
	case "WEB_FETCH":
		return "AUDIT"
	default:
		return "EXEC"
	}
}

func (s *DefaultWatcherService) updateWorkspaceCodeFromEvent(ev AgentEvent) {
	path := ev.Target
	if !filepath.IsAbs(path) && s.workspaceDir != "" {
		path = filepath.Join(s.workspaceDir, path)
	}
	s.diskCode(path, ev.Source, ev.SessionID, ev.Timestamp)
}

// SetWorkspaceDir updates the active workspace directory path
func (s *DefaultWatcherService) SetWorkspaceDir(dir string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.workspaceDir = dir
}

// UpdateWorkspaceCode sets the latest workspace code snippet
func (s *DefaultWatcherService) UpdateWorkspaceCode(dto WorkspaceCodeDTO) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lastCode = dto
}

// ------------------------------------------------------------------------------
// Implementation of TaskFeedProvider (Window 1)
// ------------------------------------------------------------------------------
func (s *DefaultWatcherService) GetTaskFeed(limit int) []FeedItemDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()

	total := len(s.feedItems)
	if total == 0 {
		return s.seedInitialFeed()
	}

	if limit <= 0 || limit > total {
		limit = total
	}

	res := make([]FeedItemDTO, limit)
	copy(res, s.feedItems[total-limit:])
	return res
}

func (s *DefaultWatcherService) seedInitialFeed() []FeedItemDTO {
	now := time.Now().Format("15:04:05")
	return []FeedItemDTO{
		{N: 1, Verb: "SPAWN", Text: "Agent Cockpit Real-time Watcher Online", Source: "system", TimeStr: now},
		{N: 2, Verb: "STATUS", Text: "Waiting for real agent activity", Source: "system", TimeStr: now},
		{N: 3, Verb: "CHECK", Text: "Local activity reader ready", Source: "system", TimeStr: now},
	}
}

// ------------------------------------------------------------------------------
// Implementation of SolverTelemetryProvider (Window 2)
// ------------------------------------------------------------------------------
func (s *DefaultWatcherService) GetSolverTelemetry() SolverTelemetryDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()

	events := s.store.GetRecent(0)
	now := time.Now().UnixMilli()

	// Calculate velocity in last 60 seconds
	recentCount := 0
	sourcesMap := make(map[string]bool)
	lastVerb := "IDLE"
	currentTask := "Idle / Standing by"

	for _, ev := range events {
		sourcesMap[ev.Source] = true
		if now-ev.Timestamp < 60000 {
			recentCount++
		}
	}

	if len(events) > 0 {
		lastEv := events[len(events)-1]
		lastVerb = mapActionToVerb(lastEv.Type, lastEv.Action)
		if lastEv.Summary != "" {
			currentTask = lastEv.Summary
		} else {
			currentTask = fmt.Sprintf("%s %s", lastEv.Action, lastEv.Target)
		}
	}

	velocity := float64(recentCount) // events per minute
	status := "IDLE"
	if velocity > 15 {
		status = "OPTIMAL"
	} else if velocity > 0 {
		status = "ACTIVE"
	}

	var eventBytes int
	for _, ev := range events {
		if now-ev.Timestamp < 60000 {
			eventBytes += len(ev.Summary) + len(ev.Target)
		}
	}
	return SolverTelemetryDTO{
		EventVelocity: velocity,
		ActiveSources: len(sourcesMap),
		EventCount:    s.feedCounter,
		ThroughputKB:  float64(eventBytes) / 1024, // Display metadata bytes in last minute; not model throughput.
		Status:        status,
		CurrentTask:   currentTask,
		LastVerb:      lastVerb,
	}
}

// ------------------------------------------------------------------------------
// Implementation of WorkspaceCodeProvider (Window 3)
// ------------------------------------------------------------------------------
func (s *DefaultWatcherService) GetWorkspaceCode() WorkspaceCodeDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.lastCode.Lines) > 0 {
		return s.lastCode
	}
	return WorkspaceCodeDTO{File: "等待 Codex 修改文件", Lines: []string{}}
}

// ------------------------------------------------------------------------------
// Implementation of AgentDispatchProvider (Window 4)
// ------------------------------------------------------------------------------
func (s *DefaultWatcherService) GetAgentDispatchList() []AgentDispatchDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sessions := s.store.GetSessions()
	events := s.store.GetRecent(30)
	now := time.Now().UnixMilli()

	// Base known agent profiles
	profiles := []struct {
		code   string
		name   string
		source string
	}{
		{"AGY-01", "AGY Core", "antigravity"},
		{"AGY-02", "Subagent", "antigravity"},
		{"CLD-01", "Claude CLI", "claude_code"},
		{"CDX-01", "Codex", "codex"},
		{"PR-BLD", "Compiler", "system"},
		{"PR-DEV", "Vite Dev", "system"},
		{"FS-MON", "Dir Watch", "system"},
		{"NET-SN", "IPC Sync", "system"},
		{"TEL-SYS", "Telemetry", "system"},
		{"SEC-LOK", "Lock Guard", "system"},
		{"EVT-BUS", "Event Bus", "system"},
		{"LOG-TLR", "Log Tailer", "antigravity"},
	}

	result := make([]AgentDispatchDTO, 0, len(profiles))

	for _, prof := range profiles {
		status := "idle"
		taskTitle := "Standing by"
		progress := 0.0
		actionType := "WAIT"

		// Match against active sessions or recent events
		for i := len(events) - 1; i >= 0; i-- {
			ev := events[i]
			if ev.Source == prof.source && now-ev.Timestamp < 30000 {
				status = "busy"
				taskTitle = ev.Summary
				if len([]rune(taskTitle)) > 60 {
					taskTitle = string([]rune(taskTitle)[:60]) + "..."
				}
				actionType = string(ev.Type)
				progress = -1 // Indeterminate activity; Codex does not report a completion percentage.
				break
			}
		}

		// Also check sessions
		for _, sess := range sessions {
			if sess.Source == prof.source && sess.Status == "active" {
				status = "busy"
				if taskTitle == "Standing by" {
					taskTitle = sess.Title
				}
				break
			}
		}
		if prof.source == "codex" {
			status = "idle"
			for _, sess := range sessions {
				if sess.Source == "codex" && sess.Status == "active" {
					status = "busy"
					break
				}
			}
			if status == "idle" {
				progress = 0
			}
		}

		result = append(result, AgentDispatchDTO{
			Code:       prof.code,
			Name:       prof.name,
			Source:     prof.source,
			Status:     status,
			TaskTitle:  taskTitle,
			Progress:   progress,
			ActionType: actionType,
		})
	}

	return result
}

// ------------------------------------------------------------------------------
// Implementation of StagePipelineProvider (Top Animation & Metric Rail)
// ------------------------------------------------------------------------------
func (s *DefaultWatcherService) GetStagePipelineData() StagePipelineDataDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()
	events := s.store.GetRecent(0)
	sessions := s.store.GetSessions()
	now := time.Now().UnixMilli()
	counts := map[string]int{}
	recentCounts := map[string]int{}
	completed, failed := 0, 0
	packets := []string{}
	hotHub := 1
	for _, ev := range events {
		counts[ev.Source]++
		if now-ev.Timestamp < 60000 {
			recentCounts[ev.Source]++
		}
		if ev.Action == "TOOL_COMPLETE" {
			completed++
		}
		if value, ok := ev.Details["exitCode"]; ok && value != 0 {
			failed++
		}
		if ev.Source == "workspace" {
			hotHub = 2
		} else if ev.Source == "antigravity" {
			hotHub = 0
		} else {
			hotHub = 1
		}
		tag := codexLabel(ev.Action + " " + ev.Target)
		runes := []rune(tag)
		if len(runes) > 36 {
			tag = string(runes[:36]) + "…"
		}
		packets = append(packets, tag)
	}
	if len(packets) > 16 {
		packets = packets[len(packets)-16:]
	}
	active := 0
	for _, session := range sessions {
		if session.Status == "active" {
			active++
		}
	}
	sources := []StageSourceDTO{}
	for i, key := range []string{"antigravity", "claude_code", "codex", "workspace", "process", "system"} {
		name := map[string]string{"antigravity": "ANTIGRAVITY", "claude_code": "CLAUDE CODE", "codex": "OPENAI CODEX", "workspace": "WORKSPACE FILES", "process": "LOCAL PROCESSES", "system": "SYSTEM"}[key]
		hub := 1
		if key == "antigravity" {
			hub = 0
		}
		if key == "workspace" || key == "system" {
			hub = 2
		}
		sources = append(sources, StageSourceDTO{ID: fmt.Sprintf("SRC-%03d", i+1), Name: name, Bus: "LOCAL / READ ONLY", Tag: "OBSERVED ACTIVITY", Active: recentCounts[key] > 0, ByteRate: fmt.Sprintf("%d ev/min", recentCounts[key]), HubIndex: hub})
	}
	hubs := []StageHubDTO{}
	for i, group := range [][]string{{"antigravity"}, {"claude_code", "codex", "process"}, {"workspace", "system"}} {
		count, activeSources := 0, 0
		for _, key := range group {
			count += counts[key]
			if recentCounts[key] > 0 {
				activeSources++
			}
		}
		status := "IDLE"
		if activeSources > 0 {
			status = "ACTIVE"
		}
		names := []string{"AGENT ACTIVITY", "CODEX & TOOL EXECUTION", "WORKSPACE & SYSTEM"}
		hubs = append(hubs, StageHubDTO{ID: fmt.Sprintf("HUB-%02d", i+1), Name: names[i], Subtitle: "Observed local events · no model reasoning", Status: status, Quality: -1, EventsCount: count, ActiveSrcs: activeSources})
	}
	return StagePipelineDataDTO{TotalEvents: s.feedCounter, ActiveAgents: active, TotalSources: len(sources), DoneOutputs: completed, VerifiedCount: failed, PendingCount: 0, RecentPackets: packets, HotHubIndex: hotHub, Sources: sources, Hubs: hubs}
}

// ------------------------------------------------------------------------------
// Implementation of SystemTelemetryProvider (Window 5)
// ------------------------------------------------------------------------------
type SystemTelemetryDTO struct {
	CPUPercent  float64 `json:"cpuPercent"`
	MemPercent  float64 `json:"memPercent"`
	DiskPercent float64 `json:"diskPercent"`
	Status      string  `json:"status"`
}

func (s *DefaultWatcherService) GetSystemTelemetry() SystemTelemetryDTO {
	return SystemTelemetryDTO{
		Status: "LIVE",
	}
}

// GetRecentAgentEvents returns raw AgentEvents
func (s *DefaultWatcherService) GetRecentAgentEvents(limit int) []AgentEvent {
	return s.store.GetRecent(limit)
}

// GetActiveSessions returns active sessions
func (s *DefaultWatcherService) GetActiveSessions() []ActiveSession {
	return s.store.GetSessions()
}

// GetFullDashboardSnapshot packages all 5 windows and top animation into a single snapshot
func (s *DefaultWatcherService) GetFullDashboardSnapshot() DashboardSnapshotDTO {
	return DashboardSnapshotDTO{
		Feed:      s.GetTaskFeed(25),
		Solver:    s.GetSolverTelemetry(),
		Code:      s.GetWorkspaceCode(),
		Agents:    s.GetAgentDispatchList(),
		StageData: s.GetStagePipelineData(),
		Timestamp: time.Now().UnixMilli(),
	}
}
