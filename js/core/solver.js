/**
 * solver.js — apparent surfaces, measured properly.
 *
 * The paper's central move (§2.2) is to stop thinking about the *volume* of
 * the player-dome and start thinking about its **apparent surface from your
 * perspective**:
 *
 *   "if we take projective aim seriously, then the volume of the player-dome
 *    is irrelevant because what you see on your monitor is a picture in 2
 *    dimensions. What should matter is the apparent surface of the
 *    player-dome from your perspective."
 *
 * So we build the picture. This is a small software rasteriser with a depth
 * buffer and an id buffer; every pixel is tagged as sky, obstacle, empty-dome
 * or model-dome, and every pixel carries its exact solid angle. Summing the
 * tagged pixels gives the model-dome and the empty-dome in steradians — the
 * literal fraction of the monitor each one occupies.
 *
 * The same buffer is what the first-person viewport draws, so the picture you
 * see is the measurement, not an illustration of it.
 */

import { v3, sub, add, mul, dot, cross, norm, len, clamp, rayScene, groundHeight, DEG } from './geom.js';

export const ID_SKY = 0;
export const ID_OBSTACLE = 1;
export const ID_DOME = 2;      // empty-dome (yellow in the paper's Figure 10)
export const ID_MODEL = 3;     // model-dome (orange)
export const ID_HEAD = 4;
export const ID_GROUND = 5;
export const ID_SELF = 6;      // Red's own body, in a chase camera
export const ID_SELF_B = 9;    // Blue's own body
// The body you are looking at is tagged with *whose* body it is, so Blue stays
// blue and Red stays red when the camera swaps. The role (what you can hit)
// is carried by the shape and the gauges, not by the colour of the player.
export const ID_MODEL_B = 7;   // Blue's body
export const ID_HEAD_B = 8;

const NEAR = 0.06;
const INV_FAR = 1 / 4000;   // beyond this a pixel reads as empty space

// ------------------------------------------------------------ framebuffer --

const omegaCache = new Map();

/** Per-pixel solid angle for a pinhole camera: dΩ = da·db / (1+a²+b²)^{3/2}. */
function solidAngleTable(W, H, tanH, tanV) {
  const key = `${W}x${H}:${tanH.toFixed(6)}`;
  const hit = omegaCache.get(key);
  if (hit) return hit;
  const t = new Float32Array(W * H);
  const da = (2 * tanH) / W, db = (2 * tanV) / H;
  for (let y = 0; y < H; y++) {
    const b = tanV - (y + 0.5) * db;
    for (let x = 0; x < W; x++) {
      const a = -tanH + (x + 0.5) * da;
      t[y * W + x] = (da * db) / Math.pow(1 + a * a + b * b, 1.5);
    }
  }
  omegaCache.set(key, t);
  return t;
}

/**
 * The depth buffer holds **reciprocal** depth, 1/z, not z.
 *
 * For a plane, 1/z is linear in screen space, so a scanline can step it with
 * an addition instead of computing a division at every pixel. Nearer simply
 * means larger, and empty space is zero.
 */
export function makeFramebuffer(W, H) {
  return {
    W, H,
    invZ: new Float32Array(W * H),
    id: new Uint8Array(W * H),
    shade: new Float32Array(W * H),
    clear() { this.invZ.fill(0); this.id.fill(ID_SKY); this.shade.fill(1); },
  };
}

/** Lambert term for a face, in camera space, with a fixed key light. */
const LX = -0.42, LY = 0.76, LZ = -0.5;
function shadeOf(nx, ny, nz) {
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  const d = Math.abs((nx * LX + ny * LY + nz * LZ) / l);
  return 0.42 + 0.58 * d;
}

// ----------------------------------------------------------------- camera --

/**
 * @param {{x,y,z}} eye
 * @param {{x,y,z}} target
 */
