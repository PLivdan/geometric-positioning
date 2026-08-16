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

export function makeFramebuffer(W, H) {
  return {
    W, H,
    depth: new Float32Array(W * H),
    id: new Uint8Array(W * H),
    shade: new Float32Array(W * H),
    clear() { this.depth.fill(Infinity); this.id.fill(ID_SKY); this.shade.fill(1); },
  };
}

/** Lambert term for a face, in camera space, with a fixed key light. */
const LIGHT = { x: -0.42, y: 0.76, z: -0.5 };
function shadeOf(N) {
  const l = Math.hypot(N.x, N.y, N.z) || 1;
  const d = Math.abs((N.x * LIGHT.x + N.y * LIGHT.y + N.z * LIGHT.z) / l);
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

/**
 * Fill a convex camera-space polygon, computing exact per-pixel depth from
 * the polygon's supporting plane. `write` decides whether a pixel is taken.
 */
function fillPolygon(fb, cam, camPoly, id, write) {
  const poly = clipNear(camPoly);
  if (poly.length < 3) return;

  // Supporting plane in camera coords: N·P = c
  const A = poly[0];
  let N = null;
  for (let i = 1; i < poly.length - 1; i++) {
    const B = poly[i], C = poly[i + 1];
    const ux = B.X - A.X, uy = B.Y - A.Y, uz = B.Z - A.Z;
    const vx = C.X - A.X, vy = C.Y - A.Y, vz = C.Z - A.Z;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * nx + ny * ny + nz * nz > 1e-14) { N = { x: nx, y: ny, z: nz }; break; }
  }
  if (!N) return;
  const c = N.x * A.X + N.y * A.Y + N.z * A.Z;
  const sh = shadeOf(N);
  const shadeBuf = fb.shade;

  const pix = poly.map((p) => toPix(cam, p));
  let minY = Infinity, maxY = -Infinity;
  for (const p of pix) { if (p.py < minY) minY = p.py; if (p.py > maxY) maxY = p.py; }
  const y0 = Math.max(0, Math.ceil(minY - 0.5));
  const y1 = Math.min(fb.H - 1, Math.floor(maxY + 0.5));
  if (y1 < y0) return;

  const W = fb.W, depth = fb.depth, idBuf = fb.id;
  const da = (2 * cam.tanH) / W;

  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    // Span of the convex polygon on this scanline.
    let xL = Infinity, xR = -Infinity;
    for (let i = 0; i < pix.length; i++) {
      const P = pix[i], Q = pix[(i + 1) % pix.length];
      if ((P.py <= sy && Q.py > sy) || (Q.py <= sy && P.py > sy)) {
        const t = (sy - P.py) / (Q.py - P.py);
        const x = P.px + (Q.px - P.px) * t;
        if (x < xL) xL = x;
        if (x > xR) xR = x;
      }
    }
    if (xR < xL) continue;
    const x0 = Math.max(0, Math.ceil(xL - 0.5));
    const x1 = Math.min(W - 1, Math.floor(xR + 0.5));
    if (x1 < x0) continue;

    const b = cam.tanV - (sy / fb.H) * 2 * cam.tanV;
    const row = y * W;
    for (let x = x0; x <= x1; x++) {
      const a = -cam.tanH + (x + 0.5) * da;
      const den = N.x * a + N.y * b + N.z;
      if (Math.abs(den) < 1e-12) continue;
      const z = c / den;
      if (z <= NEAR) continue;
      const k = row + x;
      if (write(k, z)) { depth[k] = z; idBuf[k] = id; shadeBuf[k] = sh; }
    }
  }
}

const writeDepth = (fb) => (k, z) => z < fb.depth[k];

/** Rasterise every face of every solid. */
export function drawSolids(fb, cam, solids, id = ID_OBSTACLE) {
  const test = writeDepth(fb);
  for (const s of solids) {
    for (const face of s.faces) {
      fillPolygon(fb, cam, face.map((p) => toCam(cam, p)), id, test);
    }
  }
}

/** The world floor, drawn as one big quad so the scope has a horizon. */
export function drawGround(fb, cam, extent = 90) {
  const test = writeDepth(fb);
  const e = extent;
  const quad = [v3(-e, -e, 0), v3(e, -e, 0), v3(e, e, 0), v3(-e, e, 0)];
  fillPolygon(fb, cam, quad.map((p) => toCam(cam, p)), ID_GROUND, test);
}

