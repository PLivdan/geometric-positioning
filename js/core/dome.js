/**
 * dome.js — the player-disk, the player-dome, and free directions.
 *
 * §2.2 of the paper:
 *   "the possible movement of a player during this time is a disk of radius
 *    300ms × v. This disk is called the player-disk ... The analog of the
 *    player-disk [with jumping] is the player-dome. This is a volume."
 *
 * We store the dome as a height field over a square grid: for every cell of
 * the player-disk that the player can actually reach in 300 ms, we keep the
 * vertical interval [zLo, zHi] he can occupy there. Everything else in the
 * project — apparent surfaces, normals, the advantage field — is a query
 * against this one structure.
 */

import {
  v3, sub, len, clamp, groundHeight, cylinderBlocked, segmentClear, DEG,
} from './geom.js';
import { diskAxes } from './params.js';

/**
 * @typedef {Object} Dome
 * @property {number} cx @property {number} cy @property {number} zBase
 * @property {number} K            grid cells per side
 * @property {number} cell         cell size in metres
 * @property {Float32Array} zLo    per cell, -1 where unreachable
 * @property {Float32Array} zHi
 * @property {Uint8Array} reach    1 = reachable
 * @property {number} nReach @property {number} nFree  (free = unclipped disk)
 * @property {number} yaw          facing, radians
 */

/**
 * Build the player-dome of an actor standing at (x, y) and facing `yaw`.
 * @param {{solids:Array}} scene
 * @param {{x:number,y:number,yaw:number}} actor
 */
export function buildDome(scene, actor, p, gridOverride) {
  const solids = scene.solids;
  const ax = diskAxes(p);
  const rMax = Math.max(ax.fwd, ax.back, ax.side);
  const K = gridOverride ?? p.domeGrid;
  const cell = (2 * rMax) / K;
  const zBase = groundHeight(solids, actor.x, actor.y);

  const zLo = new Float32Array(K * K);
  const zHi = new Float32Array(K * K);
  const reach = new Uint8Array(K * K);

  const cs = Math.cos(actor.yaw), sn = Math.sin(actor.yaw);
  const from = v3(actor.x, actor.y, zBase + p.eyeHeight * 0.5);
  let nReach = 0, nFree = 0;

  for (let j = 0; j < K; j++) {
    for (let i = 0; i < K; i++) {
      const idx = j * K + i;
      const x = actor.x - rMax + (i + 0.5) * cell;
      const y = actor.y - rMax + (j + 0.5) * cell;
      const dx = x - actor.x, dy = y - actor.y;

      // Into the actor's own frame: u forward, w lateral.
      const u = dx * cs + dy * sn;
      const w = -dx * sn + dy * cs;
      const ru = u >= 0 ? ax.fwd : ax.back;
      const q = (u / ru) ** 2 + (w / ax.side) ** 2;
      if (q > 1) continue;
      nFree++;

      // --- reachability -------------------------------------------------
      const g = groundHeight(solids, x, y);
      if (p.noFall && g < zBase - 0.45) continue;      // §4.6(2): he will not fall
      if (g > zBase + 0.60) continue;                   // cannot climb it
      if (cylinderBlocked(solids, x, y, g, p.bodyRadius * 0.9, p.bodyHeight)) continue;
      if (!segmentClear(solids, from, v3(x, y, g + p.eyeHeight * 0.5))) continue;

      // --- vertical extent ----------------------------------------------
      const rho = Math.sqrt(q);                          // 0 at centre, 1 at rim
      const cap = p.domeShape === 'cap' ? Math.sqrt(Math.max(0, 1 - rho * rho)) : 1;
      zLo[idx] = g;
      zHi[idx] = g + p.bodyHeight + p.jump * cap;
      reach[idx] = 1;
      nReach++;
    }
  }

  return {
    cx: actor.x, cy: actor.y, zBase, yaw: actor.yaw,
    K, cell, rMax, zLo, zHi, reach, nReach, nFree,
    /** Fraction of the free player-disk that survives the obstacles. */
    clipRatio: nFree ? nReach / nFree : 0,
  };
}

// ------------------------------------------------------- free directions --

/** The eight keyboard directions, in the actor's own frame, from forward. */
export const DIR_NAMES = ['W', 'WD', 'D', 'SD', 'S', 'SA', 'A', 'WA'];
export const DIR_LABELS = [
  'forward', 'forward-right', 'right', 'back-right',
  'back', 'back-left', 'left', 'forward-left',
];

/**
 * How far can the actor actually travel along each of the eight directions
 * before an obstacle stops him?
 *
 * The paper (footnote 23): "a free direction is one of the eight natural
 * directions ... that does not intersect an obstacle if you press it".
 * A direction that merely *slides along* a wall stays free — which is why an
 * angle of exactly 45° leaves the enemy five free directions and 65° leaves
 * only four (§4.1-6). We reproduce that by measuring achievable displacement
 * rather than testing for contact.
 */
export function freeDirections(scene, actor, p) {
  const solids = scene.solids;
  const ax = diskAxes(p);
  const zBase = groundHeight(solids, actor.x, actor.y);
  const out = [];

  for (let k = 0; k < 8; k++) {
    const a = actor.yaw + (k * 45) * DEG;
    const ux = Math.cos(a), uy = Math.sin(a);
    // Anisotropic reach along this direction.
    const uLocal = Math.cos(k * 45 * DEG), wLocal = Math.sin(k * 45 * DEG);
    const ru = uLocal >= 0 ? ax.fwd : ax.back;
    const reach = 1 / Math.hypot(uLocal / ru, wLocal / ax.side);

    // March outwards until the body cylinder is blocked.
    const STEPS = 24;
    let travel = reach;
    for (let s = 1; s <= STEPS; s++) {
      const t = (s / STEPS) * reach;
      const x = actor.x + ux * t, y = actor.y + uy * t;
      const g = groundHeight(solids, x, y);
      const fell = p.noFall && g < zBase - 0.45;
      const climbed = g > zBase + 0.60;
      if (fell || climbed || cylinderBlocked(solids, x, y, g, p.bodyRadius * 0.95, p.bodyHeight)) {
        travel = ((s - 1) / STEPS) * reach;
        break;
      }
    }
    out.push({
      k, key: DIR_NAMES[k], label: DIR_LABELS[k],
      dir: { x: ux, y: uy },
      reach, travel,
      free: travel >= reach * 0.985,
    });
  }

  const nFree = out.reduce((n, d) => n + (d.free ? 1 : 0), 0);
  const mobility = out.reduce((s, d) => s + d.travel, 0) / out.reduce((s, d) => s + d.reach, 0);
  return { dirs: out, nFree, mobility };
}

/**
 * Sweep the opponent around the actor and count free directions at each
 * angle. Produces the staircase with spikes at multiples of 45° that makes
 * §4.1-6 ("why 45° is not an optimal angle") visible at a glance.
 */
export function freeDirectionSweep(scene, actor, p, n = 360) {
  const counts = new Float32Array(n);
  const mob = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2;
    const r = freeDirections(scene, { x: actor.x, y: actor.y, yaw }, p);
    counts[i] = r.nFree;
    mob[i] = r.mobility;
  }
  return { counts, mob, n };
}