export function makeCamera(eye, target, W, H, fovDeg) {
  const fwd = norm(sub(target, eye));
  const worldUp = Math.abs(fwd.z) > 0.995 ? v3(1, 0, 0) : v3(0, 0, 1);
  const right = norm(cross(fwd, worldUp));
  const up = cross(right, fwd);
  const tanH = Math.tan((fovDeg * DEG) / 2);
  const tanV = (tanH * H) / W;
  return {
    eye, fwd, right, up, tanH, tanV, W, H,
    omega: solidAngleTable(W, H, tanH, tanV),
    /** yaw/pitch of the view axis, for readouts */
    yaw: Math.atan2(fwd.y, fwd.x),
    pitch: Math.asin(clamp(fwd.z, -1, 1)),
  };
}

/** World point → camera coordinates (X right, Y up, Z forward). */
export function toCam(cam, P) {
  const vx = P.x - cam.eye.x, vy = P.y - cam.eye.y, vz = P.z - cam.eye.z;
  return {
    X: vx * cam.right.x + vy * cam.right.y + vz * cam.right.z,
    Y: vx * cam.up.x + vy * cam.up.y + vz * cam.up.z,
    Z: vx * cam.fwd.x + vy * cam.fwd.y + vz * cam.fwd.z,
  };
}

/** Camera coordinates → pixel coordinates. */
function toPix(cam, c) {
  const a = c.X / c.Z, b = c.Y / c.Z;
  return {
    px: ((a + cam.tanH) / (2 * cam.tanH)) * cam.W,
    py: ((cam.tanV - b) / (2 * cam.tanV)) * cam.H,
  };
}

/** Sutherland–Hodgman clip of a camera-space polygon against Z >= NEAR. */
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const aIn = A.Z >= NEAR, bIn = B.Z >= NEAR;
    if (aIn) out.push(A);
    if (aIn !== bIn) {
      const t = (NEAR - A.Z) / (B.Z - A.Z);
      out.push({ X: A.X + (B.X - A.X) * t, Y: A.Y + (B.Y - A.Y) * t, Z: NEAR });
    }
  }
  return out;
}

// ------------------------------------------------------------ rasterising --
//
// Everything is rasterised through one convex-polygon filler. Three things
// keep it cheap, and they matter because the advantage field runs this
// thousands of times:
//
//   · reciprocal depth, stepped along a scanline by addition, so there is no
//     division in the inner loop
//   · the depth test is written out rather than passed in as a callback,
//     which was costing a function call for every pixel
//   · vertices go through module-level scratch arrays, so a frame allocates
//     nothing and the collector stays out of it

const MAXV = 24;
const VX = new Float64Array(MAXV), VY = new Float64Array(MAXV), VZ = new Float64Array(MAXV);
const CX = new Float64Array(MAXV), CY = new Float64Array(MAXV), CZ = new Float64Array(MAXV);
const PXs = new Float64Array(MAXV), PYs = new Float64Array(MAXV);

/** World-space vertices into camera space, in the scratch arrays. */
function toCamScratch(cam, pts) {
  const n = Math.min(pts.length, MAXV);
  const ex = cam.eye.x, ey = cam.eye.y, ez = cam.eye.z;
  const rx = cam.right.x, ry = cam.right.y, rz = cam.right.z;
  const ux = cam.up.x, uy = cam.up.y, uz = cam.up.z;
  const fx = cam.fwd.x, fy = cam.fwd.y, fz = cam.fwd.z;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const vx = p.x - ex, vy = p.y - ey, vz = p.z - ez;
    VX[i] = vx * rx + vy * ry + vz * rz;
    VY[i] = vx * ux + vy * uy + vz * uz;
    VZ[i] = vx * fx + vy * fy + vz * fz;
  }
  return n;
}

/** Sutherland-Hodgman against Z >= NEAR, scratch to scratch. */
function clipNearScratch(n) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const az = VZ[i], bz = VZ[j];
    const aIn = az >= NEAR, bIn = bz >= NEAR;
    if (aIn) { CX[m] = VX[i]; CY[m] = VY[i]; CZ[m] = az; m++; }
    if (aIn !== bIn && m < MAXV) {
      const t = (NEAR - az) / (bz - az);
      CX[m] = VX[i] + (VX[j] - VX[i]) * t;
      CY[m] = VY[i] + (VY[j] - VY[i]) * t;
      CZ[m] = NEAR; m++;
    }
    if (m >= MAXV) break;
  }
  return m;
}

/**
 * Convex hull of up to eight projected points, by monotone chain, written
 * into HX/HY. Returns the vertex count.
 */
