/**
 * The paper makes a number of claims precise enough to check. These tests
 * check them against the solver, not against each other.
 *
 *   node --test test/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { box, ramp, groundHeight, DEG, RAD } from '../js/core/geom.js';
import { DEFAULT_PARAMS, diskRadius } from '../js/core/params.js';
import { buildDome, freeDirections, freeDirectionSweep } from '../js/core/dome.js';
import { positioningRose, findNormals } from '../js/core/normals.js';
import {
  apparentDome, makeFramebuffer, look, eyePosition,
  ID_SELF, ID_SELF_B, ID_MODEL, ID_HEAD, ID_MODEL_B, ID_HEAD_B,
} from '../js/core/solver.js';
import { aimbotCriterion, hitProbability, whyItWorks, expectedDps } from '../js/core/duel.js';
import { exposureLaw, cornerControl, visibilityPolygon, polygonArea } from '../js/core/visibility.js';

const FAR = 40;
const WALLH = 3.2;
const P = { ...DEFAULT_PARAMS };

/** Params for the clean analytic case: no jump, so the dome is a prism. */
const flat = (over = {}) => ({
  ...P, jump: 0, domeShape: 'cylinder', bodyRadius: 0.02, ...over,
});

const wallScene = { solids: [box([-FAR, -3, 0], [FAR, 0, 3.2])] };
const cornerScene = {
  solids: [
    box([-2.4, -FAR, 0], [0, FAR, 3.2]),
    box([-FAR, -2.4, 0], [FAR, 0, 3.2]),
  ],
};

// ── §2.2, Figures 6 and 7 — the factor of two ─────────────────────────────
//
// The paper's picture is orthographic: head-on the dome is 2r wide, from the
// side it is r. In between the apparent width is r(1 + cos θ). That is the
// far-field limit of what the solver measures, so we check it there.
const opennessProbe = (p, R) => {
  const enemy = { x: 0, y: 0.02 };
  const fb = makeFramebuffer(p.bufW, p.bufH);
  const clipped = buildDome(wallScene, { ...enemy, yaw: 0 }, p);
  const free = buildDome({ solids: [] }, { ...enemy, yaw: 0 }, p);
  return (thetaDeg) => {
    const b = (90 + thetaDeg) * DEG; // the normal points at +y
    const viewer = { x: enemy.x + Math.cos(b) * R, y: enemy.y + Math.sin(b) * R };
    return apparentDome(viewer, enemy, clipped, p, fb) / apparentDome(viewer, enemy, free, p, fb);
  };
};

test('apparent width of a wall-clipped dome follows r(1 + cos θ) in the far field', () => {
  const openness = opennessProbe(flat({ bufW: 900, bufH: 630, domeGrid: 81 }), 60);
  for (const theta of [0, 30, 45, 60, 90]) {
    const predicted = (1 + Math.cos(theta * DEG)) / 2;
    const got = openness(theta);
    assert.ok(
      Math.abs(got - predicted) < 0.035,
      `θ=${theta}°: solver ${got.toFixed(3)} vs r(1+cos θ)/2r = ${predicted.toFixed(3)}`,
    );
  }
  // The headline of Figures 6 and 7: exactly half as wide from the side.
  assert.ok(Math.abs(openness(90) / openness(0) - 0.5) < 0.04);
});

test('at real fight range perspective leaves him more room than the flat law says', () => {
  // Not a bug and not in the paper: at 9 m the near half of the disk subtends
  // more angle than the far half, so a wall costs him less than r(1+cos θ).
  const near = opennessProbe(flat({ bufW: 900, bufH: 630, domeGrid: 81 }), 9);
  const far = opennessProbe(flat({ bufW: 900, bufH: 630, domeGrid: 81 }), 60);
  const predicted = (1 + Math.cos(45 * DEG)) / 2;
  assert.ok(near(45) > far(45), `9 m: ${near(45).toFixed(3)} vs 60 m: ${far(45).toFixed(3)}`);
  assert.ok(near(45) > predicted + 0.02, 'the excess should be measurable');
  assert.ok(near(45) < predicted + 0.10, 'but small');
});

