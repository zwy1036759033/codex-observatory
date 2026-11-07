// Only the newest snapshot is retained; wall-clock timestamps aren't data changes.
export function createSnapshotGate() {
  let previous = '';
  return snapshot => {
    if (!snapshot) return false;
    const payload = { ...snapshot };
    delete payload.timestamp;
    const key = JSON.stringify(payload);
    if (key === previous) return false;
    previous = key;
    return true;
  };
}

export function subscribeRuntime(runtime, event, handler) {
  const cancel = runtime?.EventsOn?.(event, handler);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (typeof cancel === 'function') cancel();
  };
}
