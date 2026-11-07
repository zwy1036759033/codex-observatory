import { useSyncExternalStore } from 'react';

type Layer = 'spider' | 'nebula';
const key = 'codex-visual-layers';
const bounded=(v:unknown,fallback:number,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
let state = { spider: true, nebula: true, reach:1.5, flow:1.8 };
try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); state = { spider: saved.spider !== false, nebula: saved.nebula !== false,reach:bounded(saved.reach,1.5,.6,2.2),flow:bounded(saved.flow,1.8,.5,3) }; } catch { /* Defaults remain usable without storage. */ }
let revision=0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => revision;
function setLayer(layer: Layer, enabled: boolean) {
  state = { ...state, [layer]: enabled };
  revision++;
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Session-only preferences still work. */ }
  listeners.forEach(listener => listener());
}
function setMotion(name:'reach'|'flow',value:number){
  if(!Number.isFinite(value))return;
  state={...state,[name]:name==='reach'?bounded(value,1.5,.6,2.2):bounded(value,1.8,.5,3)};
  revision++;try{localStorage.setItem(key,JSON.stringify(state))}catch{}
  listeners.forEach(listener=>listener());
}
export function useVisualLayers() {
  useSyncExternalStore(subscribe, snapshot);
  return {...state,setLayer,setMotion};
}
