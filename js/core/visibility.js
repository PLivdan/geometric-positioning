/**
 * visibility.js — what a small step reveals.
 *
 * §4.3-3 is the most quietly important paragraph in the paper:
 *
 *   "the perspective is such that by moving around an obstacle nearby, a lot
 *    of surface behind it is revealed. When you're far from an obstacle ...
 *    very few surface behind [it] is revealed by moving around it. You
 *    therefore have much more control about what you want to see the further
 *    you are from the corner."
 *
 * That is Figure 23, and it is the reason "get further from the corner than
 * he is" beats "hug the corner" in every peeking exercise in the guide.
 *
 * It also has a closed form. Standing a distance d from a corner, a lateral
 * step δ rotates your sight-line past the corner by δ/d, so the area revealed
 * out to a range L is about ½L²·δ/d:
 *
 *        dA/dδ  ≈  L² / (2d)          — revealed surface per metre stepped
 *
 * Exposure falls off as 1/d, and the ratio of two players' control over the
 * corner is just the inverse ratio of their distances to it. `exposureLaw`
 * measures this numerically so the page can put the simulation and the
 * formula on the same axes.
 */

import { segmentClear, v3 } from './geom.js';

/** Footprint segments of everything that blocks sight at height z. */
export function occluderSegments(scene, z = 1.2) {
  const segs = [];
  for (const s of scene.solids) {
    if (s.max.z < z) continue; // you can see over it
    const { min, max } = s;
    const c = [
      [min.x, min.y], [max.x, min.y], [max.x, max.y], [min.x, max.y],
    ];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1] });
    }
  }
  return segs;
}

function raySegment(ox, oy, dx, dy, s) {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const t = ((s.ax - ox) * ey - (s.ay - oy) * ex) / den;
  const u = ((s.ax - ox) * dy - (s.ay - oy) * dx) / den;
  if (t > 1e-7 && u >= -1e-9 && u <= 1 + 1e-9) return t;
  return Infinity;
}

/**
 * Exact visibility polygon by angular sweep: cast a ray at every obstacle
 * corner and a hair either side of it, then sort by angle.
 * @returns {{x:number,y:number}[]}
 */
export function visibilityPolygon(scene, eye, bounds, z = 1.2) {
  const segs = occluderSegments(scene, z);
  const [x0, x1] = bounds.x, [y0, y1] = bounds.y;
  segs.push(
    { ax: x0, ay: y0, bx: x1, by: y0 }, { ax: x1, ay: y0, bx: x1, by: y1 },
    { ax: x1, ay: y1, bx: x0, by: y1 }, { ax: x0, ay: y1, bx: x0, by: y0 },
  );

  const angles = [];
  for (const s of segs) {
    for (const [px, py] of [[s.ax, s.ay], [s.bx, s.by]]) {
      const a = Math.atan2(py - eye.y, px - eye.x);
      angles.push(a - 1e-5, a, a + 1e-5);
    }
  }
  angles.sort((a, b) => a - b);

  const pts = [];
  for (const a of angles) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = Infinity;
    for (const s of segs) {
      const h = raySegment(eye.x, eye.y, dx, dy, s);
      if (h < t) t = h;
    }
    if (t < Infinity) pts.push({ x: eye.x + dx * t, y: eye.y + dy * t, a });
  }
  return pts;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

// -------------------------------------------------------- raster coverage --

/**
 * Rasterised visibility — a grid of 0/1 over the map. Slower than the polygon
 * but it makes set differences (what a step *gains* and *loses*) trivial, and
 * it is what Figure 23's purple region actually is.
 */
export function visibleGrid(scene, eye, bounds, res = 160, z = 1.2) {
  const [x0, x1] = bounds.x, [y0, y1] = bounds.y;
  const nx = res, ny = Math.round((res * (y1 - y0)) / (x1 - x0));
  const g = new Uint8Array(nx * ny);
  const from = v3(eye.x, eye.y, z);
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * dy;
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * dx;
      if (segmentClear(scene.solids, from, v3(x, y, z))) g[j * nx + i] = 1;
    }
  }
  return { g, nx, ny, cellArea: dx * dy, bounds };
}