/**
 * The player model: an upright prism for the body plus a box for the head.
 * Crouching only lowers the top — the feet stay put, which is what makes the
 * "you only see his head" cases of §4.7 work out.
 */
export function drawModel(fb, cam, actor, p, crouch = false, bodyId = ID_MODEL, headId = ID_HEAD) {
  const test = writeDepth(fb);
  const R = p.bodyRadius;
  const H = crouch ? p.crouchHeight : p.bodyHeight;
  const z0 = actor.z ?? 0;
  const neck = z0 + H - 2 * p.headRadius;
  const N = 12;
  const ring = (z) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + actor.yaw;
      out.push(v3(actor.x + Math.cos(a) * R, actor.y + Math.sin(a) * R, z));
    }
    return out;
  };
  const lo = ring(z0), hi = ring(neck);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    fillPolygon(fb, cam, [lo[i], lo[j], hi[j], hi[i]].map((q) => toCam(cam, q)), bodyId, test);
  }
  fillPolygon(fb, cam, hi.map((q) => toCam(cam, q)), bodyId, test);
  fillPolygon(fb, cam, lo.slice().reverse().map((q) => toCam(cam, q)), bodyId, test);

  // head
  const h = p.headRadius;
  const hz0 = neck, hz1 = z0 + H;
  const corners = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const a = actor.yaw;
    const dx = sx * h * Math.cos(a) - sy * h * Math.sin(a);
    const dy = sx * h * Math.sin(a) + sy * h * Math.cos(a);
    corners.push([actor.x + dx, actor.y + dy]);
  }
  const face = (idx, z) => idx.map((i) => v3(corners[i][0], corners[i][1], z));
  fillPolygon(fb, cam, face([0, 1, 2, 3], hz1).map((q) => toCam(cam, q)), headId, test);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const quad = [
      v3(corners[i][0], corners[i][1], hz0), v3(corners[j][0], corners[j][1], hz0),
      v3(corners[j][0], corners[j][1], hz1), v3(corners[i][0], corners[i][1], hz1),
    ];
    fillPolygon(fb, cam, quad.map((q) => toCam(cam, q)), headId, test);
  }
}

/**
 * Rasterise the player-dome as a field of vertical columns.
 *
 * Each reachable cell contributes a box [cell × cell × (zHi − zLo)]. We fill
 * the convex hull of its eight projected corners at a single depth (the cell
 * centre): the cells are ~8 cm across, far below the angular resolution that
 * matters, and this keeps a 360-angle sweep of the rose interactive.
 *
 * A dome pixel is only written where it beats the depth buffer AND where the
 * model has not already claimed it — which is precisely the paper's split of
 * the apparent dome into model-dome and empty-dome (Figure 10).
 */
