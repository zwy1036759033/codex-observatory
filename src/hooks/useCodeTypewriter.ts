import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceCodeData } from '../types';

// Replay only the bounded snapshot of a real saved file. A content revision
// resets the cursor even when the file name stays the same.
export function useCodeTypewriter(realCode: WorkspaceCodeData, isPaused: boolean, animSpeed: number) {
  const [cursor, setCursor] = useState({line:0, char:0, hold:0});
  const data = useRef(realCode);
  data.current = realCode;
  const signature = [realCode.path || realCode.file, realCode.revision || realCode.lines.join('\n'), realCode.startLine].join(':');
  useEffect(() => { setCursor({line:0,char:0,hold:0}); }, [signature]);
  useEffect(() => {
    let frame=0,last=0,accumulator=0;
    const tick=(now:number)=>{
      frame=requestAnimationFrame(tick);
      const dt=last?Math.min(.05,(now-last)/1000):0; last=now;
      if(isPaused||document.hidden||!data.current.lines.length)return;
      accumulator+=dt*animSpeed;
      if(accumulator<.034)return;
      const step=Math.min(4,Math.floor(accumulator/.034));accumulator%=.034;
      setCursor(c=>{
        const lines=data.current.lines;
        if(c.hold>0)return c.hold>step?{...c,hold:c.hold-step}:{line:0,char:0,hold:0};
        const text=lines[c.line]||'';
        if(c.char+step*4<text.length)return {...c,char:c.char+step*4};
        return c.line<lines.length-1?{line:c.line+1,char:0,hold:0}:{line:c.line,char:text.length,hold:55};
      });
    };
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[isPaused,animSpeed]);
  const codeRows=useMemo(()=>{
    const rows=[];const last=Math.min(cursor.line,realCode.lines.length-1);
    for(let i=Math.max(0,last-7);i<=last;i++)rows.push({ln:i+(realCode.startLine||1),text:i<last?realCode.lines[i]:realCode.lines[i].slice(0,cursor.char),isCurrent:i===last});
    return rows;
  },[cursor,realCode]);
  return {codeMeta:realCode,codeRows};
}