// ── §4.1-1 — the normal of an infinite wall is unique and perpendicular ────
test('infinite wall has one normal, perpendicular to the wall', () => {
  const p = flat({ samplesAngle: 72, bufW: 96, bufH: 68 });
  const rose = positioningRose(wallScene, { x: 0, y: 0.02 }, p, { n: 72, radius: 9 });
  assert.equal(rose.flat, false);
  assert.equal(rose.normals.length, 1, `got normals at ${rose.normals}`);
  assert.ok(Math.abs(rose.normals[0] - 90) < 8, `normal at ${rose.normals[0]}°, expected 90°`);
});

// ── §4.2-1 — the normal of a corner is the angle bisector ─────────────────
test('corner has one normal, on the angle bisector', () => {
  const p = flat({ samplesAngle: 72, bufW: 96, bufH: 68 });
  const rose = positioningRose(cornerScene, { x: 0.03, y: 0.03 }, p, { n: 72, radius: 9 });
  assert.equal(rose.flat, false);
  assert.equal(rose.normals.length, 1, `got normals at ${rose.normals}`);
  assert.ok(Math.abs(rose.normals[0] - 45) < 8, `normal at ${rose.normals[0]}°, expected 45°`);
});

// ── §2.2, Figure 9 — every direction is a normal in the free case ─────────
test('a free player-dome has no distinguished direction', () => {
  const p = flat({ samplesAngle: 48, bufW: 96, bufH: 68 });
  const rose = positioningRose({ solids: [] }, { x: 0, y: 0 }, p, { n: 48, radius: 9 });
  assert.equal(rose.flat, true, `spread was ${(rose.spread * 100).toFixed(1)}%`);
  assert.equal(rose.normals.length, 0);
});

// ── §4.1-6 — why 45° is not an optimal angle ──────────────────────────────
test('free directions against a wall: 5 at multiples of 45°, 4 in between', () => {
  const p = { ...P, bodyRadius: 0.30 };
  const enemy = { x: 0, y: 0.30 }; // back touching the wall
  const at = (thetaDeg) => {
    const yaw = (90 + thetaDeg) * DEG; // he faces the viewer
    return freeDirections(wallScene, { ...enemy, yaw }, p).nFree;
  };
  assert.equal(at(0), 5, 'straight on');
  assert.equal(at(45), 5, 'the paper\'s 45° case');
  assert.equal(at(90), 5, 'from the side');
  assert.equal(at(65), 4, 'the paper\'s recommended 65°');
  assert.equal(at(-65), 4);
  assert.equal(at(20), 4);
  assert.equal(at(70), 4);
});

test('free-direction sweep spikes exactly at multiples of 45°', () => {
  const p = { ...P, bodyRadius: 0.30 };
  const s = freeDirectionSweep(wallScene, { x: 0, y: 0.30 }, p, 360);
  let spikes = 0;
  for (let i = 0; i < 360; i++) if (s.counts[i] === 5) spikes++;
  // eight isolated spikes, a degree or two wide each
  assert.ok(spikes >= 8 && spikes <= 40, `${spikes} degrees at 5 free directions`);
  const four = Array.from(s.counts).filter((c) => c === 4).length;
  assert.ok(four > 300, `${four} degrees at 4 free directions`);
});

// ── §4.2-4/5 — the corner leaves 3 free directions, 2 once you angle ──────
test('free directions in a corner: 3 on the bisector, 2 at ±20°', () => {
  const p = { ...P, bodyRadius: 0.30 };
  const enemy = { x: 0.30, y: 0.30 };
  const at = (thetaDeg) => {
    const yaw = (45 + thetaDeg) * DEG;
    return freeDirections(cornerScene, { ...enemy, yaw }, p).nFree;
  };
  assert.equal(at(0), 3, 'on the bisector — forward plus the two forward diagonals');
  assert.equal(at(20), 2);
  assert.equal(at(-20), 2);
  assert.equal(at(45), 3, 'hugging one wall is symmetric again');
});

