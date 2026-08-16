/**
 * geom.js — vectors, convex solids, rays.
 *
 * Every obstacle in this project is a convex polyhedron stored twice over:
 *   - as a set of half-spaces  { n, d }  with the interior at  n·p <= d
 *   - as a set of polygonal faces (vertex loops, CCW seen from outside)
 *
 * The half-spaces make containment and ray clipping trivial and branch-free;
 * the faces are what the rasteriser draws. Boxes and ramps both fall out of
 * the same representation, which is why "The Slope" (§3.9) needs no special
 * case anywhere else in the codebase.
 */

// ---------------------------------------------------------------- vectors --

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const norm = (a) => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Wrap an angle in degrees to (-180, 180]. */
export function wrapDeg(a) {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return a === -180 ? 180 : a;
}

/** Signed angle in degrees from vector a to vector b, in the ground plane. */
export function angleBetween2D(a, b) {
  return wrapDeg((Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)) * RAD);
}

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;

// ----------------------------------------------------------------- solids --

/**
 * @typedef {Object} Solid
 * @property {string} id
 * @property {string} kind          'box' | 'ramp'
 * @property {string} [label]       human name used in the UI ("wall A")
 * @property {string} [role]        'wall' | 'platform' | 'rock' | 'slope'
 * @property {{n:{x,y,z}, d:number}[]} planes   interior is n·p <= d
 * @property {{x,y,z}[][]} faces    polygon loops for the rasteriser
 * @property {{x,y,z}} min          axis-aligned bounds, for broad-phase
 * @property {{x,y,z}} max
 * @property {boolean} walkable     can a player stand on its top face
 */

/** Build the six half-spaces + six quads of an axis-aligned box. */
export function box(min, max, opts = {}) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const planes = [
    { n: v3(-1, 0, 0), d: -x0 },
    { n: v3(1, 0, 0), d: x1 },
    { n: v3(0, -1, 0), d: -y0 },
    { n: v3(0, 1, 0), d: y1 },
    { n: v3(0, 0, -1), d: -z0 },
    { n: v3(0, 0, 1), d: z1 },
  ];
  const c = (x, y, z) => v3(x, y, z);
  const faces = [
    [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], // top
    [c(x0, y0, z0), c(x0, y1, z0), c(x1, y1, z0), c(x1, y0, z0)], // bottom
    [c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)], // -y
    [c(x1, y1, z0), c(x0, y1, z0), c(x0, y1, z1), c(x1, y1, z1)], // +y
    [c(x0, y1, z0), c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1)], // -x
    [c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1)], // +x
  ];
  const role = opts.role ?? 'wall';
  return {
    id: opts.id ?? `box${Math.round(x0 * 7 + y0 * 13 + z1 * 29)}`,
    kind: 'box',
    label: opts.label,
    role,
    planes,
    faces,
    min: v3(x0, y0, z0),
    max: v3(x1, y1, z1),
    // You can stand on a high ground; you cannot stand on top of a wall or a
    // rock you were told the enemy cannot climb. Getting this wrong lets the
    // advantage field recommend a position inside a building.
    walkable: opts.walkable ?? (role === 'platform' || role === 'slope'),
  };
}

/**
 * A ramp: the box [min,max] whose top face rises linearly along `axis`
 * from height `zLow` at the low edge to `zHigh` at the high edge.
 * This is "The Slope" of §3.9 and the only non-box primitive we need.
 * @param {'+x'|'-x'|'+y'|'-y'} axis  direction of the *rise*
 */
export function ramp(min, max, axis, zLow, zHigh, opts = {}) {
  const [x0, y0, z0] = min;
  const [x1, y1] = max;
  const horiz = axis === '+x' || axis === '-x';
  const span = horiz ? x1 - x0 : y1 - y0;
  const rise = zHigh - zLow;
  // Top plane: z = zLow + rise * t, t in [0,1] along the rise direction.
  // Written as n·p <= d with n = (-s*rise/span, 0, 1) style.
  const s = axis === '+x' || axis === '+y' ? 1 : -1;
  const base = s > 0 ? (horiz ? x0 : y0) : (horiz ? x1 : y1);
  const k = (s * rise) / span; // dz per unit along the axis
  const n = horiz ? v3(-k, 0, 1) : v3(0, -k, 1);
  const d = zLow - k * base;

  const planes = [
    { n: v3(-1, 0, 0), d: -x0 },
    { n: v3(1, 0, 0), d: x1 },
    { n: v3(0, -1, 0), d: -y0 },
    { n: v3(0, 1, 0), d: y1 },
    { n: v3(0, 0, -1), d: -z0 },
    { n, d },
  ];
  const topZ = (x, y) => zLow + k * ((horiz ? x : y) - base);
  const c = (x, y, z) => v3(x, y, z);
  const t00 = topZ(x0, y0), t10 = topZ(x1, y0), t11 = topZ(x1, y1), t01 = topZ(x0, y1);
  const faces = [
    [c(x0, y0, t00), c(x1, y0, t10), c(x1, y1, t11), c(x0, y1, t01)], // sloped top
    [c(x0, y0, z0), c(x0, y1, z0), c(x1, y1, z0), c(x1, y0, z0)],     // bottom
    [c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, t10), c(x0, y0, t00)],   // -y
    [c(x1, y1, z0), c(x0, y1, z0), c(x0, y1, t01), c(x1, y1, t11)],   // +y
    [c(x0, y1, z0), c(x0, y0, z0), c(x0, y0, t00), c(x0, y1, t01)],   // -x
    [c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, t11), c(x1, y0, t10)],   // +x
  ];
  return {
    id: opts.id ?? `ramp${Math.round(x0 * 7 + y0 * 13)}`,
    kind: 'ramp',
    label: opts.label,
    role: opts.role ?? 'slope',
    planes,
    faces,
    min: v3(x0, y0, z0),
    max: v3(x1, y1, Math.max(zLow, zHigh)),
    walkable: opts.walkable ?? true,
    slope: { axis, zLow, zHigh, k, base, horiz },
  };
}