/**
 * What a step from A to B reveals and what it gives up.
 * `gained` is the purple region of Figure 23.
 */
export function revealed(scene, eyeA, eyeB, bounds, res = 160, z = 1.2) {
  const A = visibleGrid(scene, eyeA, bounds, res, z);
  const B = visibleGrid(scene, eyeB, bounds, res, z);
  const gain = new Uint8Array(A.g.length);
  let gained = 0, lost = 0, kept = 0;
  for (let k = 0; k < A.g.length; k++) {
    if (B.g[k] && !A.g[k]) { gain[k] = 1; gained++; }
    else if (A.g[k] && !B.g[k]) lost++;
    else if (A.g[k]) kept++;
  }
  return {
    A, B, gain,
    gained: gained * A.cellArea,
    lost: lost * A.cellArea,
    kept: kept * A.cellArea,
  };
}

/**
 * Revealed surface per metre of lateral movement, at a given standoff from a
 * corner. This is the number that decides every peeking exercise in §3.
 *
 * @param {Object} scene
 * @param {{x,y}} eye
 * @param {{x,y}} corner   the corner being played around
 * @param {number} step    lateral probe distance (metres)
 */
export function exposureRate(scene, eye, corner, bounds, step = 0.25, res = 200, z = 1.2) {
  const dx = corner.x - eye.x, dy = corner.y - eye.y;
  const d = Math.hypot(dx, dy) || 1;
  // Lateral direction: perpendicular to the line of sight to the corner.
  const lx = -dy / d, ly = dx / d;
  const a = { x: eye.x, y: eye.y };
  // Probe both ways round the corner and average: which way is "forward" is
  // arbitrary, and one of the two may walk into geometry.
  const bR = { x: eye.x + lx * step, y: eye.y + ly * step };
  const bL = { x: eye.x - lx * step, y: eye.y - ly * step };
  const rR = revealed(scene, a, bR, bounds, res, z);
  const rL = revealed(scene, a, bL, bounds, res, z);
  return {
    distance: d,
    gained: (rR.gained + rL.gained) / 2,
    lost: (rR.lost + rL.lost) / 2,
    rate: (rR.gained + rL.gained) / (2 * step),   // m² revealed per metre stepped
    lostRate: (rR.lost + rL.lost) / (2 * step),
    detail: rR,
    detailLeft: rL,
  };
}

/**
 * Sweep the standoff distance and compare the measured exposure rate with the
 * closed form L²/(2d). `L` is the depth of the space behind the corner.
 */
export function exposureLaw(scene, corner, approach, bounds, opts = {}) {
  const n = opts.n ?? 26;
  const dMin = opts.dMin ?? 1.2, dMax = opts.dMax ?? 14;
  const L = opts.L ?? 12;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = dMin + ((dMax - dMin) * i) / (n - 1);
    const eye = { x: corner.x + approach.x * d, y: corner.y + approach.y * d };
    const m = exposureRate(scene, eye, corner, bounds, opts.step ?? 0.3, opts.res ?? 140);
    out.push({ d, measured: m.rate, model: (L * L) / (2 * d) });
  }
  return { points: out, L };
}

/**
 * Who controls the corner. The paper's rule of thumb — "the guy who is the
 * further from the obstacle has a positional advantage" — is exactly the
 * statement that this ratio exceeds 1.
 */
export function cornerControl(scene, me, enemy, corner, bounds, opts = {}) {
  const mine = exposureRate(scene, me, corner, bounds, opts.step ?? 0.3, opts.res ?? 140);
  const theirs = exposureRate(scene, enemy, corner, bounds, opts.step ?? 0.3, opts.res ?? 140);
  return {
    mine, theirs,
    // < 1 means I reveal less per step than he does — I have the finer control
    exposureRatio: theirs.rate > 0 ? mine.rate / theirs.rate : Infinity,
    distanceRatio: mine.distance / theirs.distance,
    advantage: mine.distance > theirs.distance,
  };
}