// ── §4.6-2 — the edge of a high ground clips the dome ─────────────────────
test('a high-ground edge cuts the player-dome (he will not fall)', () => {
  const scene = { solids: [box([-FAR, 0, 0], [FAR, FAR, 1.15], { role: 'platform' })] };
  const p = { ...P };
  const onEdge = buildDome(scene, { x: 0, y: 0.5, yaw: -Math.PI / 2 }, p);
  const inland = buildDome(scene, { x: 0, y: 6.0, yaw: -Math.PI / 2 }, p);
  assert.ok(onEdge.clipRatio < 0.75, `edge clipRatio ${onEdge.clipRatio.toFixed(2)}`);
  assert.ok(inland.clipRatio > 0.98, `inland clipRatio ${inland.clipRatio.toFixed(2)}`);
  assert.ok(Math.abs(onEdge.zBase - 1.15) < 1e-6, 'he is standing on the ledge');
});

test('allowing the fall gives most of the dome back', () => {
  const scene = { solids: [box([-FAR, 0, 0], [FAR, FAR, 1.15], { role: 'platform' })] };
  const held = buildDome(scene, { x: 0, y: 0.5, yaw: -Math.PI / 2 }, P);
  const cliff = buildDome(scene, { x: 0, y: 0.5, yaw: -Math.PI / 2 }, { ...P, noFall: false });
  // Not all of it: he still cannot walk through the lip of the ledge.
  assert.ok(cliff.clipRatio > held.clipRatio + 0.2,
    `noFall ${held.clipRatio.toFixed(2)} → fall ${cliff.clipRatio.toFixed(2)}`);
  assert.ok(cliff.clipRatio > 0.85, `clipRatio ${cliff.clipRatio.toFixed(2)}`);
});

// ── §3.8 — where the solver and the paper part company ───────────────────
//
// §4.8-2 says an enemy standing on the corner of a high ground has TWO
// normals, inherited from the two edges. But by the paper's own definition a
// normal is an argmax of apparent surface, and a dome clipped by two
// perpendicular edges is a quarter-disc — whose argmax is a single direction
// on the bisector, exactly as the paper itself concludes for The Corner Case
// in §4.2-1. The solver finds one normal, and this test pins that down.
test('high ground with corner: one normal on the bisector, not two', () => {
  const scene = { solids: [box([0, 0, 0], [FAR, FAR, 2.4], { role: 'platform' })] };
  const p = { ...P, bufW: 160, bufH: 112, domeGrid: 41 };
  const rose = positioningRose(scene, { x: 0.55, y: 0.55 }, p, { n: 120, radius: 9 });
  assert.equal(rose.shapeNormals.length, 1, `got ${rose.shapeNormals.map((n) => n.toFixed(0))}`);
  assert.ok(Math.abs(rose.shapeNormals[0] - 45) < 12, `normal at ${rose.shapeNormals[0].toFixed(0)}°`);
});

// §4.8-1: off the corner and near one edge, it *is* just The High Ground.
test('high ground with corner: near one edge the normal is that edge\'s', () => {
  const scene = { solids: [box([0, 0, 0], [FAR, FAR, 2.4], { role: 'platform' })] };
  const p = { ...P, bufW: 160, bufH: 112, domeGrid: 41 };
  const rose = positioningRose(scene, { x: 3.0, y: 0.6 }, p, { n: 120, radius: 9 });
  const near90 = rose.normals.some((n) => Math.abs(n - 90) < 30);
  assert.ok(near90, `sight normals ${rose.normals.map((n) => n.toFixed(0))} should include ~90°`);
});

