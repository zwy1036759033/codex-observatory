// Adapted from Kirito14IT/prompt-spider-ui (MIT), Copyright (c) 2026 Kirito14IT.
// Upstream: https://github.com/Kirito14IT/prompt-spider-ui
// See licenses/PROMPT-SPIDER-UI-LICENSE.txt. Geometry only; no model scores.
// A deterministic route field, not a similarity graph. No physics or remote data.
const ROUTES = ['code', 'model', 'you'];
const DEFAULT_COLORS = {code:'#48d7a6', model:'#e18c78', you:'#f4cf4d'};
const DEFAULT_THEME = {background:'#080909', text:'#e8e8e9', muted:'#9998a0'};
const TAU = Math.PI * 2;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fract = value => value - Math.floor(value);

function hash(value) {
  let h = 2166136261;
  for (const ch of String(value)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ h >>> 16, 0x85ebca6b);
  h = Math.imul(h ^ h >>> 13, 0xc2b2ae35);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

function camera(rect, {angle = 0, pitch = 0, zoom = 1} = {}) {
  const yaw = finite(angle, 0), tilt = clamp(finite(pitch, 0), -.8, .8) - .18;
  const scale = clamp(finite(zoom, 1), 1, 1.7);
  const radius = Math.max(1, Math.min(rect.w - 48, rect.h - 116)) * .43 * scale;
  const cy = rect.y + rect.h * .51, cx = rect.x + rect.w / 2;
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(tilt), sp = Math.sin(tilt);
  return point => {
    const x = point.x * ca + point.z * sa, yawZ = point.z * ca - point.x * sa;
    const y = point.y * cp - yawZ * sp, z = point.y * sp + yawZ * cp;
    const perspective = 1 / (1 - z * .23);
    return {x:cx + x * radius * perspective, y:cy + y * radius * perspective, depth:z, perspective};
  };
}

function usable(rect) {
  return rect && ['x','y','w','h'].every(key => Number.isFinite(rect[key])) && rect.w >= 64 && rect.h >= 100;
}

function inside(point, rect) {
  return point.x >= rect.x + 9 && point.x <= rect.x + rect.w - 9 && point.y >= rect.y + 42 && point.y <= rect.y + rect.h - 49;
}

/** Projection retains offscreen points with visible=false; only visible points are pickable. */
export function nebulaNodes(events, rect, {angle = 0, pitch = 0, zoom = 1, filter = 'all', query = ''} = {}) {
  if (!usable(rect)) return [];
  const project = camera(rect, {angle, pitch, zoom});
  const needle = String(query ?? '').trim().toLocaleLowerCase();
  return (Array.isArray(events) ? events : []).filter(event => event && ROUTES.includes(event.route)).slice(-200).map(event => {
    const id = event.id ?? event.index;
    const band = ROUTES.indexOf(event.route) - 1;
    const longitude = hash(`longitude:${id}`) * TAU;
    const latitude = band * .74 + (hash(`latitude:${id}`) - .5) * .46;
    const spread = .83 + hash(`radius:${id}`) * .14;
    const point = {x:Math.cos(longitude) * Math.cos(latitude) * spread, y:Math.sin(latitude) * spread, z:Math.sin(longitude) * Math.cos(latitude) * spread};
    const projected = project(point);
    const hub = project({x:0, y:band * .23, z:0});
    const label = String(event.word ?? event.displayLabel ?? event.label ?? '');
    return {event, id, ...projected, hub, radius:2.1 + (projected.depth + 1) * 1.65,
      visible:inside(projected, rect), match:(filter === 'all' || event.route === filter) && (!needle || label.toLocaleLowerCase().includes(needle))};
  }).sort((a,b) => a.depth - b.depth);
}