const HX = new Float64Array(20), HY = new Float64Array(20);
const HORD = new Int32Array(20);
function hullOf(px, py, n) {
  for (let i = 0; i < n; i++) HORD[i] = i;
  for (let a = 1; a < n; a++) {
    const v = HORD[a];
    let b = a - 1;
    while (b >= 0 && (px[HORD[b]] > px[v] || (px[HORD[b]] === px[v] && py[HORD[b]] > py[v]))) {
      HORD[b + 1] = HORD[b]; b--;
    }
    HORD[b + 1] = v;
  }
  let m = 0;
  for (let s = 0; s < n; s++) {
    const q = HORD[s];
    while (m >= 2 && (HX[m - 1] - HX[m - 2]) * (py[q] - HY[m - 2])
      - (HY[m - 1] - HY[m - 2]) * (px[q] - HX[m - 2]) <= 0) m--;
    HX[m] = px[q]; HY[m] = py[q]; m++;
  }
  const lower = m + 1;
  for (let s = n - 2; s >= 0; s--) {
    const q = HORD[s];
    while (m >= lower && (HX[m - 1] - HX[m - 2]) * (py[q] - HY[m - 2])
      - (HY[m - 1] - HY[m - 2]) * (px[q] - HX[m - 2]) <= 0) m--;
    HX[m] = px[q]; HY[m] = py[q]; m++;
  }
  return m - 1;
}

/**
 * Fill a convex polygon already in HX/HY by walking its left and right chains.
 *
 * Testing every edge on every scanline is what a naive filler does, and it
 * costs O(edges) per row. Splitting the hull at its highest and lowest
 * vertices gives two monotone chains, and each row then advances a pointer
 * and adds a slope, which is O(1).
 *
 * Depth comes either from a supporting plane, stepped along the row, or as a
 * single value for the whole shape, which is what a dome column uses.
 */
function fillHull(fb, m, id, sh, planar, nx, ny, nz, invC, tanH, tanV, izConst, respect) {
  if (m < 3) return;
  const W = fb.W, H = fb.H;
  let top = 0, bot = 0;
  for (let i = 1; i < m; i++) {
    if (HY[i] < HY[top]) top = i;
    if (HY[i] > HY[bot]) bot = i;
  }
  const y0 = Math.max(0, Math.ceil(HY[top] - 0.5));
  const y1 = Math.min(H - 1, Math.floor(HY[bot] - 0.5));
  if (y1 < y0) return;

  // two monotone chains from the top vertex down to the bottom one
  let li = top, ri = top;
  let lx = HX[top], lslope = 0, lyEnd = HY[top];
  let rx = HX[top], rslope = 0, ryEnd = HY[top];

  const invZ = fb.invZ, idBuf = fb.id, shade = fb.shade;
  const da = (2 * tanH) / W, db = (2 * tanV) / H;
  const stepA = planar ? nx * da * invC : 0;

  for (let y = y0; y <= y1; y++) {
    const scan = y + 0.5;
    while (scan > lyEnd && li !== bot) {
      const nxt = (li + m - 1) % m;
      const dy = HY[nxt] - HY[li];
      lslope = dy > 1e-9 ? (HX[nxt] - HX[li]) / dy : 0;
      lx = HX[li] + (scan - HY[li]) * lslope;
      lyEnd = HY[nxt]; li = nxt;
    }
    while (scan > ryEnd && ri !== bot) {
      const nxt = (ri + 1) % m;
      const dy = HY[nxt] - HY[ri];
      rslope = dy > 1e-9 ? (HX[nxt] - HX[ri]) / dy : 0;
      rx = HX[ri] + (scan - HY[ri]) * rslope;
      ryEnd = HY[nxt]; ri = nxt;
    }
    let xa = lx, xb = rx;
    if (xa > xb) { const t = xa; xa = xb; xb = t; }
    lx += lslope; rx += rslope;

    const x0 = Math.max(0, Math.ceil(xa - 0.5));
    const x1 = Math.min(W - 1, Math.floor(xb - 0.5));
    if (x1 < x0) continue;
    const row = y * W;

    if (planar) {
      const b = tanV - scan * db;
      let iz = (nx * (-tanH + (x0 + 0.5) * da) + ny * b + nz) * invC;
      for (let x = x0; x <= x1; x++, iz += stepA) {
        if (iz <= INV_FAR) continue;
        const k = row + x;
        if (iz <= invZ[k]) continue;
        if (respect) {
          const cur = idBuf[k];
          if (cur === ID_MODEL || cur === ID_HEAD || cur === ID_MODEL_B
            || cur === ID_HEAD_B || cur === ID_SELF || cur === ID_SELF_B) continue;
        }
        invZ[k] = iz; idBuf[k] = id; shade[k] = sh;
      }
    } else {
      for (let x = x0; x <= x1; x++) {
        const k = row + x;
        if (izConst <= invZ[k]) continue;
        if (respect) {
          const cur = idBuf[k];
          if (cur === ID_MODEL || cur === ID_HEAD || cur === ID_MODEL_B
            || cur === ID_HEAD_B || cur === ID_SELF || cur === ID_SELF_B) continue;
        }
        invZ[k] = izConst; idBuf[k] = id; shade[k] = sh;
      }
    }
  }
}

