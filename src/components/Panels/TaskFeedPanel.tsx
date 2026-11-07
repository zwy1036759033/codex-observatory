import React, { useRef, useEffect, useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';

export const TaskFeedPanel: React.FC = () => {
  const { realFeed: feed, realStageData, realSolver, isWatcherLive } = useDashboard();
  const listRef = useRef<HTMLOListElement>(null);
  const [visibleCount, setVisibleCount] = useState(16);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const updateHeight = () => {
      const containerH = el.parentElement?.clientHeight || el.clientHeight || 0;
      if (containerH > 20) {
        const count = Math.max(6, Math.floor(containerH / 13.5));
        setVisibleCount(count);
      }
    };

    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);

    return () => ro.disconnect();
  }, []);

  const visibleItems = feed.slice(-Math.max(6, visibleCount));

  return (
    <article className="panel">
      <div className="ph">
        <h2>
          TASK FEED<i>EVENT LOG</i>
        </h2>
        <span>{isWatcherLive ? realStageData.totalEvents : 0} events · {isWatcherLive ? realSolver.status : '等待连接'}</span>
      </div>
      <div className="pb">
        <ol className="feed" ref={listRef}>
          {!visibleItems.length && <li>等待本地 Codex 的真实调用记录</li>}
          {visibleItems.map(e => (
            <li key={e.n}>
              <span className="n">{String(e.n).padStart(3, '0')}</span>
              <span className="vb">{e.verb}</span>
              <span className="d" title={[e.timeStr,e.text].filter(Boolean).join(' · ')}>{e.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
};