// ── §3.5 — the opening clips sight without clipping movement ─────────────
test('the opening leaves the dome free but not its apparent surface', () => {
  const scene = {
    solids: [
      box([-FAR, -0.6, 0], [-1.25, 0.6, WALLH]),
      box([1.25, -0.6, 0], [FAR, 0.6, WALLH]),
    ],
  };
  const p = { ...P, bufW: 160, bufH: 112, domeGrid: 41 };
  const rose = positioningRose(scene, { x: 0.55, y: -2.4 }, p, { n: 120, radius: 9 });
  // He is far enough behind the wall that it never stops him moving...
  assert.equal(rose.shapeFlat, true, 'his reachable set is unclipped');
  // ...but what you can see of it depends strongly on where you stand.
  assert.equal(rose.flat, false, 'yet the apparent surface has a maximum');
  assert.ok(rose.spread > 0.2, `sight spread only ${(rose.spread * 100).toFixed(0)}%`);
});

// ── §4.3-3, Figure 23 — revealed surface falls off as 1/d ────────────────
test('exposure rate scales as 1/d (the peeker\'s advantage)', () => {
  const scene = { solids: [box([-FAR, -0.7, 0], [0, 0.7, 3.2])] };
  const bounds = { x: [-14, 14], y: [-10, 14] };
  const law = exposureLaw(scene, { x: 0, y: -0.7 }, { x: 0.62, y: 0.78 }, bounds, {
    n: 8, dMin: 2, dMax: 12, res: 120, step: 0.3,
  });
  const products = law.points.map((q) => q.measured * q.d);
  const mean = products.reduce((a, b) => a + b, 0) / products.length;
  for (const q of law.points) {
    const rel = Math.abs(q.measured * q.d - mean) / mean;
    assert.ok(rel < 0.45, `d=${q.d.toFixed(1)}: rate·d = ${(q.measured * q.d).toFixed(1)} vs mean ${mean.toFixed(1)}`);
  }
  // monotone decrease is the actual claim
  assert.ok(law.points[0].measured > law.points[law.points.length - 1].measured * 1.8);
});

test('whoever stands further from the corner controls it', () => {
  const scene = { solids: [box([-FAR, -0.7, 0], [0, 0.7, 3.2])] };
  const bounds = { x: [-14, 14], y: [-10, 14] };
  const corner = { x: 0, y: -0.7 };
  const c = cornerControl(scene, { x: 7.5, y: 6.0 }, { x: -1.4, y: -1.9 }, corner, bounds, { res: 120 });
  assert.ok(c.advantage, 'the further player should hold the advantage');
  assert.ok(c.exposureRatio < 1, `exposure ratio ${c.exposureRatio.toFixed(2)} should be < 1`);
});

// ── §1 — the aimbot criterion, on the paper's own numbers ─────────────────
test('the paper\'s aimbot example is a fight you lose', () => {
  const r = aimbotCriterion({ hp: 157, dps: 100 }, [{ hp: 100, dps: 80 }, { hp: 50, dps: 80 }]);
  assert.equal(r.survive, false);
  assert.equal(r.order[0].hp, 50, 'target selection kills the 50 hp enemy first');
  // 0.5 s to kill the 50, taking 160 dps → 80 damage, leaving 77 hp
  const first = r.timeline[0];
  assert.ok(Math.abs(first.dt - 0.5) < 1e-9);
  assert.ok(Math.abs(first.hp - 77) < 1e-9, `hp after first kill: ${first.hp}`);
});

test('the same fight is winnable one enemy at a time', () => {
  const r = aimbotCriterion({ hp: 157, dps: 100 }, [{ hp: 100, dps: 80 }]);
  assert.equal(r.survive, true);
});

// ── the damage overlay: the heuristic is its two partial derivatives ──────
test('an aimbot always hits a visible target', () => {
  assert.equal(hitProbability(0.01, 0), 1);
  assert.equal(hitProbability(0, 0.01), 0);
});

test('expected damage rises with the model-dome and falls with the empty-dome', () => {
  const seen = { model: 0.004, head: 0.0005, empty: 0.02, distance: 12 };
  const w = whyItWorks(P, seen, 0.55);
  assert.ok(w.dByModel > 0, 'bigger model-dome must help');
  assert.ok(w.dByEmpty < 0, 'bigger empty-dome must hurt');
});