/**
 * Fill the clipped convex polygon now sitting in CX/CY/CZ.
 * @param respect when true, pixels already claimed by a body are left alone
 */
function fillConvex(fb, cam, m, id, respect) {
  if (m < 3) return;

  // Supporting plane in camera coordinates: N·P = c
  let nx = 0, ny = 0, nz = 0;
  for (let i = 1; i < m - 1; i++) {
    const ux = CX[i] - CX[0], uy = CY[i] - CY[0], uz = CZ[i] - CZ[0];
    const vx = CX[i + 1] - CX[0], vy = CY[i + 1] - CY[0], vz = CZ[i + 1] - CZ[0];
    const ax = uy * vz - uz * vy, ay = uz * vx - ux * vz, az = ux * vy - uy * vx;
    if (ax * ax + ay * ay + az * az > 1e-14) { nx = ax; ny = ay; nz = az; break; }
  }
  if (nx === 0 && ny === 0 && nz === 0) return;
  const c = nx * CX[0] + ny * CY[0] + nz * CZ[0];
  if (c > -1e-9 && c < 1e-9) return;          // plane through the eye
  const sh = shadeOf(nx, ny, nz);

  const W = fb.W, H = fb.H;
  const tanH = cam.tanH, tanV = cam.tanV;
  const invC = 1 / c;

  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < m; i++) {
    const iz = 1 / CZ[i];
    PXs[i] = ((CX[i] * iz + tanH) / (2 * tanH)) * W;
    const py = ((tanV - CY[i] * iz) / (2 * tanV)) * H;
    PYs[i] = py;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  if (maxY < minY) return;
  fillHull(fb, hullOf(PXs, PYs, m), id, sh, true, nx, ny, nz, invC, tanH, tanV, 0, respect);
}

/** Project, clip and fill a world-space convex face. */
function drawFace(fb, cam, pts, id, respect) {
  fillConvex(fb, cam, clipNearScratch(toCamScratch(cam, pts)), id, respect);
}

/** Rasterise every face of every solid. */
export function drawSolids(fb, cam, solids, id = ID_OBSTACLE) {
  for (let i = 0; i < solids.length; i++) {
    const faces = solids[i].faces;
    for (let f = 0; f < faces.length; f++) drawFace(fb, cam, faces[f], id, false);
  }
}

const GROUND_QUAD = [v3(-90, -90, 0), v3(90, -90, 0), v3(90, 90, 0), v3(-90, 90, 0)];
/** The world floor, so the scope has a horizon and somewhere to put the grid. */
export function drawGround(fb, cam) {
  drawFace(fb, cam, GROUND_QUAD, ID_GROUND, false);
}

/**
 * The player model: an upright prism for the body plus a box for the head.
 * Crouching only lowers the top, so the feet stay put, which is what makes
 * the "you only see his head" cases work out.
 */
