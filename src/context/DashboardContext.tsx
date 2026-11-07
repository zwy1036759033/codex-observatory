import React, { createContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type {
  ThemeMode,
  AppMode,
  TaskItem,
  AgentItem,
  WorkflowItem,
  FeedItem,
  SolverTelemetry,
  WorkspaceCodeData,
  AgentDispatchItem,
  StagePipelineData,
  DashboardSnapshot
} from '../types';
import { CONFIG, mulberry32 } from '../constants/config';
import { createSnapshotGate, subscribeRuntime } from '../utils/activity-bridge.js';

interface DashboardContextType {
	visualStyle: 'haloflux' | 'cockpit';
	updateVisualStyle: (style: 'haloflux' | 'cockpit') => Promise<void>;
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  mode: AppMode;
  setMode: (m: AppMode) => void;
  updateMode: (m: AppMode) => void;
  autoLockMinutes: number;
  updateAutoLockMinutes: (mins: number) => void;
  lockOnStartup: boolean;
  updateLockOnStartup: (val: boolean) => void;
  aiWatcherEnabled: boolean;
  updateAiWatcherEnabled: (val: boolean) => void;
  workspaceDir: string;
  updateWorkspaceDir: (dir: string) => Promise<{ success: boolean; message: string }>;

  // Visual Effects state and mutators
  tvNoiseEffect: boolean;
  updateTvNoiseEffect: (val: boolean) => void;
  mosaicEffect: boolean;
  updateMosaicEffect: (val: boolean) => void;
  scanlineEffect: boolean;
  updateScanlineEffect: (val: boolean) => void;
  triggerTvFlicker: () => void;
  tvFlickerCount: number;

  isPaused: boolean;
  setIsPaused: (p: boolean) => void;
  togglePause: () => void;
  animSpeed: number;
  setAnimSpeed: (s: number) => void;
  isLocked: boolean;
  setIsLocked: (l: boolean) => void;
  isLockModalOpen: boolean;
  openLockModal: () => void;
  closeLockModal: () => void;
  unlockWithPasscode: (code: string) => boolean;
  configPasscode: string;

  // Web Frontend Console state and mutators
  isConsoleOpen: boolean;
  openConsole: () => void;
  closeConsole: () => void;
  updatePasscode: (code: string) => void;
  updateSpeed: (speed: number) => void;
  updateTheme: (theme: ThemeMode) => void;

  // Simulation Data
  tasks: TaskItem[];
  agents: AgentItem[];
  wfs: WorkflowItem[];
  feed: FeedItem[];
  hubWf: number[];
  hubCh: number[];
  hoverHub: number;
  setHoverHub: (idx: number) => void;

  // Code Typewriter state

  // Metrics
  cfl: number;
  stepN: number;
  setStepN: React.Dispatch<React.SetStateAction<number>>;
  clockStr: string;
  hiIdx: number;
  simT: number;

  // Real AI Watcher Telemetry & Five Windows State
  realFeed: FeedItem[];
  realSolver: SolverTelemetry;
  realCode: WorkspaceCodeData;
  realAgents: AgentDispatchItem[];
  realStageData: StagePipelineData;
  isWatcherLive: boolean;

  // Actions
  triggerHubImpact: (hubIdx: number) => void;
  hubImpacts: number[];
}

export const DashboardContext = createContext<DashboardContextType | null>(null);

const R = mulberry32(20261016);
const NW = CONFIG.workflows.length;

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visualStyle, setVisualStyle] = useState<'haloflux' | 'cockpit'>(() => localStorage.getItem('agent-cockpit-visual-style') === 'cockpit' ? 'cockpit' : 'haloflux');
  const updateVisualStyle = useCallback(async (style: 'haloflux' | 'cockpit') => {
    const backend = (window as any).go?.main?.App;
    if (backend?.SetVisualStyle) await backend.SetVisualStyle(style);
    localStorage.setItem('agent-cockpit-visual-style', style);
    setVisualStyle(style);
  }, []);
  useEffect(() => { document.documentElement.dataset.visualStyle = visualStyle; }, [visualStyle]);
  // 1. Controls State
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agent-cockpit-theme') as ThemeMode;
      if (saved) return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });
  const [isPaused, setIsPaused] = useState(false);
  const [animSpeed, setAnimSpeed] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agent-cockpit-speed');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return 1.0;
  });
  const [isLocked, setIsLocked] = useState(false);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [configPasscode, setConfigPasscode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('agent-cockpit-passcode');
      if (saved) return saved;
    }
    return '1234';
  });

  // Mode and lock screen / wallpaper options (Default: Windowed mode)
  const [mode, setMode] = useState<AppMode>('windowed');
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(0);
  const [lockOnStartup, setLockOnStartup] = useState<boolean>(false);
  useEffect(() => {
    if (mode !== 'lock') { setIsLocked(false); setIsLockModalOpen(false); }
  }, [mode]);
  const [aiWatcherEnabled, setAiWatcherEnabled] = useState<boolean>(true);
  const [workspaceDir, setWorkspaceDir] = useState<string>('');

  // Visual Effects states
  const [tvNoiseEffect, setTvNoiseEffect] = useState<boolean>(false);
  const [mosaicEffect, setMosaicEffect] = useState<boolean>(false);
  const [scanlineEffect, setScanlineEffect] = useState<boolean>(false);
  const [tvFlickerCount, setTvFlickerCount] = useState<number>(0);

  const triggerTvFlicker = useCallback(() => {
    setTvFlickerCount(c => c + 1);
  }, []);

  const openConsole = useCallback(() => setIsConsoleOpen(true), []);
  const closeConsole = useCallback(() => {
    setIsConsoleOpen(false);
    if (mode === 'wallpaper') {
      const w = window as any;
      if (w.go?.main?.App?.SendToWallpaper) {
        w.go.main.App.SendToWallpaper().catch(console.error);
      }
    }
  }, [mode]);

  const updatePasscode = useCallback((code: string) => {
    const clean = code.trim();
    if (!clean) return;
    setConfigPasscode(clean);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agent-cockpit-passcode', clean);
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: clean,
          speed: animSpeed,
          theme,
          mode,
          autoLockMinutes,
          lockOnStartup,
          aiWatcherEnabled,
          tvNoiseEffect,
          mosaicEffect,
          scanlineEffect,
          workspaceDir
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, animSpeed, autoLockMinutes, lockOnStartup, mode, mosaicEffect, scanlineEffect, theme, tvNoiseEffect, workspaceDir]);

  const updateSpeed = useCallback((s: number) => {
    const val = Math.max(0.1, Math.min(10.0, s));
    setAnimSpeed(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agent-cockpit-speed', String(val));
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: val,
          theme,
          mode,
          autoLockMinutes,
          lockOnStartup,
          aiWatcherEnabled,
          tvNoiseEffect,
          mosaicEffect,
          scanlineEffect,
          workspaceDir
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, autoLockMinutes, configPasscode, lockOnStartup, mode, mosaicEffect, scanlineEffect, theme, tvNoiseEffect, workspaceDir]);

  const updateTheme = useCallback((t: ThemeMode) => {
    setTheme(t);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agent-cockpit-theme', t);
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: animSpeed,
          theme: t,
          mode,
          autoLockMinutes,
          lockOnStartup,
          aiWatcherEnabled,
          tvNoiseEffect,
          mosaicEffect,
          scanlineEffect,
          workspaceDir
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, animSpeed, autoLockMinutes, configPasscode, lockOnStartup, mode, mosaicEffect, scanlineEffect, tvNoiseEffect, workspaceDir]);

  const updateMode = useCallback((m: AppMode) => {
    setMode(m);
    // Display mode and password protection are separate actions.
    setIsLocked(false);
    setIsLockModalOpen(false);
    if (m === 'wallpaper') {
      setIsLocked(false);
      setIsLockModalOpen(false);
      setIsConsoleOpen(false);
    }
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.SetMode) {
        w.go.main.App.SetMode(m).catch(console.error);
      }
    }
  }, []);

  const updateAutoLockMinutes = useCallback((mins: number) => {
    setAutoLockMinutes(mins);
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: animSpeed,
          theme,
          mode,
          autoLockMinutes: mins,
          lockOnStartup,
          aiWatcherEnabled,
          tvNoiseEffect,
          mosaicEffect,
          scanlineEffect
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, animSpeed, configPasscode, lockOnStartup, mode, mosaicEffect, scanlineEffect, theme, tvNoiseEffect]);

  const updateLockOnStartup = useCallback((val: boolean) => {
    setLockOnStartup(val);
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: animSpeed,
          theme,
          mode,
          autoLockMinutes,
          lockOnStartup: val,
          aiWatcherEnabled,
          tvNoiseEffect,
          mosaicEffect,
          scanlineEffect
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, animSpeed, autoLockMinutes, configPasscode, mode, mosaicEffect, scanlineEffect, theme, tvNoiseEffect]);

  const updateAiWatcherEnabled = useCallback((val: boolean) => {
    setAiWatcherEnabled(val);
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: animSpeed,
          theme,
          mode,
          autoLockMinutes,
          lockOnStartup,
          aiWatcherEnabled: val,
          tvNoiseEffect,
          mosaicEffect,
          scanlineEffect
        }).catch(console.error);
      }
    }
  }, [animSpeed, autoLockMinutes, configPasscode, lockOnStartup, mode, mosaicEffect, scanlineEffect, theme, tvNoiseEffect]);

  const updateTvNoiseEffect = useCallback((val: boolean) => {
    setTvNoiseEffect(val);
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: animSpeed,
          theme,
          mode,
          autoLockMinutes,
          lockOnStartup,
          aiWatcherEnabled,
          tvNoiseEffect: val,
          mosaicEffect,
          scanlineEffect
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, animSpeed, autoLockMinutes, configPasscode, lockOnStartup, mode, mosaicEffect, scanlineEffect, theme]);

  const updateMosaicEffect = useCallback((val: boolean) => {
    setMosaicEffect(val);
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: animSpeed,
          theme,
          mode,
          autoLockMinutes,
          lockOnStartup,
          aiWatcherEnabled,
          tvNoiseEffect,
          mosaicEffect: val,
          scanlineEffect
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, animSpeed, autoLockMinutes, configPasscode, lockOnStartup, mode, scanlineEffect, theme, tvNoiseEffect]);

  const updateScanlineEffect = useCallback((val: boolean) => {
    setScanlineEffect(val);
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.UpdateConfig) {
        w.go.main.App.UpdateConfig({
          passcode: configPasscode,
          speed: animSpeed,
          theme,
          mode,
          autoLockMinutes,
          lockOnStartup,
          aiWatcherEnabled,
          tvNoiseEffect,
          mosaicEffect,
          scanlineEffect: val,
          workspaceDir
        }).catch(console.error);
      }
    }
  }, [aiWatcherEnabled, animSpeed, autoLockMinutes, configPasscode, lockOnStartup, mode, mosaicEffect, theme, tvNoiseEffect, workspaceDir]);

  const updateWorkspaceDir = useCallback(async (dir: string): Promise<{ success: boolean; message: string }> => {
    const clean = dir.trim();
    if (!clean) return { success: false, message: '工作空间目录不能为空' };
    setWorkspaceDir(clean);
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.go?.main?.App?.SetWorkspaceDir) {
        try {
          const res = await w.go.main.App.SetWorkspaceDir(clean);
          const resolved = typeof res === 'string' ? res : clean;
          setWorkspaceDir(resolved);
          return { success: true, message: resolved };
        } catch (err: any) {
          const msg = err?.message || String(err);
          return { success: false, message: msg };
        }
      }
    }
    return { success: true, message: clean };
  }, []);

  // Synchronize configuration from Wails Go Backend if available
  useEffect(() => {
    const cancellations: (() => void)[] = [];
    if (typeof window !== 'undefined') {
      const w = window as any;
      const on = (event: string, handler: (...args: any[]) => void) => cancellations.push(subscribeRuntime(w.runtime, event, handler));
      if (w.go?.main?.App?.GetConfig) {
        w.go.main.App.GetConfig()
          .then((cfg: any) => {
            if (cfg) {
              if (cfg.theme === 'dark' || cfg.theme === 'light') setTheme(cfg.theme);
              if (typeof cfg.speed === 'number' && cfg.speed > 0) setAnimSpeed(cfg.speed);
              if (cfg.passcode) setConfigPasscode(cfg.passcode);
              if (cfg.mode) {
                setMode(cfg.mode);
                if (cfg.mode === 'windowed' || cfg.mode === 'wallpaper') {
                  setIsLocked(false);
                  setIsLockModalOpen(false);
                } else if (cfg.mode === 'lock') {
                  setIsLocked(cfg.lockOnStartup === true);
                }
              } else {
                setMode('windowed');
                setIsLocked(false);
                setIsLockModalOpen(false);
              }
              if (typeof cfg.autoLockMinutes === 'number') setAutoLockMinutes(cfg.autoLockMinutes);
              if (typeof cfg.lockOnStartup === 'boolean') setLockOnStartup(cfg.lockOnStartup);
              if (typeof cfg.aiWatcherEnabled === 'boolean') setAiWatcherEnabled(cfg.aiWatcherEnabled);
              if (typeof cfg.tvNoiseEffect === 'boolean') setTvNoiseEffect(cfg.tvNoiseEffect);
              if (typeof cfg.mosaicEffect === 'boolean') setMosaicEffect(cfg.mosaicEffect);
              if (typeof cfg.scanlineEffect === 'boolean') setScanlineEffect(cfg.scanlineEffect);
              if (cfg.workspaceDir) setWorkspaceDir(cfg.workspaceDir);
              if (cfg.visualStyle === 'haloflux' || cfg.visualStyle === 'cockpit') setVisualStyle(cfg.visualStyle);
            }
          })
          .catch((err: any) => console.error('Failed to load Wails config:', err));
      }

      if (w.go?.main?.App?.GetWorkspaceDir) {
        w.go.main.App.GetWorkspaceDir()
          .then((dir: string) => {
            if (dir) setWorkspaceDir(dir);
          })
          .catch(() => {});
      }

      if (w.runtime?.EventsOn) {
        on('toggle-pause', () => {
          setIsPaused(p => !p);
        });
        on('unlock', () => {
          setIsLocked(false);
          setIsLockModalOpen(false);
        });
        on('mode-changed', (m: AppMode) => {
          setMode(m);
          if (m !== 'lock') {
            setIsLocked(false);
            setIsLockModalOpen(false);
            if (m === 'wallpaper') setIsConsoleOpen(false);
          }
        });
        on('open-console', () => {
          setIsConsoleOpen(true);
        });
        on('arm-lock', () => {
          setMode('lock');
          setIsLocked(true);
          setIsLockModalOpen(true);
        });
        on('toggle-theme', () => {
          setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
        });
        on('config-updated', (cfg: any) => {
          if (cfg) {
            if (cfg.theme === 'dark' || cfg.theme === 'light') setTheme(cfg.theme);
            if (typeof cfg.speed === 'number' && cfg.speed > 0) setAnimSpeed(cfg.speed);
            if (cfg.passcode) setConfigPasscode(cfg.passcode);
            if (cfg.mode) {
              setMode(cfg.mode);
              if (cfg.mode !== 'lock') { setIsLocked(false); setIsLockModalOpen(false); }
            }
            if (typeof cfg.autoLockMinutes === 'number') setAutoLockMinutes(cfg.autoLockMinutes);
            if (typeof cfg.lockOnStartup === 'boolean') setLockOnStartup(cfg.lockOnStartup);
            if (typeof cfg.aiWatcherEnabled === 'boolean') setAiWatcherEnabled(cfg.aiWatcherEnabled);
            if (typeof cfg.tvNoiseEffect === 'boolean') setTvNoiseEffect(cfg.tvNoiseEffect);
            if (typeof cfg.mosaicEffect === 'boolean') setMosaicEffect(cfg.mosaicEffect);
            if (typeof cfg.scanlineEffect === 'boolean') setScanlineEffect(cfg.scanlineEffect);
            if (cfg.workspaceDir) setWorkspaceDir(cfg.workspaceDir);
            if (cfg.visualStyle === 'haloflux' || cfg.visualStyle === 'cockpit') setVisualStyle(cfg.visualStyle);
          }
        });
      }
    }
    return () => cancellations.forEach(cancel => cancel());
  }, []);

  // Auto-Lock idle timer for lock mode
  useEffect(() => {
    if (autoLockMinutes <= 0 || mode !== 'lock' || isLocked) return;

    let timeoutId: any;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsLocked(true);
        setIsLockModalOpen(true);
      }, autoLockMinutes * 60 * 1000);
    };

    resetTimer();
    const evNames = ['mousedown', 'mousemove', 'keydown', 'touchstart'];
    evNames.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    return () => {
      clearTimeout(timeoutId);
      evNames.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [autoLockMinutes, isLocked, mode]);

  // Expose DevTools window.AgentCockpit API for browser console configuration
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = window as any;
      const api = {
        setPassword: (pwd: string) => updatePasscode(pwd),
        setSpeed: (spd: number) => updateSpeed(spd),
        setTheme: (t: 'dark' | 'light') => updateTheme(t),
        openConsole: () => setIsConsoleOpen(true),
        closeConsole: () => setIsConsoleOpen(false),
        toggleLock: () => setIsLocked(l => !l),
        getConfig: () => ({ passcode: configPasscode, speed: animSpeed, theme, isLocked, workspaceDir }),
        setWorkspaceDir: (dir: string) => updateWorkspaceDir(dir),
        getWorkspaceDir: () => workspaceDir
      };
      w.AgentCockpit = api;

      console.log(
        '%c[AGENT COCKPIT // WEB CONSOLE ARMED]%c Settings can be modified via UI button [⚙ CONSOLE] or DevTools commands:\n• AgentCockpit.setPassword("your_pin")\n• AgentCockpit.setSpeed(2.0)\n• AgentCockpit.setTheme("dark"|"light")\n• AgentCockpit.setWorkspaceDir("D:/Code/my-repo")\n• AgentCockpit.getConfig()',
        'color: #34d996; font-weight: bold; font-size: 12px; background: #030605; padding: 4px 8px; border-radius: 4px;',
        'color: #86857f; font-size: 11px;'
      );
    }
  }, [animSpeed, configPasscode, isLocked, theme, updatePasscode, updateSpeed, updateTheme, updateWorkspaceDir, workspaceDir]);

  // Sync theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('agent-cockpit-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    updateTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, updateTheme]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        const w = window as any;
        if (w.go?.main?.App?.TogglePause) {
          w.go.main.App.TogglePause().catch(console.error);
        }
      }
      return next;
    });
  }, []);

  const openLockModal = useCallback(() => {
    setIsLockModalOpen(true);
  }, []);

  const closeLockModal = useCallback(() => {
    setIsLockModalOpen(false);
  }, []);

  const unlockWithPasscode = useCallback((code: string) => {
    const clean = code.trim();
    if (clean === configPasscode) {
      setIsLocked(false);
      if (typeof window !== 'undefined') {
        const w = window as any;
        if (w.go?.main?.App?.Unlock) {
          w.go.main.App.Unlock().catch(console.error);
        }
      }
      return true;
    }
    return false;
  }, [configPasscode]);

  // 2. Initial Data Generation
  const initialData = useMemo(() => {
    const tasksInit: TaskItem[] = Array.from({ length: 64 }, (_, i) => ({
      i,
      id: 'T-' + String(i + 1).padStart(3, '0'),
      name: CONFIG.taskNames[(R() * CONFIG.taskNames.length) | 0],
      wf: (R() * NW) | 0,
      prog: 0,
      state: 'queued',
      agent: -1
    }));

    const agentsInit: AgentItem[] = CONFIG.agents.map(([code, name], i) => ({
      i,
      code,
      name,
      task: -1
    }));

    const wfsInit: WorkflowItem[] = CONFIG.workflows.map((name, i) => ({
      i,
      id: 'W' + String(i + 1).padStart(2, '0'),
      name,
      q: 0.8,
      cells: Array.from({ length: 16 }, () => R())
    }));
    [0.91, 0.86, 0.72, 0.88, 0.84, 0.69, 0.93, 0.82, 0.74, 0.87, 0.71].forEach((q, i) => {
      if (wfsInit[i]) wfsInit[i].q = q;
    });

    const order = tasksInit.map(t => t.i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (R() * (i + 1)) | 0;
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.slice(0, 22).forEach(i => {
      tasksInit[i].state = 'done';
      tasksInit[i].prog = 1;
    });
    order.slice(22, 32).forEach((i, k) => {
      const t = tasksInit[i];
      t.state = 'run';
      t.prog = 0.06 + R() * 0.85;
      t.agent = k;
      agentsInit[k].task = i;
    });

    const feedInit: FeedItem[] = [];
    const verbs: ('FETCH' | 'BUILD' | 'CHECK' | 'AUDIT')[] = ['FETCH', 'BUILD', 'CHECK', 'AUDIT'];
    let n = 38;
    order.slice(8, 20).forEach((i, k) => {
      feedInit.push({
        n: n++,
        verb: verbs[k % 4],
        text: `${verbs[k % 4]} ${tasksInit[i].name}`
      });
    });

    return { tasksInit, agentsInit, wfsInit, feedInit };
  }, []);

  const [tasks, setTasks] = useState<TaskItem[]>(initialData.tasksInit);
  const [agents, setAgents] = useState<AgentItem[]>(initialData.agentsInit);
  const [wfs, setWfs] = useState<WorkflowItem[]>(initialData.wfsInit);
  const [feed, setFeed] = useState<FeedItem[]>(initialData.feedInit);

  // Stable references for high-frequency simulation loop
  const tasksRef = useRef<TaskItem[]>(initialData.tasksInit);
  const agentsRef = useRef<AgentItem[]>(initialData.agentsInit);
  const feedRef = useRef<FeedItem[]>(initialData.feedInit);
  const simTRef = useRef(0);
  const stepNRef = useRef(561);

  // Hubs tracking
  const [hubWf, setHubWf] = useState<number[]>([4, 0, 8]);
  const [hubCh, setHubCh] = useState<number[]>([-10, -10, -10]);
  const [hoverHub, setHoverHub] = useState<number>(-1);
  const [hubImpacts, setHubImpacts] = useState<number[]>([0, 0, 0]);

  // Metrics
  const [cfl, setCfl] = useState(0.42);
  const [stepN, setStepN] = useState(561);
  const [clockStr, setClockStr] = useState('');
  const [hiIdx, setHiIdx] = useState(1);

  const logNRef = useRef(50);

  // Real AI Watcher States for Five Windows and Top Animation
  const [realFeed, setRealFeed] = useState<FeedItem[]>([]);
  const [realSolver, setRealSolver] = useState<SolverTelemetry>({
    eventVelocity: 0,
    activeSources: 1,
    eventCount: 0,
    throughputKB: 0,
    status: 'OPTIMAL',
    currentTask: 'Agent Cockpit Telemetry Stream Active',
    lastVerb: 'IDLE'
  });
  const [realCode, setRealCode] = useState<WorkspaceCodeData>({
    file: '等待 Codex 修改文件', agentCode: '', agentName: '', startLine: 1, lines: []
  });
  const [realAgents, setRealAgents] = useState<AgentDispatchItem[]>([]);
  const [realStageData, setRealStageData] = useState<StagePipelineData>({
    totalEvents: 0,
    activeAgents: 1,
    totalSources: 3,
    doneOutputs: 0,
    verifiedCount: 0,
    pendingCount: 2,
    recentPackets: ['SYNC AGY', 'EDIT paths.go', 'EXEC wails', 'CHECK proc', 'SYS nominal'],
    hotHubIndex: 0
  });
  const [isWatcherLive, setIsWatcherLive] = useState<boolean>(false);

  const triggerHubImpact = useCallback((idx: number) => {
    setHubImpacts(prev => {
      const next = [...prev];
      next[idx] = simTRef.current;
      return next;
    });
  }, []);

  const snapshotGateRef = useRef(createSnapshotGate());
  // Synchronize full dashboard state from backend snapshot
  const syncRealDashboard = useCallback((snap: DashboardSnapshot) => {
    if (!snapshotGateRef.current(snap)) return;
    setIsWatcherLive(true);
    if (Array.isArray(snap.feed)) {
      setRealFeed(snap.feed);
      setFeed(snap.feed);
      feedRef.current = snap.feed;
    }
    if (snap.solver) {
      setRealSolver(snap.solver);
    }
    if (snap.code && Array.isArray(snap.code.lines)) {
      setRealCode(snap.code);
    }
    if (Array.isArray(snap.agents) && snap.agents.length > 0) {
      setRealAgents(snap.agents);
      setAgents(snap.agents.map((ag, i) => ({
        i,
        code: ag.code,
        name: ag.name,
        task: ag.status === 'busy' ? 0 : -1
      })));
    }
    if (snap.stageData) {
      setRealStageData(snap.stageData);
      if (typeof snap.stageData.hotHubIndex === 'number') {
        triggerHubImpact(snap.stageData.hotHubIndex);
      }
    }
  }, [triggerHubImpact]);

  // Real-time AI coding agent event listener & polling
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as any;

    // 1. Initial full snapshot fetch
    if (w.go?.main?.App?.GetFullDashboardSnapshot) {
      w.go.main.App.GetFullDashboardSnapshot()
        .then((snap: any) => syncRealDashboard(snap))
        .catch((err: any) => console.warn('GetFullDashboardSnapshot fallback:', err));
    }

    const cancellations: (() => void)[] = [];
    // 2. One coalesced snapshot stream from Go backend
    if (w.runtime?.EventsOn) {
      cancellations.push(subscribeRuntime(w.runtime, 'dashboard-realtime-sync', (snap: any) => {
        syncRealDashboard(snap);
      }));
    }

    // 3. Slow fallback polling if a coalesced backend event is missed
    const pollTimer = setInterval(() => {
      if (w.go?.main?.App?.GetFullDashboardSnapshot) {
        w.go.main.App.GetFullDashboardSnapshot()
          .then((snap: any) => syncRealDashboard(snap))
          .catch(() => {});
      }
    }, 5000);

    return () => { clearInterval(pollTimer); cancellations.forEach(cancel => cancel()); };
  }, [syncRealDashboard]);

  // Simulation loop references
  const lastTimeRef = useRef(0);
  const accStepRef = useRef(0);
  const accHudRef = useRef(0);
  const accHubRef = useRef(0);
  const accCycleRef = useRef(0);

  const hubTurnRef = useRef(0);

  // Discrete Step logic - runs cleanly and synchronously
  const runSimulationStep = useCallback(() => {
    const nextTasks = tasksRef.current.map(t => ({ ...t }));
    const nextAgents = agentsRef.current.map(a => ({ ...a }));
    let nextFeed = [...feedRef.current];
    const logEvents: { verb: 'FETCH' | 'BUILD' | 'CHECK' | 'AUDIT'; name: string }[] = [];

    // 1. Advance running tasks for busy agents
    for (const a of nextAgents) {
      if (a.task < 0 || a.task >= nextTasks.length) continue;
      const t = nextTasks[a.task];
      t.prog = Math.min(1, t.prog + 0.03 + Math.random() * 0.08);
      if (t.prog >= 1) {
        t.state = 'done';
        t.agent = -1;
        a.task = -1;
        const vb = Math.random() < 0.5 ? 'CHECK' : 'AUDIT';
        logEvents.push({ verb: vb, name: t.name });
      }
    }

    // 2. Assign queued tasks to idle agents
    for (const a of nextAgents) {
      if (a.task >= 0 || Math.random() > 0.45) continue;
      const queued = nextTasks.filter(t => t.state === 'queued');
      if (!queued.length) break;
      const t = queued[(Math.random() * queued.length) | 0];
      t.state = 'run';
      t.agent = a.i;
      t.prog = 0.02;
      a.task = t.i;
      const vb = Math.random() < 0.5 ? 'FETCH' : 'BUILD';
      logEvents.push({ verb: vb, name: t.name });
    }

    // 3. Replenish queue if low on queued tasks (continuous circular stream)
    const queuedCount = nextTasks.filter(t => t.state === 'queued').length;
    if (queuedCount < 10) {
      const doneTasks = nextTasks.filter(t => t.state === 'done');
      if (doneTasks.length > 0) {
        const recycled = doneTasks.sort(() => Math.random() - 0.5).slice(0, 18);
        for (const t of recycled) {
          t.state = 'queued';
          t.prog = 0;
          t.agent = -1;
        }
      }
    }

    // 4. Append log events to feed
    for (const ev of logEvents) {
      nextFeed.push({
        n: logNRef.current++,
        verb: ev.verb,
        text: `${ev.verb} ${ev.name}`
      });
    }
    if (nextFeed.length > 36) {
      nextFeed = nextFeed.slice(-36);
    }

    // 5. Update refs & states atomically
    tasksRef.current = nextTasks;
    agentsRef.current = nextAgents;
    feedRef.current = nextFeed;
    setTasks(nextTasks);
    setAgents(nextAgents);
    setFeed(nextFeed);

    stepNRef.current += 1;
    setStepN(stepNRef.current);

    setWfs(prevWfs => {
      const next = prevWfs.map(w => ({ ...w }));
      const w = next[(Math.random() * next.length) | 0];
      if (w) {
        w.q = Math.max(0.6, Math.min(0.97, w.q + (Math.random() - 0.38) * 0.05));
        w.cells[(Math.random() * 16) | 0] = Math.random();
      }
      return next;
    });
  }, []);

  // Hub Switch logic - reads from stable refs
  const runHubSwitch = useCallback(() => {
    setHubWf(prevHubWf => {
      const nextHubs = [...prevHubWf];
      const i = hubTurnRef.current++ % nextHubs.length;
      const currentTasks = tasksRef.current;
      const busy = currentTasks.filter(t => t.state === 'run').map(t => t.wf);
      const uniqueBusy = [...new Set(busy)].filter(w => !nextHubs.includes(w));
      const pool = uniqueBusy.length ? uniqueBusy : CONFIG.workflows.map((_, idx) => idx).filter(w => !nextHubs.includes(w));
      nextHubs[i] = pool[(Math.random() * pool.length) | 0] ?? 0;
      setHubCh(ch => {
        const nextCh = [...ch];
        nextCh[i] = simTRef.current;
        return nextCh;
      });
      triggerHubImpact(i);
      return nextHubs;
    });
  }, [triggerHubImpact]);

  // Main high-precision animation loop
  useEffect(() => {
    let animId: number;
    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      if (document.hidden) { lastTimeRef.current = now; return; }
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const realDt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const dt = isPaused ? 0 : realDt * animSpeed;
      if (dt > 0) {
        simTRef.current += dt;


        accStepRef.current += dt;
        while (accStepRef.current >= 0.9) {
          if (!isWatcherLive) runSimulationStep();
          accStepRef.current -= 0.9;
        }

        accHudRef.current += dt;
        if (accHudRef.current >= 0.3) {
          setCfl(0.3 + Math.random() * 0.45);
          accHudRef.current = 0;
        }

        accHubRef.current += dt;
        if (accHubRef.current >= 2.4) {
          runHubSwitch();
          accHubRef.current = 0;
        }

        accCycleRef.current += dt;
        if (accCycleRef.current >= 4.5) {
          setHiIdx(h => (h + 1) % 6);
          accCycleRef.current = 0;
        }
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [animSpeed, isPaused, isWatcherLive, runHubSwitch, runSimulationStep]);

  // Real-time clock update (wall time)
  useEffect(() => {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const updateClock = () => {
      const d = new Date();
      setClockStr(`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const value = {
    visualStyle,
    updateVisualStyle,
    theme,
    setTheme,
    toggleTheme,
    mode,
    setMode,
    updateMode,
    autoLockMinutes,
    updateAutoLockMinutes,
    lockOnStartup,
    updateLockOnStartup,
    aiWatcherEnabled,
    updateAiWatcherEnabled,
    tvNoiseEffect,
    updateTvNoiseEffect,
    mosaicEffect,
    updateMosaicEffect,
    scanlineEffect,
    updateScanlineEffect,
    triggerTvFlicker,
    tvFlickerCount,
    workspaceDir,
    updateWorkspaceDir,
    isPaused,
    setIsPaused,
    togglePause,
    animSpeed,
    setAnimSpeed,
    isLocked,
    setIsLocked,
    isLockModalOpen,
    openLockModal,
    closeLockModal,
    unlockWithPasscode,
    configPasscode,

    isConsoleOpen,
    openConsole,
    closeConsole,
    updatePasscode,
    updateSpeed,
    updateTheme,

    tasks,
    agents,
    wfs,
    feed,
    hubWf,
    hubCh,
    hoverHub,
    setHoverHub,


    cfl,
    stepN,
    setStepN,
    clockStr,
    hiIdx,
    simT: simTRef.current,

    triggerHubImpact,
    hubImpacts,

    // Real AI Telemetry for 5 Windows + Top Animation
    realFeed,
    realSolver,
    realCode,
    realAgents,
    realStageData,
    isWatcherLive
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
};

export { useDashboard } from './useDashboard';
