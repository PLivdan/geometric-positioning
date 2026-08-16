/**
 * worker.js — the expensive solves, off the main thread.
 *
 * Two jobs live here:
 *   · the Positioning Rose — a couple of hundred renders to sweep the bearing
 *   · the advantage field  — two full duels per map cell
 *
 * Both are far too slow for a frame budget, and both are wanted by more than
 * one widget, so they share one worker and one queue.
 */

import { advantageFieldGen, bestPositions, fieldRange } from './field.js';
import { positioningRose } from './normals.js';

function runField({ id, scene, enemy, params, opts }) {
  const gen = advantageFieldGen(scene, enemy, params, opts);
  let r = gen.next();
  let last = 0;
  while (!r.done) {
    const now = performance.now();
    if (now - last > 110) {
      self.postMessage({ type: 'progress', id, row: r.value.row, ny: r.value.ny });
      last = now;
    }
    r = gen.next();
  }
  const field = r.value;
  field.range = fieldRange(field.score, field.mask);
  field.best = bestPositions(field, 3);
  self.postMessage({ type: 'done', id, result: field }, [
    field.score.buffer, field.modelMine.buffer, field.emptyMine.buffer,
    field.modelTheirs.buffer, field.emptyTheirs.buffer, field.ttk.buffer,
    field.mask.buffer,
  ]);
}

function runRose({ id, scene, enemy, params, opts }) {
  const rose = positioningRose(scene, enemy, params, opts);
  self.postMessage({ type: 'done', id, result: rose }, [
    rose.angles.buffer, rose.shape.buffer, rose.visible.buffer,
    rose.openness.buffer, rose.shapeOpenness.buffer,
    rose.modelSeen.buffer, rose.emptySeen.buffer, rose.blocked.buffer,
  ]);
}

self.onmessage = (e) => {
  const job = e.data;
  try {
    if (job.kind === 'rose') runRose(job);
    else runField(job);
  } catch (err) {
    self.postMessage({ type: 'error', id: job.id, message: String((err && err.message) || err) });
  }
};
