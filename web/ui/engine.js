// Talks to the background worker. Scene requests never pile up: while one is building, later changes collapse
// into a single follow-up request with the newest settings, so dragging a slider stays smooth.
export function createEngine(onScene, onError) {
  const worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let seq = 0, building = false, queued = null, loaded, failed, failure = null;
  const ready = new Promise((resolve, reject) => { loaded = resolve; failed = reject; });

  worker.onmessage = ({ data }) => {
    if (data === 'ready') return loaded();
    const done = waiting.get(data.id); waiting.delete(data.id);
    if (!done) return;
    data.error ? done.reject(new Error(data.error)) : done.resolve(data);
  };
  worker.onerror = e => {
    e.preventDefault(); failure = new Error(e.message || 'the background worker failed to start');
    for (const pending of waiting.values()) pending.reject(failure);
    waiting.clear(); failed(failure); onError(failure);
  };
  // sent once the worker is listening: a message posted earlier waits for this thread to be idle before it is passed on
  const call = (msg, transfer = []) => new Promise((resolve, reject) => {
    const id = ++seq; waiting.set(id, { resolve, reject }); ready.then(() => {
      if (failure) { waiting.delete(id); reject(failure); }
      else worker.postMessage({ id, ...msg }, transfer);
    }, reject);
  });

  async function build(make) {
    if (building) { queued = make; return; }
    building = true;
    try { onScene(await call(make())); } catch (e) { onError(e); }
    building = false;
    if (queued) { const next = queued; queued = null; build(next); }
  }
  return {
    ready,                                                             // the worker's code has loaded
    // make() -> { P, tiles, only }: called when the request is actually sent, so it always reads the latest settings
    scene: make => build(() => ({ type: 'scene', ...make() })),
    mesh: (grids, only) => call({ type: 'mesh', grids, only }),
    design: P => call({ type: 'design', P }),
    thumb: (P, top) => call({ type: 'thumb', P, top }),
  };
}
