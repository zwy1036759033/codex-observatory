import { useEffect, useMemo, useRef, useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { createHaloFluxRenderer } from './haloflux-renderer.js';
import { projectPackets } from './project-terms.js';
import { useVisualLayers } from '../../hooks/useVisualLayers';

export function HaloFluxStage() {
  const { realStageData, realSolver, realFeed, realCode, isPaused, togglePause, animSpeed } = useDashboard();
  const projectWords=useMemo(()=>projectPackets(realCode),[realCode]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createHaloFluxRenderer> | null>(null);
  const [camera, setCamera] = useState(true);
  const { spider, nebula, reach, flow, setLayer } = useVisualLayers();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const renderer = createHaloFluxRenderer(canvasRef.current);
    rendererRef.current = renderer;
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, []);

  useEffect(() => {
    rendererRef.current?.update({
      paused: isPaused, speed: animSpeed, camera, reducedMotion, spider, nebula, reach, flow,
      packets: projectWords,
      velocity: realSolver.eventVelocity,
      events: realStageData.totalEvents,
      labels: realStageData.recentPackets,
    });
  }, [isPaused, animSpeed, camera, reducedMotion, spider, nebula, reach, flow, projectWords, realSolver.eventVelocity, realStageData]);

  const latest = realFeed.at(-1);
  const active = realStageData.activeAgents > 0;
  return (
    <main className="haloflux-stage" aria-label="Codex 光环活动可视化">
      <canvas ref={canvasRef} aria-label="编织光核、旋转数据环与多层光束；动画由本地 Codex 活动驱动" />
      <div className="halo-live-label">
        <span className={`halo-dot ${active ? 'active' : ''}`} />
        {active ? 'CODEX / ACTIVE SESSION' : 'CODEX / STANDING BY'}
        <small>LOCAL ACTIVITY · {realSolver.eventVelocity.toFixed(0)} EVENTS / MIN</small>
      </div>
      <div className="halo-stage-controls" role="group" aria-label="光环视觉控制">
        <button type="button" aria-pressed={isPaused} onClick={togglePause}>{isPaused ? '▶ 继续' : 'Ⅱ 暂停'}</button>
        <button type="button" aria-pressed={camera} onClick={() => setCamera(value => !value)}>{camera ? '鼠标运镜 ON' : '鼠标运镜 OFF'}</button>
        <button type="button" aria-pressed={spider} onClick={() => setLayer('spider', !spider)}>蜘蛛光轨 {spider ? 'ON' : 'OFF'}</button>
        <button type="button" aria-pressed={nebula} onClick={() => setLayer('nebula', !nebula)}>星云景深 {nebula ? 'ON' : 'OFF'}</button>
      </div>
      <div className="halo-event" aria-live="polite">
        <span className="halo-event-kicker">LATEST ACTIVITY / {String(realStageData.totalEvents).padStart(4, '0')}</span>
        <strong title={latest?.text}>{latest?.text || '等待 Codex 会话活动'}</strong>
        <span>{realStageData.activeAgents} ACTIVE · {realStageData.doneOutputs} TOOL RETURNS · VISUAL MOTION IS ILLUSTRATIVE</span>
      </div>
      <a className="halo-credit" href="https://github.com/Ryder191/haloflux" target="_blank" rel="noreferrer">VISUALS / Ryder191 · modified for Codex · noncommercial</a>
    </main>
  );
}
