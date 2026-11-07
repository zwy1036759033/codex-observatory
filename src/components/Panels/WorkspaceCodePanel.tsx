import React from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { useCodeTypewriter } from '../../hooks/useCodeTypewriter';

export const WorkspaceCodePanel: React.FC = () => {
  const { realCode, isPaused, animSpeed } = useDashboard();
  const { codeMeta, codeRows } = useCodeTypewriter(realCode, isPaused, animSpeed);

  // Python syntax highlighting helper
  const renderHighlightedText = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      return <span className="cm">{text}</span>;
    }

    // Split text into tokens for keywords, strings, and standard code
    const parts = text.split(/('[^']*'?|\b(?:for|in|if|def|return|not|assert|lambda)\b)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("'")) {
        return <span key={idx} className="str">{part}</span>;
      }
      if (/^(?:for|in|if|def|return|not|assert|lambda)$/.test(part)) {
        return <span key={idx} className="kw">{part}</span>;
      }
      return part;
    });
  };

  return (
    <article className="panel">
      <div className="ph">
        <h2>
          WORKSPACE<i>RUNTIME CODE</i>
        </h2>
        <span id="codeMeta" title={realCode.path || realCode.file}>
          {codeMeta.file} · {codeMeta.agentCode} {codeMeta.agentName}
        </span>
      </div>
      <div className="pb">
        <pre className="code" id="code">
          {!realCode.lines.length && <span className="cm">等待实际文件修改；暂无代码回放</span>}
          {codeRows.map(row => (
            <span key={row.ln} className={`row ${row.isCurrent ? 'cur' : ''}`}>
              <span className="ln">{String(row.ln).padStart(3, '0')}</span>
              {renderHighlightedText(row.text)}
              {row.isCurrent && <span className="caret" />}
            </span>
          ))}
        </pre>
      </div>
      <div className="pf" title={realCode.path || realCode.file}>已保存代码 · 局部循环回放{realCode.updatedAt ? ` · ${new Date(realCode.updatedAt).toLocaleTimeString()}` : ""}</div>
    </article>
  );
};
