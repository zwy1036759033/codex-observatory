// Adapted from Kirito14IT/prompt-spider-ui (MIT), Copyright (c) 2026 Kirito14IT.
// Upstream: https://github.com/Kirito14IT/prompt-spider-ui
// See licenses/PROMPT-SPIDER-UI-LICENSE.txt. Geometry only; no model scores.
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = value => value * value * (3 - 2 * value);
const mix = (a, b, fraction) => a + (b - a) * fraction;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

// Reconstructed from inspection of the source's 50 ms frame sequence. The endpoint pauses on the
// word before the whole dotted arm folds back; it does not orbit indefinitely.
export const PROBE_TIMING = Object.freeze({ reach: 0.26, hold: 0.26, retract: 0.26 });

function seedFor(event) {
  let seed = (finite(event.index) + 1) * 2654435761 >>> 0;
  for (const character of String(event.word ?? '')) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

/** Absolute, seekable arm geometry; target remains attached to its word. */
export function probePose(event, time, body, reducedMotion = false) {
  const seed = seedFor(event);
  const x = finite(body?.x), y = finite(body?.y);
  const target = { x: finite(event.target?.x, x), y: finite(event.target?.y, y) };
  const dx = target.x - x, dy = target.y - y;
  const distance = Math.hypot(dx, dy);
  const ux = distance > 0.001 ? dx / distance : Math.cos(seed % 628 / 100);
  const uy = distance > 0.001 ? dy / distance : Math.sin(seed % 628 / 100);
  const side = seed & 1 ? 1 : -1;
  const launchTime = finite(event.launchTime);
  const start = launchTime - PROBE_TIMING.reach;
  const holdEnd = launchTime + PROBE_TIMING.hold;
  const end = holdEnd + PROBE_TIMING.retract;
  const visible = Number.isFinite(time) && time >= start && time < end;
  let phase = 'idle', phaseProgress = 0, extension = 0, contact = false;
  if (visible && time < launchTime) {
    phase = 'reach';
    phaseProgress = clamp((time - start) / PROBE_TIMING.reach);
    // A short sideways preparation leads into the quick outward sweep. Endpoint
    // speed settles to zero before contact, keeping the word pinned during hold.
    extension = smooth(phaseProgress ** 1.35);
  } else if (visible && time < holdEnd) {
    phase = 'hold';
    phaseProgress = clamp((time - launchTime) / PROBE_TIMING.hold);
    extension = 1;
    contact = true;
  } else if (visible) {
    phase = 'retract';
    phaseProgress = clamp((time - holdEnd) / PROBE_TIMING.retract);
    extension = 1 - smooth(phaseProgress ** 0.9);
  }
  if (visible && reducedMotion) { phase = 'hold'; phaseProgress = 0.5; extension = 1; contact = true; }

  const radius = 1 / Math.sqrt(ux * ux / (23 * 23) + uy * uy / (29 * 29));
  const root = { x: x + ux * radius, y: y + uy * radius };
  const restRadius = Math.min(54 + seed % 10, Math.max(radius + 7, distance - 12));
  const restingTip = { x: x + ux * restRadius, y: y + uy * restRadius };
  const motionPulse = reducedMotion || phase === 'idle' || phase === 'hold'
    ? 0 : Math.sin(Math.PI * phaseProgress) ** 2;
  const sweepSize = clamp((distance - radius) * 0.27, 18, 35);
  // Moving only the elbow leaves a straight-going tip. Give the tip its own
  // lateral arc, with an opposite, slightly hooked path during withdrawal.
  const lateral = side * sweepSize * motionPulse * (phase === 'retract'
    ? -0.93 * (1 + 0.15 * Math.sin(2 * Math.PI * phaseProgress)) : 1);
  const hook = phase === 'retract' ? 5.5 * motionPulse * Math.sin(2 * Math.PI * phaseProgress) : 0;
  const tip = {
    x: mix(restingTip.x, target.x, extension) - uy * lateral + ux * hook,
    y: mix(restingTip.y, target.y, extension) + ux * lateral + uy * hook,
  };
  const reach = Math.hypot(tip.x - root.x, tip.y - root.y);
  // The joints fold more deeply and change their bend direction on withdrawal.
  const fold = (20 + seed % 9) * (1 - extension * 0.65);
  const tremor = reducedMotion ? 0 : Math.sin(time * 5.1 + seed % 97) * 1.3 * extension;
  const bend = side * (fold + tremor + (phase === 'retract' ? -39 : 24) * motionPulse);
  const joints = [
    { x: mix(root.x, tip.x, 0.34) - uy * bend, y: mix(root.y, tip.y, 0.34) + ux * bend },
    { x: mix(root.x, tip.x, 0.72) + uy * bend * 0.36, y: mix(root.y, tip.y, 0.72) - ux * bend * 0.36 },
  ];
  const fade = phase === 'reach' ? clamp(phaseProgress / 0.26) : phase === 'retract' ? clamp((1 - phaseProgress) / 0.25) : 1;
  return {
    event, phase, phaseProgress, extension, visible, contact, start, end,
    root, joints, tip, target, restingTip, distance, reach, lateral,
    fingerOpening: reducedMotion ? 0 : phase === 'hold'
      ? 1.1 * Math.sin(Math.PI * phaseProgress) ** 2
      : motionPulse * (phase === 'reach' ? 3 : 1.8),
    opacity: visible ? (reducedMotion ? 0.92 : fade) : 0,
    width: Math.max(8, finite(event.width, String(event.word ?? '').length * 7.5)),
  };
}