test('spread punishes a small model-dome much harder than a large one', () => {
  const p = { ...P, spread: 2.0 };
  const big = expectedDps(p, { model: 0.02, head: 0.002, empty: 0.05, distance: 10 }, 0.5).dps;
  const small = expectedDps(p, { model: 0.002, head: 0.0002, empty: 0.05, distance: 10 }, 0.5).dps;
  const bigNoSpread = expectedDps({ ...p, spread: 0 }, { model: 0.02, head: 0.002, empty: 0.05, distance: 10 }, 0.5).dps;
  const smallNoSpread = expectedDps({ ...p, spread: 0 }, { model: 0.002, head: 0.0002, empty: 0.05, distance: 10 }, 0.5).dps;
  assert.ok(small / smallNoSpread < big / bigNoSpread, 'spread should cost the small target more');
});

// ── the two domes partition the apparent dome exactly ────────────────────
test('model-dome and empty-dome partition the visible player-dome', () => {
  const p = { ...P };
  const scene = { solids: [box([-FAR, -3, 0], [FAR, 0, 3.2])] };
  const enemy = { x: 0, y: 0.3, yaw: Math.PI / 2 };
  const dome = buildDome(scene, enemy, p);
  const r = look(scene, { x: 0, y: 9, yaw: -Math.PI / 2 }, enemy, dome, p);
  assert.ok(Math.abs(r.dome - (r.model + r.empty)) < 1e-12);
  assert.ok(r.model > 0 && r.empty > 0);
  assert.ok(r.head > 0 && r.head < r.model);
});

test('the enemy behind a corner has ~no model-dome but a live player-dome', () => {
  const p = { ...P };
  const wall = box([-FAR, -0.7, 0], [0, 0.7, 3.2]);
  const scene = { solids: [wall] };
  const enemy = { x: -2.6, y: -2.2, yaw: Math.atan2(5.6 + 2.2, 6.2 + 2.6) };
  const me = { x: 6.2, y: 5.6, yaw: 0 };
  const dome = buildDome(scene, enemy, p);
  const hidden = look(scene, me, enemy, dome, p);
  const openDome = buildDome({ solids: [] }, enemy, p);
  const open = look({ solids: [] }, me, enemy, openDome, p);

  assert.ok(hidden.model < open.model * 0.06,
    `model-dome ${(hidden.model * 1000).toFixed(2)} msr vs ${(open.model * 1000).toFixed(2)} msr in the open`);
  assert.ok(hidden.empty > 0, 'but part of where he can go is still on your screen');
  assert.ok(hidden.empty > hidden.model * 20, 'and it dominates what you can see');
});

// ── visibility polygon sanity ─────────────────────────────────────────────
test('a wall removes area from the visibility polygon', () => {
  const bounds = { x: [-14, 14], y: [-10, 14] };
  const open = polygonArea(visibilityPolygon({ solids: [] }, { x: 6, y: 6 }, bounds));
  const blocked = polygonArea(visibilityPolygon(
    { solids: [box([-FAR, -0.7, 0], [0, 0.7, 3.2])] }, { x: 6, y: 6 }, bounds,
  ));
  const total = (bounds.x[1] - bounds.x[0]) * (bounds.y[1] - bounds.y[0]);
  assert.ok(Math.abs(open - total) / total < 0.02, `open ${open.toFixed(0)} vs ${total}`);
  assert.ok(blocked < open * 0.95, `blocked ${blocked.toFixed(0)} vs open ${open.toFixed(0)}`);
});

// ── the slope: mirror-symmetry breaks ────────────────────────────────────
test('a slope gives the uphill player more vertical apparent extent', () => {
  const p = { ...P };
  const scene = { solids: [ramp([-FAR, 0, 0], [FAR, 6.5, 0], '+y', 0, 3.1)] };
  const enemy = { x: 0, y: 3.1, yaw: -Math.PI / 2 };
  const g = groundHeight(scene.solids, enemy.x, enemy.y);
  assert.ok(g > 1.3 && g < 1.7, `slope height at mid-ramp: ${g.toFixed(2)}`);
  const dome = buildDome(scene, enemy, p);
  // the dome spans a real height range because the ground under it tilts
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < dome.reach.length; k++) {
    if (!dome.reach[k]) continue;
    if (dome.zLo[k] < lo) lo = dome.zLo[k];
    if (dome.zHi[k] > hi) hi = dome.zHi[k];
  }
  assert.ok(hi - lo > p.bodyHeight + 0.6, `dome vertical span ${(hi - lo).toFixed(2)} m`);
});