export function drawDome(fb, cam, dome, id = ID_DOME, respectModel = true) {
  const { K, cell, reach, zLo, zHi } = dome;
  const half = cell * 0.5;
  const idBuf = fb.id, depth = fb.depth;

  // scratch, reused for every column
  const px = new Float64Array(8), py = new Float64Array(8);
  const ord = new Int32Array(8);
  const hx = new Float64Array(16), hy = new Float64Array(16);

  const dxs = [-half, half, -half, half, -half, half, -half, half];
  const dys = [-half, -half, half, half, -half, -half, half, half];

  for (let j = 0; j < K; j++) {
    for (let i = 0; i < K; i++) {
      const idx = j * K + i;
      if (!reach[idx]) continue;
      const x = dome.cx - dome.rMax + (i + 0.5) * cell;
      const y = dome.cy - dome.rMax + (j + 0.5) * cell;
      const zl = zLo[idx], zh = zHi[idx];

      let behind = false;
      for (let s = 0; s < 8; s++) {
        const wx = x + dxs[s], wy = y + dys[s], wz = s < 4 ? zl : zh;
        const vx = wx - cam.eye.x, vy = wy - cam.eye.y, vz = wz - cam.eye.z;
        const Z = vx * cam.fwd.x + vy * cam.fwd.y + vz * cam.fwd.z;
        if (Z < NEAR) { behind = true; break; }
        const X = vx * cam.right.x + vy * cam.right.y + vz * cam.right.z;
        const Y = vx * cam.up.x + vy * cam.up.y + vz * cam.up.z;
        px[s] = ((X / Z + cam.tanH) / (2 * cam.tanH)) * cam.W;
        py[s] = ((cam.tanV - Y / Z) / (2 * cam.tanV)) * cam.H;
      }
      if (behind) continue;

      // Depth of the column centre — the cells are far below the angular
      // resolution that matters, so one depth per column is plenty.
      const cvx = x - cam.eye.x, cvy = y - cam.eye.y, cvz = (zl + zh) * 0.5 - cam.eye.z;
      const zc = cvx * cam.fwd.x + cvy * cam.fwd.y + cvz * cam.fwd.z;
      if (zc < NEAR) continue;

      // Convex hull of the eight projected corners (Andrew's monotone chain).
      for (let s = 0; s < 8; s++) ord[s] = s;
      for (let a = 1; a < 8; a++) {
        const v = ord[a];
        let b = a - 1;
        while (b >= 0 && (px[ord[b]] > px[v] || (px[ord[b]] === px[v] && py[ord[b]] > py[v]))) {
          ord[b + 1] = ord[b]; b--;
        }
        ord[b + 1] = v;
      }
      let m = 0;
      for (let s = 0; s < 8; s++) {
        const q = ord[s];
        while (m >= 2 &&
          (hx[m - 1] - hx[m - 2]) * (py[q] - hy[m - 2]) -
          (hy[m - 1] - hy[m - 2]) * (px[q] - hx[m - 2]) <= 0) m--;
        hx[m] = px[q]; hy[m] = py[q]; m++;
      }
      const lower = m + 1;
      for (let s = 6; s >= 0; s--) {
        const q = ord[s];
        while (m >= lower &&
          (hx[m - 1] - hx[m - 2]) * (py[q] - hy[m - 2]) -
          (hy[m - 1] - hy[m - 2]) * (px[q] - hx[m - 2]) <= 0) m--;
        hx[m] = px[q]; hy[m] = py[q]; m++;
      }
      m--; // last point repeats the first
      if (m < 3) continue;

      // Scanline-fill the hull.
      let minY = Infinity, maxY = -Infinity;
      for (let s = 0; s < m; s++) { if (hy[s] < minY) minY = hy[s]; if (hy[s] > maxY) maxY = hy[s]; }
      const py0 = Math.max(0, Math.ceil(minY - 0.5));
      const py1 = Math.min(fb.H - 1, Math.floor(maxY - 0.5) + 1);
      for (let yy = py0; yy <= py1; yy++) {
        const sy = yy + 0.5;
        let xL = Infinity, xR = -Infinity;
        for (let s = 0; s < m; s++) {
          const t = (s + 1) % m;
          const ay = hy[s], by = hy[t];
          if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
            const f = (sy - ay) / (by - ay);
            const xx = hx[s] + (hx[t] - hx[s]) * f;
            if (xx < xL) xL = xx;
            if (xx > xR) xR = xx;
          }
        }
        if (xR < xL) continue;
        const px0 = Math.max(0, Math.ceil(xL - 0.5));
        const px1 = Math.min(fb.W - 1, Math.floor(xR - 0.5) + 1);
        const row = yy * fb.W;
        for (let xx = px0; xx <= px1; xx++) {
          const k = row + xx;
          if (zc >= depth[k]) continue;
          if (respectModel) {
            const cur = idBuf[k];
            if (cur === ID_MODEL || cur === ID_HEAD
              || cur === ID_MODEL_B || cur === ID_HEAD_B
              || cur === ID_SELF || cur === ID_SELF_B) continue;
          }
          depth[k] = zc;
          idBuf[k] = id;
          fb.shade[k] = 1;
        }
      }
    }
  }
}

// ------------------------------------------------------------ measurement --

/**
 * @typedef {Object} Apparent
 * @property {number} model    model-dome, steradians
 * @property {number} head     head only, steradians
 * @property {number} empty    empty-dome, steradians
 * @property {number} dome     model + empty = visible player-dome
 * @property {number} screen   fraction of the viewport the dome occupies
 */

export function measure(fb, cam) {
  const { id, W, H } = fb;
  const om = cam.omega;
  let model = 0, head = 0, empty = 0, total = 0;
  for (let k = 0; k < W * H; k++) {
    const w = om[k];
    total += w;
    switch (id[k]) {
      case ID_MODEL: case ID_MODEL_B: model += w; break;
      case ID_HEAD: case ID_HEAD_B: model += w; head += w; break;
      case ID_DOME: empty += w; break;
    }
  }
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
