/**
 * solverClient.js — one worker, one queue, promises out.
 *
 * The rose and the advantage field are the two solves too slow to run inside
 * an event handler. Widgets ask for them here and paint when they arrive; the
 * map is on screen long before either lands. If workers are unavailable —
 * opening the file straight off disk, say — everything falls back to running
 * inline, which is slow but correct.
 */

import { positioningRose } from '../core/normals.js';
import { advantageField, bestPositions, fieldRange } from '../core/field.js';

let worker = null;
let broken = false;
let nextId = 1;
const pending = new Map();

function ensure() {
  if (worker || broken) return worker;
  try {
    worker = new Worker(new URL('../core/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { type, id } = e.data;
      const job = pending.get(id);
      if (!job) return;
      if (type === 'progress') { job.onProgress?.(e.data); return; }
      pending.delete(id);
      if (type === 'error') job.reject(new Error(e.data.message));
      else job.resolve(e.data.result);
    };
    worker.onerror = () => {
      broken = true;
      for (const [, job] of pending) job.reject(new Error('worker failed'));
      pending.clear();
      worker = null;
    };
  } catch {
    broken = true;
  }
  return worker;
}

function send(kind, scene, target, params, opts, onProgress) {
  const w = ensure();
  if (!w) {
    // Inline fallback. Deferred a tick so callers still get a promise.
    return new Promise((resolve) => setTimeout(() => {
      if (kind === 'rose') resolve(positioningRose(scene, target, params, opts));
      else {
        const f = advantageField(scene, target, params, opts);
        f.range = fieldRange(f.score, f.mask);
        f.best = bestPositions(f, 3);
        resolve(f);
      }
    }, 0));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({
      id, kind,
      scene: { solids: scene.solids, bounds: scene.bounds },
      enemy: { x: target.x, y: target.y },
      params: { ...params },
      opts,
    });
  });
}

/**
 * Cheaper settings for the sweep than for the viewports. The rose is a curve
 * whose maxima we want, not a picture — a small framebuffer moves the answer
 * by well under a degree and costs a third of the time.
 */
export const roseParams = (p, over = {}) => ({
  ...p, bufW: 96, bufH: 66, domeGrid: 33, ...over,
});

/** @returns {Promise<Object>} the Positioning Rose */
export function requestRose(scene, enemy, params, opts = {}) {
  return send('rose', scene, enemy, roseParams(params), { n: 108, radius: 9, ...opts });
}

/** @returns {Promise<Object>} the advantage field */
export function requestField(scene, enemy, params, opts = {}, onProgress) {
  return send('field', scene, enemy, params, opts, onProgress);
}

/**
 * Latest-wins: a widget that fires a request per drag only wants the answer to
 * the most recent one.
 */
export function latest() {
  let token = 0;
  return (promise, onResult) => {
    const mine = ++token;
    promise.then((r) => { if (mine === token) onResult(r); }).catch(() => {});
  };
}