// ── third-person camera ───────────────────────────────────────────────────
//
// A chase camera that passes through walls would quietly hand the third-person
// player vision they do not have, which is exactly the thing these scenarios
// are trying to measure.
test('the chase camera stops at a wall instead of entering it', () => {
  const scene = { solids: [box([-FAR, -2.4, 0], [FAR, 0, WALLH], { role: 'wall' })] };
  const p = { ...P, camera: 'tps' };
  let shortest = Infinity;
  for (const y of [3.0, 1.6, 0.9, 0.45, 0.32]) {
    const actor = { x: 0, y, z: 0, yaw: Math.PI / 2 };  // boom swings toward the wall
    const eye = eyePosition(scene, actor, p);
    const insideWall = eye.y < 0 && eye.z > 0 && eye.z < WALLH;
    assert.ok(!insideWall, `camera at y=${eye.y.toFixed(2)} is inside the wall`);
    shortest = Math.min(shortest, Math.hypot(eye.x - actor.x, eye.y - actor.y));
  }
  // ...and it really did shorten, rather than the test passing by luck
  assert.ok(shortest < 0.5, `boom never shortened, minimum was ${shortest.toFixed(2)} m`);
});

test('the chase camera keeps its full boom in the open', () => {
  const p = { ...P, camera: 'tps' };
  const actor = { x: 0, y: 0, z: 0, yaw: 0 };
  const open = eyePosition({ solids: [] }, actor, p);
  const reach = Math.hypot(open.x, open.y);
  assert.ok(reach > p.tpsBack * 0.9, `boom collapsed to ${reach.toFixed(2)} m with nothing in the way`);
});

test('third person shows your own body without counting it as a target', () => {
  const scene = { solids: [box([-FAR, -2.4, 0], [FAR, 0, WALLH], { role: 'wall' })] };
  // Each player faces the other, which is what puts the camera boom behind the
  // observer rather than off to one side of where he is looking.
  const foe = { x: 0, y: 0.32, yaw: Math.PI / 2, z: 0 };
  const me = { x: 0, y: 8, yaw: -Math.PI / 2, z: 0 };
  const tps = { ...P, camera: 'tps' };
  const dome = buildDome(scene, foe, tps);

  const seen = look(scene, me, foe, dome, tps, { drawWorld: true, targetIs: 'red' });
  let selfPixels = 0;
  for (const v of seen.fb.id) if (v === ID_SELF_B) selfPixels++;
  assert.ok(selfPixels > 0, 'your own body should be on screen in third person');

  // It is drawn, but it is not the enemy, so it must not inflate either figure.
  const fp = look(scene, me, foe, dome, { ...P, camera: 'fps' }, { drawWorld: true });
  let fpSelf = 0;
  for (const v of fp.fb.id) if (v === ID_SELF) fpSelf++;
  assert.equal(fpSelf, 0, 'first person should never draw your own body');
  assert.ok(seen.model > 0 && seen.empty > 0);
  assert.ok(Math.abs(seen.dome - (seen.model + seen.empty)) < 1e-12,
    'the two halves must still partition the visible dome exactly');
});