export function drawModel(fb, cam, actor, p, crouch = false, bodyId = ID_MODEL, headId = ID_HEAD) {
  const R = p.bodyRadius;
  const Hh = crouch ? p.crouchHeight : p.bodyHeight;
  const z0 = actor.z ?? 0;
  const neck = z0 + Hh - 2 * p.headRadius;
  const N = 12;
  const lo = [], hi = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + actor.yaw;
    const cx = actor.x + Math.cos(a) * R, cy = actor.y + Math.sin(a) * R;
    lo.push(v3(cx, cy, z0));
    hi.push(v3(cx, cy, neck));
  }
  const quad = [null, null, null, null];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    quad[0] = lo[i]; quad[1] = lo[j]; quad[2] = hi[j]; quad[3] = hi[i];
    drawFace(fb, cam, quad, bodyId, false);
  }
  drawFace(fb, cam, hi, bodyId, false);

  const h = p.headRadius;
  const hz0 = neck, hz1 = z0 + Hh;
  const ca = Math.cos(actor.yaw), sa = Math.sin(actor.yaw);
  const corners = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    corners.push([actor.x + sx * h * ca - sy * h * sa, actor.y + sx * h * sa + sy * h * ca]);
  }
  drawFace(fb, cam, corners.map((q) => v3(q[0], q[1], hz1)), headId, false);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad[0] = v3(corners[i][0], corners[i][1], hz0);
    quad[1] = v3(corners[j][0], corners[j][1], hz0);
    quad[2] = v3(corners[j][0], corners[j][1], hz1);
    quad[3] = v3(corners[i][0], corners[i][1], hz1);
    drawFace(fb, cam, quad, headId, false);
  }
}

/**
 * Rasterise the reachable space as a field of vertical columns.
 *
 * Each reachable cell contributes a box. Three things make this affordable,
 * and it needs to be, because it is the most expensive thing the renderer does:
 *
 *   · only the four floor corners are projected in full. The four above them
 *     differ by one world-space vertical, whose camera-space offset is the
 *     same vector for every column, so they cost three additions each.
 *   · the cells sit far below the angular resolution that matters, so one
 *     reciprocal depth per column is plenty.
 *   · columns are walked front to back, so a hidden one is rejected by a
 *     single comparison per pixel rather than after being shaded.
 *
 * A dome pixel is only written where it beats the depth buffer and where no
 * body has already claimed it, which is exactly the split of the apparent
 * reachable space into what you can hit and where he can move instead.
 */
export function drawDome(fb, cam, dome, id = ID_DOME, respectModel = true) {
  const { K, cell, reach, zLo, zHi } = dome;
  const half = cell * 0.5;
  const idBuf = fb.id, invZ = fb.invZ, shade = fb.shade;
  const W = fb.W, H = fb.H;
  const tanH = cam.tanH, tanV = cam.tanV;
  const ex = cam.eye.x, ey = cam.eye.y, ez = cam.eye.z;
  const rx = cam.right.x, ry = cam.right.y, rz = cam.right.z;
  const ux = cam.up.x, uy = cam.up.y, uz = cam.up.z;
  const fx = cam.fwd.x, fy = cam.fwd.y, fz = cam.fwd.z;
  const sx = W / (2 * tanH), ox = W * 0.5;
  const sy = H / (2 * tanV), oy = H * 0.5;

  const px = DOME_PX, py = DOME_PY;
  const bx = DOME_BX, by = DOME_BY, bz = DOME_BZ;

  const originX = dome.cx - dome.rMax, originY = dome.cy - dome.rMax;
  const stepI = ex > dome.cx ? -1 : 1;
  const stepJ = ey > dome.cy ? -1 : 1;
  const iStart = stepI > 0 ? 0 : K - 1, iEnd = stepI > 0 ? K : -1;
  const jStart = stepJ > 0 ? 0 : K - 1, jEnd = stepJ > 0 ? K : -1;

  for (let j = jStart; j !== jEnd; j += stepJ) {
    const rowBase = j * K;
    const cy0 = originY + (j + 0.5) * cell;
    for (let i = iStart; i !== iEnd; i += stepI) {
      const idx = rowBase + i;
      if (!reach[idx]) continue;
      const cx0 = originX + (i + 0.5) * cell;
      const zl = zLo[idx], hgt = zHi[idx] - zl;

      let behind = false;
      for (let q = 0; q < 4; q++) {
        const wx = cx0 + DOME_DX[q] * half - ex;
        const wy = cy0 + DOME_DY[q] * half - ey;
        const wz = zl - ez;
        const cz = wx * fx + wy * fy + wz * fz;
        if (cz < NEAR) { behind = true; break; }
        bx[q] = wx * rx + wy * ry + wz * rz;
        by[q] = wx * ux + wy * uy + wz * uz;
        bz[q] = cz;
      }
      if (behind) continue;

      const orx = rz * hgt, ouy = uz * hgt, ofz = fz * hgt;
      let sumZ = 0;
      for (let q = 0; q < 4; q++) {
        let iz = 1 / bz[q];
        px[q] = bx[q] * iz * sx + ox;
        py[q] = oy - by[q] * iz * sy;
        sumZ += bz[q];

        const tz = bz[q] + ofz;
        if (tz < NEAR) { behind = true; break; }
        iz = 1 / tz;
        px[q + 4] = (bx[q] + orx) * iz * sx + ox;
        py[q + 4] = oy - (by[q] + ouy) * iz * sy;
      }
      if (behind) continue;

      const zc = sumZ * 0.25 + ofz * 0.5;
      if (zc < NEAR) continue;
      const izc = 1 / zc;

      fillHull(fb, hullOf(px, py, 8), id, 1, false, 0, 0, 0, 0, tanH, tanV, izc, respectModel);
    }
  }
}

