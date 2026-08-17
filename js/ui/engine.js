/**
 * engine.js — one call that evaluates a whole situation from both chairs.
 *
 * Nothing in the guide can be judged one-sided, so nothing here is. Every
 * widget on the page asks this module the same question — "these two players,
 * this map, what does each of them see?" — and gets back the four apparent
 * surfaces plus the verdict.
 */

import { buildDome, freeDirections } from '../core/dome.js';
import { look, makeFramebuffer } from '../core/solver.js';
import { evaluate, whyItWorks } from '../core/duel.js';
import { groundHeight } from '../core/geom.js';

const pool = new Map();
function fb(W, H, slot = 'a') {
  const k = `${slot}:${W}x${H}`;
  if (!pool.has(k)) pool.set(k, makeFramebuffer(W, H));
  return pool.get(k);
}

/**
 * @param {Object} scene   { solids, bounds }
 * @param {{x,y}} viewer   you
 * @param {{x,y}} enemy    him
 * @param {Object} p       params
 * @param {Object} opts    { W, H, weight, trackWeakness, keepBuffers, drawWorld }
 */
export function evaluatePair(scene, viewer, enemy, p, opts = {}) {
  const W = opts.W ?? p.bufW, H = opts.H ?? p.bufH;
  const yaw = Math.atan2(enemy.y - viewer.y, enemy.x - viewer.x);

  const me = { x: viewer.x, y: viewer.y, yaw, z: groundHeight(scene.solids, viewer.x, viewer.y) };
  const foe = { x: enemy.x, y: enemy.y, yaw: yaw + Math.PI, z: groundHeight(scene.solids, enemy.x, enemy.y) };

  const foeDome = buildDome(scene, foe, p);
  const myDome = buildDome(scene, me, p);

  // Separate buffers so both pictures survive for the two scopes.
  const mine = look(scene, me, foe, foeDome, p, {
    fb: opts.keepBuffers ? makeFramebuffer(W, H) : fb(W, H, 'a'),
    drawWorld: opts.drawWorld !== false, targetIs: 'red',
  });
  const theirs = look(scene, foe, me, myDome, p, {
    fb: opts.keepBuffers ? makeFramebuffer(W, H) : fb(W, H, 'b'),
    drawWorld: opts.drawWorld !== false, targetIs: 'blue',
  });

  const ev = evaluate(mine, theirs, p, opts.weight ?? 0.5, opts.trackWeakness ?? 0.55);
  return {
    me, foe, mine, theirs, ev,
    enemyDome: foeDome, viewerDome: myDome,
    enemyFree: freeDirections(scene, foe, p),
    viewerFree: freeDirections(scene, me, p),
    why: whyItWorks(p, mine, opts.trackWeakness ?? 0.55),
    range: Math.hypot(enemy.x - viewer.x, enemy.y - viewer.y),
  };
}

/**
 * Two dedicated framebuffers, so the pair of scopes can be painted from the
 * exact buffers that were measured rather than from a re-render.
 */
export function makePair(W, H) {
  return { a: makeFramebuffer(W, H), b: makeFramebuffer(W, H) };
}

/** Same as evaluatePair, but writing into buffers you own. */
export function evaluateInto(pair, scene, viewer, enemy, p, opts = {}) {
  const yaw = Math.atan2(enemy.y - viewer.y, enemy.x - viewer.x);
  const me = { x: viewer.x, y: viewer.y, yaw, z: groundHeight(scene.solids, viewer.x, viewer.y) };
  const foe = { x: enemy.x, y: enemy.y, yaw: yaw + Math.PI, z: groundHeight(scene.solids, enemy.x, enemy.y) };

  const foeDome = buildDome(scene, foe, p);
  const myDome = buildDome(scene, me, p);

  // Blue is looking at Red, and Red is looking at Blue.
  const mine = look(scene, me, foe, foeDome, p, { fb: pair.a, drawWorld: true, targetIs: 'red' });
  const theirs = look(scene, foe, me, myDome, p, { fb: pair.b, drawWorld: true, targetIs: 'blue' });
  const ev = evaluate(mine, theirs, p, opts.weight ?? 0.5, opts.trackWeakness ?? 0.55);

  return {
    me, foe, mine, theirs, ev,
    enemyDome: foeDome, viewerDome: myDome,
    enemyFree: freeDirections(scene, foe, p),
    viewerFree: freeDirections(scene, me, p),
    why: whyItWorks(p, mine, opts.trackWeakness ?? 0.55),
    range: Math.hypot(enemy.x - viewer.x, enemy.y - viewer.y),
  };
}

/** Keep a dragged player inside the map and out of the walls. */
export function clampToScene(scene, x, y, p) {
  const b = scene.bounds;
  const m = 0.4;
  let cx = Math.min(Math.max(x, b.x[0] + m), b.x[1] - m);
  let cy = Math.min(Math.max(y, b.y[0] + m), b.y[1] - m);
  for (const s of scene.solids) {
    if (s.max.z < 0.6) continue;                       // low enough to stand on
    if (s.role === 'platform' || s.role === 'slope') continue;
    const r = p.bodyRadius;
    if (cx > s.min.x - r && cx < s.max.x + r && cy > s.min.y - r && cy < s.max.y + r) {
      // push out along the shallowest axis
      const dl = cx - (s.min.x - r), dr = (s.max.x + r) - cx;
      const db = cy - (s.min.y - r), dt = (s.max.y + r) - cy;
      const m2 = Math.min(dl, dr, db, dt);
      if (m2 === dl) cx = s.min.x - r;
      else if (m2 === dr) cx = s.max.x + r;
      else if (m2 === db) cy = s.min.y - r;
      else cy = s.max.y + r;
    }
  }
  return { x: cx, y: cy };
}

/**
 * Size a sharp-pass parameter set to the width the scope is actually drawn
 * at. A fixed buffer is soft on a wide screen and wasteful on a narrow one,
 * and every widget was picking its own number.
 *
 * The cap matters: a pass is roughly linear in pixels, so it is what keeps
 * one redraw in the tens of milliseconds. Widgets that render both cameras
 * pass a lower one, because they pay it twice.
 */
export function fitFine(base, canvas, cap = 900, prev = null) {
  const cssW = canvas.getBoundingClientRect().width;
  if (!cssW) return null;
  const w = Math.min(cap, Math.max(base.bufW, Math.round(cssW)));

  // The settings a reader can change live on `base`, and they change between
  // one render and the next. Only the buffer size is sticky here, because
  // changing that means reallocating. Carrying the whole parameter set over
  // instead meant the sharp pass kept rendering with whatever the settings
  // were when the buffer was last sized, so switching the camera showed the
  // new one while dragging and then reverted to the old one on the redraw.
  if (prev && Math.abs(w - prev.bufW) <= 32) {
    return { params: { ...base, bufW: prev.bufW, bufH: prev.bufH, domeGrid: prev.domeGrid }, resized: false };
  }
  return {
    params: {
      ...base,
      bufW: w,
      bufH: Math.round(w * (base.bufH / base.bufW)),
      // The reachable space is a grid of columns, so its cells have to stay
      // under about two pixels or the silhouette becomes the limit instead.
      domeGrid: Math.max(base.domeGrid, Math.min(71, Math.round(w / 12) * 2 + 1)),
    },
    resized: true,
  };
}