test('your own body never takes over the third-person view', () => {
  const scene = { solids: [box([-FAR, -2.4, 0], [FAR, 0, WALLH], { role: 'wall' })] };
  const tps = { ...P, camera: 'tps' };
  const blue = { x: 0, y: 9, yaw: -Math.PI / 2, z: 0 };
  const dome = buildDome(scene, blue, tps);
  for (const y of [6, 4, 2.5, 1.5, 1.0, 0.5, 0.32]) {
    const red = { x: 0, y, yaw: Math.PI / 2, z: 0 };   // backing into the wall
    const seen = look(scene, red, blue, dome, tps, { drawWorld: true });
    let self = 0;
    for (const v of seen.fb.id) if (v === ID_SELF) self++;
    const share = self / seen.fb.id.length;
    assert.ok(share < 0.15, `at y=${y} your own body covers ${(share * 100).toFixed(0)}% of the screen`);
    assert.ok(seen.model > 0, `at y=${y} your own body is hiding the enemy entirely`);
  }
});

test('the chase camera sits over the right shoulder by default', () => {
  const p = { ...P, camera: 'tps' };
  const empty = { solids: [] };
  // Right of a player facing (cos yaw, sin yaw) is (sin yaw, -cos yaw).
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7]) {
    const eye = eyePosition(empty, { x: 0, y: 0, z: 0, yaw }, p);
    const bx = -Math.cos(yaw), by = -Math.sin(yaw);
    const ox = eye.x - bx * p.tpsBack, oy = eye.y - by * p.tpsBack;
    const rx = Math.sin(yaw), ry = -Math.cos(yaw);
    const along = ox * rx + oy * ry;
    assert.ok(along > 0, `yaw=${yaw.toFixed(2)} put the camera on the left shoulder`);
    assert.ok(Math.abs(along - p.tpsShoulder) < 1e-9);
  }
  // ...and flipping the setting really does mirror it
  const left = eyePosition(empty, { x: 0, y: 0, z: 0, yaw: 0 }, { ...p, tpsSide: -1 });
  assert.ok(left.y > 0, 'tpsSide -1 should be the left shoulder');
});

// ── player identity survives a camera swap ───────────────────────────────
//
// Blue is you and Red is the enemy in every figure, so the body on screen has
// to be drawn in that player's own colour. Tagging it by role instead meant
// swapping the camera showed Blue's body in Red's colours.
test('the body on screen is tagged by who it is, not by which camera', () => {
  const scene = { solids: [box([-FAR, -2.4, 0], [FAR, 0, WALLH], { role: 'wall' })] };
  const blue = { x: -4, y: 6, yaw: 0, z: 0 };
  const red = { x: 0, y: 0.32, yaw: 0, z: 0 };
  const count = (fb, ids) => {
    let n = 0;
    for (const v of fb.id) if (ids.includes(v)) n++;
    return n;
  };
  const RED = [ID_MODEL, ID_HEAD], BLUE = [ID_MODEL_B, ID_HEAD_B];

  const atRed = look(scene, blue, red, buildDome(scene, red, P), P, { targetIs: 'red' });
  assert.ok(count(atRed.fb, RED) > 0, 'Red should be drawn in red');
  assert.equal(count(atRed.fb, BLUE), 0, 'no blue body when looking at Red');

  const atBlue = look(scene, red, blue, buildDome(scene, blue, P), P, { targetIs: 'blue' });
  assert.ok(count(atBlue.fb, BLUE) > 0, 'Blue should be drawn in blue');
  assert.equal(count(atBlue.fb, RED), 0, 'no red body when looking at Blue');

  // ...and the identity split must not disturb the measurement
  for (const seen of [atRed, atBlue]) {
    assert.ok(seen.model > 0 && seen.empty > 0);
    assert.ok(Math.abs(seen.dome - (seen.model + seen.empty)) < 1e-12);
    assert.ok(seen.head > 0 && seen.head < seen.model);
  }
});

