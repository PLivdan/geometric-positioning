/**
 * normals.js — finding the directions the paper calls *normals*.
 *
 * §2.2:
 *   "at fixed distance there exists a (non-necessarily unique) direction from
 *    your perspective that maximizes the apparent surface of the player-dome.
 *    Such a direction is called a normal."
 *
 * So a normal is an argmax, and finding one is a one-dimensional optimisation.
 * We sweep the viewing angle right around the enemy at fixed range, measure
 * the apparent surface of his dome at every angle, and read off the maxima.
 *
 * This is the Positioning Rose. Three facts fall straight out of it, and all
 * three are claims the paper makes in prose:
 *
 *   · enemy flat against a wall  → one maximum, perpendicular to the wall,
 *     and the curve is r(1 + cos θ): exactly half as wide from the side (Fig 6/7)
 *   · enemy in a corner          → one maximum, on the angle bisector (Fig 21)
 *   · enemy in the open          → the curve is flat, so *every* direction is
 *     a normal and there is nothing to take an angle on (Fig 9)
 */

import { buildDome, freeDirectionSweep } from './dome.js';
import { apparentDome, makeFramebuffer, look } from './solver.js';
import { wrapDeg, RAD, DEG, box, groundHeight, cylinderBlocked } from './geom.js';

const FLAT_TOLERANCE = 0.025; // below this relative spread, the dome is "free"

/**
 * The reference dome: the same player, at the same height, with nothing to
 * clip him — Figure 3. Elevation matters: an enemy on a 3 m ledge is further
 * from your eye than one on the floor, so comparing him against a reference
 * built at z = 0 would quietly inflate every ratio.
 */
function freeReference(scene, target, p) {
  const z = groundHeight(scene.solids, target.x, target.y);
  const pad = { solids: [box([-500, -500, z - 1], [500, 500, z], { role: 'platform' })] };
  return buildDome(pad, { x: target.x, y: target.y, yaw: 0 }, p);
}

/**
 * @param {Object} scene
 * @param {{x:number,y:number}} target
 * @param {Object} p
 * @param {Object} [opts] { n, radius, withVisible }
 */
export function positioningRose(scene, target, p, opts = {}) {
  const n = opts.n ?? p.samplesAngle;
  const R = opts.radius ?? 9;
  const isotropic = Math.abs(p.strafeRatio - 1) < 1e-6 && Math.abs(p.backRatio - 1) < 1e-6;

  const fb = makeFramebuffer(p.bufW, p.bufH);
  const fbv = makeFramebuffer(p.bufW, p.bufH);

  // Reference: the same dome with nothing to clip it (Figure 3, the free case).
  const freeDome = freeReference(scene, target, p);

  let cached = isotropic
    ? buildDome(scene, { x: target.x, y: target.y, yaw: 0 }, p)
    : null;

  const angles = new Float32Array(n);
  const shape = new Float32Array(n);     // apparent surface of the reachable set alone (msr)
  const visible = new Float32Array(n);   // ...and what an obstacle actually lets you see
  const openness = new Float32Array(n);  // visible / free — the curve the normals come from
  const shapeOpenness = new Float32Array(n);
  const modelSeen = new Float32Array(n);
  const emptySeen = new Float32Array(n);
  // Bearings where the observer would be standing inside geometry. They are
  // still measured — the curve should not have holes in it — but they cannot
  // be normals, because you cannot stand there.
  const blocked = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const psi = (i / n) * Math.PI * 2;
    angles[i] = psi;
    const tgt = { x: target.x, y: target.y, yaw: psi };
    const dome = cached ?? buildDome(scene, tgt, p);
    const vx = target.x + Math.cos(psi) * R, vy = target.y + Math.sin(psi) * R;
    // The sweeping observer stands on whatever is under him — without this his
    // eye ends up buried inside a high ground and sees nothing.
    const gz = groundHeight(scene.solids, vx, vy);
    const viewer = { x: vx, y: vy, z: gz, yaw: psi + Math.PI };
    if (cylinderBlocked(scene.solids, vx, vy, gz, p.bodyRadius, p.bodyHeight)) blocked[i] = 1;

    // The reference: how big would his dome look with nothing in the world?
    const aFree = apparentDome(viewer, tgt, freeDome, p, fb);
    // The shape alone: his dome clipped by what he cannot walk through.
    const aShape = apparentDome(viewer, tgt, dome, p, fb);
    // The real thing: clipped by movement *and* by what you cannot see through.
    const seen = look(scene, viewer, tgt, dome, p, { fb: fbv });

    shape[i] = aShape * 1000;
    visible[i] = seen.dome * 1000;
    modelSeen[i] = seen.model * 1000;
    emptySeen[i] = seen.empty * 1000;
    shapeOpenness[i] = aFree > 0 ? aShape / aFree : 0;
    openness[i] = aFree > 0 ? seen.dome / aFree : 0;
  }

  const peaks = findNormals(openness, n, { blocked });
  const shapePeaks = findNormals(shapeOpenness, n, { blocked });
  const freeSweep = opts.withFreeDirs ? freeDirectionSweep(scene, target, p, n) : null;

  let max = -Infinity, min = Infinity;
  for (let i = 0; i < n; i++) { if (openness[i] > max) max = openness[i]; if (openness[i] < min) min = openness[i]; }

  return {
    n, radius: R, angles,
    shape, visible, openness, shapeOpenness, modelSeen, emptySeen, blocked,
    max, min,
    ...peaks,
    shapeNormals: shapePeaks.normals,
    shapeFlat: shapePeaks.flat,
    freeSweep,
  };
}

