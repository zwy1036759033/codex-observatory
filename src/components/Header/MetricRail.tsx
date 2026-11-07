import React from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { CONFIG } from '../../constants/config';

export const MetricRail: React.FC = () => {
  const { tasks, agents, wfs, clockStr, hiIdx, realStageData, isWatcherLive } = useDashboard();

  const totalTasks = isWatcherLive ? realStageData.totalEvents : tasks.length;
  const activeAgents = isWatcherLive ? realStageData.activeAgents : agents.filter(a => a.task >= 0).length;
  const totalAgents = 12;
  const totalWfs = isWatcherLive ? realStageData.totalSources : CONFIG.workflows.length;
  const doneCount = isWatcherLive ? realStageData.doneOutputs : tasks.filter(t => t.state === 'done').length;
  const matchedCount = isWatcherLive ? realStageData.verifiedCount : wfs.filter(w => w.q >= 0.8).length;
  const pendingCount = isWatcherLive ? realStageData.pendingCount : Math.max(0, totalWfs - matchedCount);

  return (
    <header className="top">
      <div className="cell title">
        <h1>CODEX</h1>
        <p>LOCAL SESSION OBSERVATORY · <b id="clock">{clockStr || '--:--:--'}</b></p>
      </div>
      <div className={`cell stat ${hiIdx === 0 ? 'on' : ''}`}>
        <span className="k">EVENTS<i>OBSERVED</i></span>
        <span className="v" id="s0">{totalTasks}</span>
      </div>
      <div className={`cell stat ${hiIdx === 1 ? 'on' : ''}`}>
        <span className="k">AGENTS<i>ACTIVE</i></span>
        <span className="v" id="s1">
          {activeAgents} <small>/ {totalAgents}</small>
        </span>
      </div>
      <div className={`cell stat ${hiIdx === 2 ? 'on' : ''}`}>
        <span className="k">SOURCES<i>LOCAL</i></span>
        <span className="v" id="s2">{totalWfs}</span>
      </div>
      <div className={`cell stat ${hiIdx === 3 ? 'on' : ''}`}>
        <span className="k">TOOLS<i>RETURNED</i></span>
        <span className="v" id="s3">{doneCount}</span>
      </div>
      <div className={`cell stat ${hiIdx === 4 ? 'on' : ''}`}>
        <span className="k">COMMANDS<i>NONZERO EXIT</i></span>
        <span className="v" id="s4">
          {matchedCount}
        </span>
      </div>
      <div className={`cell stat ${hiIdx === 5 ? 'on' : ''}`}>
        <span className="k">PENDING<i>REVIEW</i></span>
        <span className="v" id="s5">{isWatcherLive ? 'N/A' : pendingCount}</span>
      </div>
    </header>
  );
};