test('in third person each camera shows two identities, not one colour twice', () => {
  const scene = { solids: [box([-FAR, -2.4, 0], [FAR, 0, WALLH], { role: 'wall' })] };
  const tps = { ...P, camera: 'tps' };
  const blue = { x: 0, y: 9, z: 0 };
  const red = { x: 0, y: 4.5, z: 0 };            // clear of the wall, so no fade
  blue.yaw = Math.atan2(red.y - blue.y, red.x - blue.x);
  red.yaw = Math.atan2(blue.y - red.y, blue.x - red.x);
  const count = (fb, ids) => {
    let n = 0;
    for (const v of fb.id) if (ids.includes(v)) n++;
    return n;
  };

  const fromBlue = look(scene, blue, red, buildDome(scene, red, tps), tps, { targetIs: 'red' });
  assert.ok(count(fromBlue.fb, [ID_SELF_B]) > 0, "Blue's own body should be blue");
  assert.ok(count(fromBlue.fb, [ID_MODEL, ID_HEAD]) > 0, 'Red should be red');
  assert.equal(count(fromBlue.fb, [ID_SELF]), 0, "Blue's body must not use Red's colour");

  const fromRed = look(scene, red, blue, buildDome(scene, blue, tps), tps, { targetIs: 'blue' });
  assert.ok(count(fromRed.fb, [ID_SELF]) > 0, "Red's own body should be red");
  assert.ok(count(fromRed.fb, [ID_MODEL_B, ID_HEAD_B]) > 0, 'Blue should be blue');
  assert.equal(count(fromRed.fb, [ID_SELF_B]), 0, "Red's body must not use Blue's colour");

  // and neither own body leaks into the measurement
  for (const seen of [fromBlue, fromRed]) {
    assert.ok(Math.abs(seen.dome - (seen.model + seen.empty)) < 1e-12);
  }
});

test('a chase camera sees past a pillar that the weapon cannot shoot through', () => {
  // The eye is on a boom to the side, the weapon is on the player. Hiding
  // directly behind something narrow separates the two.
  const scene = { solids: [box([-0.3, -0.3, 0], [0.3, 0.3, 3.0], { role: 'rock' })] };
  const you = { x: 0, y: -3 }, foe = { x: 0, y: 8 };
  const yaw = Math.atan2(foe.y - you.y, foe.x - you.x);
  const run = (camera) => {
    const p = { ...DEFAULT_PARAMS, bufW: 300, bufH: 208, domeGrid: 45, camera };
    return look(scene, { ...you, yaw, z: 0 }, { ...foe, yaw: yaw + Math.PI, z: 0 },
      buildDome(scene, { ...foe, yaw: yaw + Math.PI, z: 0 }, p), p,
      { fb: makeFramebuffer(p.bufW, p.bufH), drawWorld: true, targetIs: 'red' });
  };
  const fps = run('fps'), tps = run('tps');

  assert.equal(fps.blocked, 0, 'in first person the eye and the weapon agree');
  assert.ok(tps.blocked > 0, 'the chase camera sees space the weapon cannot reach');
  assert.ok(tps.blocked + tps.dome > fps.dome,
    'the chase camera sees more of the enemy than the first-person eye does');
  assert.ok(tps.blocked > tps.dome,
    'and here most of that extra view is unshootable');
});

test('shot occlusion never invents area, it only re-tags it', () => {
  const scene = { solids: [box([-0.4, -0.4, 0], [0.4, 0.4, 3.0], { role: 'rock' })] };
  const you = { x: 0.2, y: -2.6 }, foe = { x: 0, y: 7 };
  const yaw = Math.atan2(foe.y - you.y, foe.x - you.x);
  const p = { ...DEFAULT_PARAMS, bufW: 260, bufH: 180, domeGrid: 41, camera: 'tps' };
  const r = look(scene, { ...you, yaw, z: 0 }, { ...foe, yaw: yaw + Math.PI, z: 0 },
    buildDome(scene, { ...foe, yaw: yaw + Math.PI, z: 0 }, p), p,
    { fb: makeFramebuffer(p.bufW, p.bufH), drawWorld: true, targetIs: 'red' });
  // everything counted is still inside the frame
  assert.ok(r.seen <= r.viewport + 1e-9, 'what is seen cannot exceed the viewport');
  assert.ok(Math.abs(r.seen - (r.model + r.empty + r.blocked)) < 1e-12,
    'the parts add up to the whole');
  assert.ok(r.blockedModel >= 0 && r.blockedEmpty >= 0);
});