/**
 * Locate the maxima of the openness curve.
 *
 * Naively taking "every sample within 1% of the global maximum" splits a
 * single broad hump into three normals as soon as the rasteriser wobbles. So
 * we use **topographic prominence**: a bump only counts as a separate normal
 * if you would have to descend a real distance before climbing to a higher
 * one. That is the difference between "this dome has two normals" and "this
 * dome has one normal and some noise on top of it".
 *
 * @returns {{normals:number[], flat:boolean, peaks:Array}} degrees, world frame
 */
export function findNormals(curve, n, opts = {}) {
  // How far below the global maximum a direction may sit and still count as a
  // maximiser. Measured as a share of the curve's full range.
  const heightTol = opts.heightTol ?? 0.06;
  const blocked = opts.blocked;

  // A light 3-point smooth removes single-sample rasteriser noise without
  // moving any real maximum.
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    c[i] = (curve[(i - 1 + n) % n] + 2 * curve[i] + curve[(i + 1) % n]) / 4;
  }

  let max = -Infinity, min = Infinity;
  for (let i = 0; i < n; i++) {
    if (blocked && blocked[i]) continue;
    if (c[i] > max) max = c[i];
    if (c[i] < min) min = c[i];
  }
  if (!(max > 0)) return { normals: [], arcs: [], flat: true, spread: 0 };
  const spread = (max - min) / max;
  if (spread < FLAT_TOLERANCE) return { normals: [], arcs: [], flat: true, spread };

  const range = max - min;
  const cut = max - heightTol * range;
  const hot = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (c[i] >= cut && !(blocked && blocked[i])) hot[i] = 1;

  // Group the maximising samples into contiguous arcs, wrapping around.
  let start = 0;
  while (start < n && hot[start]) start++;
  if (start === n) return { normals: [], arcs: [], flat: true, spread };

  const arcs = [];
  let cur = null;
  for (let s = 0; s < n; s++) {
    const i = (start + s) % n;
    if (hot[i]) {
      if (!cur) { cur = { idx: [] }; arcs.push(cur); }
      cur.idx.push(i);
    } else cur = null;
  }

  // Two arcs separated only by a shallow dip are one broad normal, not two.
  const merged = [];
  for (const arc of arcs) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const gapFrom = prev.idx[prev.idx.length - 1];
      const gapTo = arc.idx[0];
      let lowest = Infinity;
      for (let i = (gapFrom + 1) % n; i !== gapTo; i = (i + 1) % n) lowest = Math.min(lowest, c[i]);
      if (lowest >= max - 2.5 * heightTol * range) { prev.idx.push(...arc.idx); continue; }
    }
    merged.push(arc);
  }

  const out = merged.map((arc) => {
    let sx = 0, sy = 0, peak = -Infinity;
    for (const i of arc.idx) {
      const a = (i / n) * Math.PI * 2;
      const w = c[i] - min + 1e-9;
      sx += Math.cos(a) * w; sy += Math.sin(a) * w;
      if (c[i] > peak) peak = c[i];
    }
    const deg = wrapDeg((Math.atan2(sy, sx) * 180) / Math.PI);
    const width = (arc.idx.length / n) * 360;
    return { deg, width, value: peak, idx: arc.idx };
  });

  out.sort((a, b) => a.deg - b.deg);
  return { normals: out.map((a) => a.deg), arcs: out, flat: false, spread };
}

/**
 * Angle of a viewer relative to the nearest normal — the paper's "taking an
 * angle". Returns degrees, signed, anticlockwise positive (§4.3-1).
 */
export function angleOffNormal(viewerAngleDeg, normals) {
  if (!normals.length) return { off: 0, normal: null, ambiguous: true };
  let best = null, bestAbs = Infinity;
  for (const nd of normals) {
    const d = wrapDeg(viewerAngleDeg - nd);
    if (Math.abs(d) < bestAbs) { bestAbs = Math.abs(d); best = { off: d, normal: nd }; }
  }
  return { ...best, ambiguous: false };
}

/** Bearing of the viewer as seen from the target, in degrees. */
export function bearing(target, viewer) {
  return Math.atan2(viewer.y - target.y, viewer.x - target.x) * RAD;
}
