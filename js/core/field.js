/**
 * field.js — the advantage field.
 *
 * The heuristic judges one position. This sweeps every position on the map,
 * runs the whole duel from both sides at each one, and returns the field of
 * scores. Standing somewhere green means the geometry is working for you
 * before either player has touched their mouse.
 *
 * Two renders per cell (what I see of him, what he sees of me), each with its
 * own player-dome, so this is the expensive part of the project. It runs in a
 * worker and yields row by row.
 */

import { buildDome } from './dome.js';
import { look, makeFramebuffer } from './solver.js';
import { evaluate } from './duel.js';
import { groundHeight, cylinderBlocked } from './geom.js';


/**
 * @param {Object} scene
 * @param {{x,y}} enemy
 * @param {Object} p
 * @param {Object} opts { res, bufW, bufH, domeGrid, weight, trackWeakness, minRange, maxRange }
 * @returns {Generator} yields { row, ny } and finally returns the field
 */
export function* advantageFieldGen(scene, enemy, p, opts = {}) {
  const bounds = opts.bounds ?? scene.bounds;
  const [x0, x1] = bounds.x, [y0, y1] = bounds.y;
  const nx = opts.res ?? 56;
  const ny = Math.max(4, Math.round((nx * (y1 - y0)) / (x1 - x0)));
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;

  const fp = {
    ...p,
    bufW: opts.bufW ?? 64,
    bufH: opts.bufH ?? 46,
    domeGrid: opts.domeGrid ?? 23,
  };
  const weight = opts.weight ?? 0.5;
  const track = opts.trackWeakness ?? 0.55;
  const minRange = opts.minRange ?? 1.6;
  const maxRange = opts.maxRange ?? 1e4;

  const fbA = makeFramebuffer(fp.bufW, fp.bufH);
  const fbB = makeFramebuffer(fp.bufW, fp.bufH);

  const isotropic = Math.abs(p.strafeRatio - 1) < 1e-6 && Math.abs(p.backRatio - 1) < 1e-6;
  const enemyDomeCache = isotropic
    ? buildDome(scene, { x: enemy.x, y: enemy.y, yaw: 0 }, fp)
    : null;

  const n = nx * ny;
  const score = new Float32Array(n).fill(NaN);
  const modelMine = new Float32Array(n);
  const emptyMine = new Float32Array(n);
  const modelTheirs = new Float32Array(n);
  const emptyTheirs = new Float32Array(n);
  const ttk = new Float32Array(n);
  const mask = new Uint8Array(n); // 1 = a legal place to stand

  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * dy;
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * dx;
      const k = j * nx + i;

      const range = Math.hypot(x - enemy.x, y - enemy.y);
      if (range < minRange || range > maxRange) continue;

      const g = groundHeight(scene.solids, x, y);
      if (cylinderBlocked(scene.solids, x, y, g, p.bodyRadius, p.bodyHeight)) continue;

      const yawMe = Math.atan2(enemy.y - y, enemy.x - x);
      const me = { x, y, yaw: yawMe, z: g };
      const foe = { x: enemy.x, y: enemy.y, yaw: yawMe + Math.PI, z: groundHeight(scene.solids, enemy.x, enemy.y) };

      const foeDome = enemyDomeCache ?? buildDome(scene, foe, fp);
      const myDome = buildDome(scene, me, fp);

      const mine = look(scene, me, foe, foeDome, fp, { fb: fbA });
      const theirs = look(scene, foe, me, myDome, fp, { fb: fbB });

      const ev = evaluate(mine, theirs, p, weight, track);
      // Neither of you can see any of the other's player-dome from here, so
      // it is not a position in this fight at all. Leave it out of the field
      // rather than scoring a non-engagement as if it were a good one.
      if (!ev.engaged) continue;
      score[k] = ev.score;
      modelMine[k] = mine.model * 1000;
      emptyMine[k] = mine.empty * 1000;
      modelTheirs[k] = theirs.model * 1000;
      emptyTheirs[k] = theirs.empty * 1000;
      ttk[k] = ev.ttkEdge;
      mask[k] = 1;
    }
    yield { row: j, ny };
  }

  return {
    nx, ny, bounds, dx, dy,
    score, modelMine, emptyMine, modelTheirs, emptyTheirs, ttk, mask,
    enemy: { x: enemy.x, y: enemy.y },
  };
}

/** Run the generator to completion (used off the main thread). */
export function advantageField(scene, enemy, p, opts = {}, onProgress) {
  const gen = advantageFieldGen(scene, enemy, p, opts);
  let r = gen.next();
  while (!r.done) {
    if (onProgress) onProgress(r.value);
    r = gen.next();
  }
  return r.value;
}

/** The best legal position in the field, plus a few runners-up. */
export function bestPositions(field, count = 3, minSeparation = 2.5) {
  const { nx, ny, bounds, score, mask } = field;
  const [x0] = bounds.x, [y0] = bounds.y;
  const cells = [];
  for (let k = 0; k < score.length; k++) {
    if (!mask[k] || Number.isNaN(score[k])) continue;
    cells.push({ k, s: score[k] });
  }
  cells.sort((a, b) => b.s - a.s);
  const picked = [];
  for (const c of cells) {
    const i = c.k % nx, j = (c.k / nx) | 0;
    const x = x0 + (i + 0.5) * field.dx, y = y0 + (j + 0.5) * field.dy;
    if (picked.some((q) => Math.hypot(q.x - x, q.y - y) < minSeparation)) continue;
    picked.push({ x, y, score: c.s });
    if (picked.length >= count) break;
  }
  return picked;
}

/** Percentile stretch so the colour ramp uses its whole range. */
export function fieldRange(values, mask, lo = 0.02, hi = 0.98) {
  const v = [];
  for (let k = 0; k < values.length; k++) if (mask[k] && !Number.isNaN(values[k])) v.push(values[k]);
  if (!v.length) return { lo: -1, hi: 1 };
  v.sort((a, b) => a - b);
  const q = (f) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
  const a = q(lo), b = q(hi);
  const m = Math.max(Math.abs(a), Math.abs(b)) || 1;
  return { lo: -m, hi: m }; // symmetric: 0 is always the neutral colour
}