// -------------------------------------------------------- queries on solids --

/** Is point p strictly inside the solid (with an optional inward margin)? */
export function inside(solid, p, margin = 0) {
  for (const pl of solid.planes) {
    if (pl.n.x * p.x + pl.n.y * p.y + pl.n.z * p.z > pl.d - margin) return false;
  }
  return true;
}

/**
 * Clip the ray o + t*dir against the convex solid.
 * @returns {{t0:number,t1:number}|null} the entry/exit parameters, or null.
 */
export function rayClip(solid, o, dir, tMin = 0, tMax = Infinity) {
  let t0 = tMin, t1 = tMax;
  for (const pl of solid.planes) {
    const nd = pl.n.x * dir.x + pl.n.y * dir.y + pl.n.z * dir.z;
    const np = pl.n.x * o.x + pl.n.y * o.y + pl.n.z * o.z;
    const rest = pl.d - np;
    if (Math.abs(nd) < 1e-12) {
      if (rest < 0) return null; // parallel and outside
    } else {
      const t = rest / nd;
      if (nd > 0) { if (t < t1) t1 = t; }
      else { if (t > t0) t0 = t; }
      if (t0 > t1) return null;
    }
  }
  return { t0, t1 };
}

/** Nearest hit distance of a ray against a list of solids (or Infinity). */
export function rayScene(solids, o, dir, tMax = Infinity, skip = null) {
  let best = tMax;
  for (const s of solids) {
    if (s === skip) continue;
    const c = rayClip(s, o, dir, 1e-6, best);
    if (c && c.t0 < best && c.t0 > 1e-6) best = c.t0;
  }
  return best;
}

/** True if the open segment a→b is clear of every solid. */
export function segmentClear(solids, a, b) {
  const d = sub(b, a);
  const L = len(d);
  if (L < 1e-9) return true;
  const dir = mul(d, 1 / L);
  for (const s of solids) {
    const c = rayClip(s, a, dir, 1e-4, L - 1e-4);
    if (c && c.t1 > c.t0) return false;
  }
  return true;
}

/**
 * Height of the walkable surface under (x,y): the highest top face of any
 * walkable solid at or below `ceiling`, otherwise the world floor at z=0.
 */
export function groundHeight(solids, x, y, ceiling = 1e4) {
  let z = 0;
  const o = v3(x, y, ceiling);
  const down = v3(0, 0, -1);
  for (const s of solids) {
    if (!s.walkable) continue;
    if (x < s.min.x - 1e-9 || x > s.max.x + 1e-9) continue;
    if (y < s.min.y - 1e-9 || y > s.max.y + 1e-9) continue;
    const c = rayClip(s, o, down, 0, Infinity);
    if (c && c.t1 > c.t0) {
      const top = ceiling - c.t0;
      if (top > z && top <= ceiling) z = top;
    }
  }
  return z;
}

/**
 * Does an upright cylinder of radius `rad` centred at (x,y) on the ground
 * overlap any solid over the body band [zFoot+eps, zFoot+height]?
 * Used for movement collision — the player is a capsule, not a point.
 */
export function cylinderBlocked(solids, x, y, zFoot, rad, height) {
  const zLo = zFoot + 0.08, zHi = zFoot + height;
  for (const s of solids) {
    if (s.max.z <= zLo + 1e-9 || s.min.z >= zHi - 1e-9) continue;
    if (s.kind === 'box') {
      const cx = clamp(x, s.min.x, s.max.x);
      const cy = clamp(y, s.min.y, s.max.y);
      if ((cx - x) ** 2 + (cy - y) ** 2 < rad * rad - 1e-9) {
        // inside the footprint — only blocked if the solid actually rises
        // into the body band at this point
        if (s.max.z > zLo) return true;
      }
    } else {
      // ramp: compare against the local top height
      if (x < s.min.x - rad || x > s.max.x + rad) continue;
      if (y < s.min.y - rad || y > s.max.y + rad) continue;
      const q = s.slope.horiz ? clamp(x, s.min.x, s.max.x) : clamp(y, s.min.y, s.max.y);
      const top = s.slope.zLow + s.slope.k * (q - s.slope.base);
      if (top > zLo + 0.35) return true; // a ramp you cannot simply walk up
    }
  }
  return false;
}