// Scratch for one column.
const DOME_PX = new Float64Array(8), DOME_PY = new Float64Array(8);
const DOME_BX = new Float64Array(4), DOME_BY = new Float64Array(4), DOME_BZ = new Float64Array(4);
const DOME_DX = [-1, 1, 1, -1], DOME_DY = [-1, -1, 1, 1];

// ------------------------------------------------------------ measurement --

/**
 * @typedef {Object} Apparent
 * @property {number} model    model-dome, steradians
 * @property {number} head     head only, steradians
 * @property {number} empty    empty-dome, steradians
 * @property {number} dome     model + empty = visible player-dome
 * @property {number} screen   fraction of the viewport the dome occupies
 */

const ACC = new Float64Array(16);

/**
 * Sum the solid angle carried by each tag.
 *
 * Accumulating straight into a table indexed by the tag keeps the inner loop
 * free of branches, which matters because this runs over every pixel of every
 * render, including the thousands the advantage field does.
 */
export function measure(fb, cam) {
  const id = fb.id, om = cam.omega, n = fb.W * fb.H;
  ACC.fill(0);
  let total = 0;
  for (let k = 0; k < n; k++) {
    const w = om[k];
    total += w;
    ACC[id[k]] += w;
  }
  const head = ACC[ID_HEAD] + ACC[ID_HEAD_B];
  const model = ACC[ID_MODEL] + ACC[ID_MODEL_B] + head;
  const empty = ACC[ID_DOME];
  return { model, head, empty, dome: model + empty, viewport: total, screen: (model + empty) / total };
}

/**
 * One full "what does A see of B" evaluation.
 *
 * @param {Object} scene
 * @param {{x,y,yaw}} viewer   the one holding the mouse
 * @param {{x,y,yaw}} target   the one being looked at
 * @param {Object} dome        target's player-dome (built once, reused)
 * @param {Object} p           params
 * @param {Object} [opts]      { fb, occlude, drawWorld }
 */
export function look(scene, viewer, target, dome, p, opts = {}) {
  const W = opts.W ?? p.bufW, H = opts.H ?? p.bufH;
  const fb = opts.fb ?? makeFramebuffer(W, H);
  fb.clear();

  const eye = eyePosition(scene, viewer, p);
  const zT = dome.zBase;
  const aim = { x: target.x, y: target.y, z: zT + p.bodyHeight * 0.62 };
  const cam = makeCamera(eye, aim, fb.W, fb.H, p.fov);

  const occlude = opts.occlude !== false;
  if (opts.drawWorld) drawGround(fb, cam);
  if (occlude) drawSolids(fb, cam, scene.solids);
  // In a chase camera you can see your own character, and it blocks part of
  // your view. It is tagged separately so it never counts toward the target's
  // hittable area or movement room, and your own reachable space is not drawn.
  if (p.camera === 'tps') {
    // When the boom has been pushed right up against the player, the camera
    // ends up inside his own body. Games fade the model out at that point
    // rather than filling the screen with it, and so do we.
    const boom = Math.hypot(eye.x - viewer.x, eye.y - viewer.y);
    if (boom > p.bodyRadius * 3) {
      const zV = viewer.z ?? groundHeight(scene.solids, viewer.x, viewer.y);
      // Your own body carries your identity too. One shared tag meant whoever
      // held the camera was drawn in the same colour, so in third person both
      // players came out the same shade.
      const selfId = opts.targetIs === 'blue' ? ID_SELF : ID_SELF_B;
      drawModel(fb, cam, { ...viewer, z: zV }, p, false, selfId, selfId);
    }
  }
  const blueTarget = opts.targetIs === 'blue';
  drawModel(fb, cam, { ...target, z: zT }, p, opts.crouch,
    blueTarget ? ID_MODEL_B : ID_MODEL, blueTarget ? ID_HEAD_B : ID_HEAD);
  drawDome(fb, cam, dome);

  const m = measure(fb, cam);
  m.distance = Math.hypot(viewer.x - target.x, viewer.y - target.y);
  // Where each visible body meets the floor, so the renderer can ground them.
  m.contacts = [{ x: target.x, y: target.y, r: p.bodyRadius * 1.9 }];
  if (p.camera === 'tps') m.contacts.push({ x: viewer.x, y: viewer.y, r: p.bodyRadius * 1.9 });
  return { fb, cam, ...m };
}

/**
 * Where the camera actually sits: at the eyes, or on a boom behind the
 * shoulder.
 *
 * A chase camera does not pass through walls. The boom is swept from the head
 * to the position it wants and stopped short of the first solid it meets,
 * which is what real third-person cameras do. Backing into a wall therefore
 * shortens your own view rather than showing you the inside of the geometry.
 */
export function eyePosition(scene, actor, p) {
  const g = actor.z ?? 0;
  const base = { x: actor.x, y: actor.y, z: g + p.eyeHeight };
  if (p.camera !== 'tps') return base;

  const yaw = actor.yaw;
  const bx = -Math.cos(yaw), by = -Math.sin(yaw);
  // Right of a player facing (cos yaw, sin yaw) is (sin yaw, -cos yaw), so
  // tpsSide = +1 is the right shoulder, which is the usual default.
  const sx = Math.sin(yaw) * p.tpsSide, sy = -Math.cos(yaw) * p.tpsSide;
  const want = {
    x: base.x + bx * p.tpsBack + sx * p.tpsShoulder,
    y: base.y + by * p.tpsBack + sy * p.tpsShoulder,
    z: base.z + p.tpsUp,
  };

  const solids = scene && scene.solids;
  if (!solids || !solids.length) return want;
  const d = sub(want, base);
  const L = len(d);
  if (L < 1e-6) return want;
  const dir = mul(d, 1 / L);
  const pad = 0.22;                        // keep the near plane clear of the surface
  const hit = rayScene(solids, base, dir, L);
  const t = Math.max(0, Math.min(L, hit - pad));
  return { x: base.x + dir.x * t, y: base.y + dir.y * t, z: base.z + dir.z * t };
}


/**
 * The unoccluded apparent surface of a dome — the quantity whose maximisers
 * the paper calls **normals**. Obstacles between you and the enemy are
 * deliberately ignored here: a normal is a property of the *shape of the
 * reachable set*, not of what happens to be in the way.
 */
export function apparentDome(viewer, target, dome, p, fb) {
  const buf = fb ?? makeFramebuffer(p.bufW, p.bufH);
  buf.clear();
  const eye = { x: viewer.x, y: viewer.y, z: (viewer.z ?? 0) + p.eyeHeight };
  const aim = { x: target.x, y: target.y, z: dome.zBase + p.bodyHeight * 0.62 };
  const cam = makeCamera(eye, aim, buf.W, buf.H, p.fov);
  drawDome(buf, cam, dome, ID_DOME, false);
  const om = cam.omega;
  let s = 0;
  for (let k = 0; k < buf.W * buf.H; k++) if (buf.id[k] === ID_DOME) s += om[k];
  return s;
}
