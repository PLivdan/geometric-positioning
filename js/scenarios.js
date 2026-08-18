/**
 * scenarios.js, the ten exercises of §3, as geometry the solver can chew on.
 *
 * Every scene carries the guide's own questions and the guide's own answers.
 * Nothing here is paraphrased into agreement with the solver: where the
 * numbers and the prose part company, the `check` notes say so.
 *
 * Convention used throughout: an **angle** is the bearing from the target to
 * the viewer, measured anticlockwise from the target's nearest normal, in
 * degrees. That matches §4.3-1: "the positive angles with respect to the
 * normal are the ones in the anti-clockwise direction".
 */

import { box, ramp } from './core/geom.js';

const WALL_H = 3.2;
const FAR = 40;

/** Ring of preset viewer positions at a fixed range and a list of angles. */
function ring(cx, cy, range, normalDeg, angles) {
  return angles.map((a) => {
    const t = ((normalDeg + a) * Math.PI) / 180;
    return {
      label: `${a > 0 ? '+' : ''}${a}°`,
      y: cy + Math.sin(t) * range,
    };
  });
}

export const SCENARIOS = [

// ─────────────────────────────────────────────────────────── 3.1 ──────────
{
  id: 'infinite-wall',
  num: '3.1',
  title: 'The Infinite Wall',
  brief:
    'Red has their back against a wall long enough to count as infinite. Half the ' +
    'places they could have moved to are already gone. What Blue does with the ' +
    'half still standing is the whole exercise.',
  bounds: { x: [-16, 16], y: [-3, 18] },
  solids: [box([-FAR, -2.4, 0], [FAR, 0, WALL_H], { label: 'infinite wall', role: 'wall' })],
  enemy: { x: 0, y: 0.32 },
  viewer: { x: 0, y: 9 },
},

// ─────────────────────────────────────────────────────────── 3.2 ──────────
{
  id: 'corner-case',
  num: '3.2',
  title: 'The Corner Case',
  brief:
    'Somebody camped in the corner of a building. It happens whenever people hole ' +
    'up indoors, and it costs them three quarters of their disk.',
  bounds: { x: [-4, 18], y: [-4, 18] },
  solids: [
    box([-2.4, -FAR, 0], [0, FAR, WALL_H], { label: 'wall (west)', role: 'wall' }),
    box([-FAR, -2.4, 0], [FAR, 0, WALL_H], { label: 'wall (south)', role: 'wall' }),
  ],
  enemy: { x: 0.34, y: 0.34 },
  viewer: { x: 6.5, y: 6.5 },
},

// ─────────────────────────────────────────────────────────── 3.3 ──────────
{
  id: 'behind-the-corner',
  num: '3.3',
  title: 'Behind The Corner',
  brief:
    'Red is hiding behind a corner and can step out whenever they like. Blue ' +
    'cannot see any part of them. There is still a position to be won here, and ' +
    'it is decided before either player has anything to shoot at.',
  bounds: { x: [-14, 14], y: [-10, 14] },
  solids: [box([-FAR, -0.7, 0], [0, 0.7, WALL_H], { label: 'wall with a corner', role: 'wall' })],
  enemy: { x: -1.9, y: -1.9 },
  viewer: { x: 6.2, y: 5.6 },
  probes: [
    { label: 'hugging the wall', angle: -180, x: -3.2, y: 2.0 },
    { label: 'close standoff', angle: -135, x: 2.2, y: 2.0 },
    { label: 'far standoff', angle: -135, x: 7.0, y: 6.4 },
    { label: 'very far standoff', angle: -135, x: 10.5, y: 9.8 },
  ],
},

// ─────────────────────────────────────────────────────────── 3.4 ──────────
{
  id: 'the-rock',
  num: '3.4',
  title: 'Engaging The Rock',
  brief:
    'Red is behind a rock they cannot climb. They can circle it and peek-shot, and that is all. A big rock is two Behind The Corner problems sitting back to back. A small one is a different animal.',
  bounds: { x: [-13, 13], y: [-10, 15] },
  solids: [box([-1.5, -1.5, 0], [1.5, 1.5, 2.3], { label: 'rock', role: 'rock' })],
  enemy: { x: 1.55, y: -2.0 },
  viewer: { x: 1.5, y: 8.5 },
  probes: [
    { label: 'straight on', angle: 0, x: 1.55, y: 8.5 },
    { label: 'right side, small angle', angle: 25, x: 5.6, y: 7.2 },
    { label: 'right side, wide', angle: 55, x: 8.8, y: 3.8 },
    { label: 'wrong side', angle: -40, x: -3.4, y: 7.6 },
  ],
  variants: [
    {
      id: 'big-rock', label: 'Make the rock big',
      solids: [box([-3.6, -3.6, 0], [3.6, 3.6, 2.6], { label: 'big rock', role: 'rock' })],
      enemy: { x: 3.7, y: -3.2 },
    },
  ],
},

// ─────────────────────────────────────────────────────────── 3.5 ──────────
{
  id: 'the-opening',
  num: '3.5',
  title: 'The Opening',
  brief:
    'A door, a tunnel mouth, a window. Red is behind it. At 45° you stop aiming at a player and start aiming at a place.',
  bounds: { x: [-14, 14], y: [-11, 14] },
  solids: [
    box([-FAR, -0.6, 0], [-1.25, 0.6, WALL_H], { label: 'wall (left of opening)', role: 'wall' }),
    box([1.25, -0.6, 0], [FAR, 0.6, WALL_H], { label: 'wall (right of opening)', role: 'wall' }),
  ],
  enemy: { x: 0.55, y: -2.4 },
  viewer: { x: 5.0, y: 5.0 },
  probes: [
    { label: 'straight on (0°)', angle: 0, x: 0.55, y: 7.6 },
    { label: '+45°', angle: 45, x: 5.6, y: 5.6 },
    { label: '−45°', angle: -45, x: -4.6, y: 5.6 },
    { label: '+90°', angle: 90, x: 8.2, y: -0.1 },
  ],
},

// ─────────────────────────────────────────────────────────── 3.6 ──────────
{
  id: 'high-ground-low',
  num: '3.6',
  title: 'The High Ground of Low Height',
  brief:
    'Red stands on a ledge low enough that from the floor, at mid range, you can ' +
    'still see more than half of them. Wall A is what blocks you. The edge of ' +
    'floor B is what blocks them. Those are different obstacles and they do ' +
    'different work.',
  bounds: { x: [-13, 13], y: [-14, 10] },
  solids: [box([-FAR, 0, 0], [FAR, FAR, 1.15], { label: 'high ground (low)', role: 'platform' })],
  enemy: { x: 0, y: 0.75 },
  viewer: { x: 0, y: -5.5 },
  probes: [
    { label: 'long range, straight', angle: 0, x: 0, y: -11.5 },
    { label: 'mid range, straight', angle: 0, x: 0, y: -6.0 },
    { label: 'close to wall A', angle: 0, x: 0, y: -1.4 },
    { label: 'close + angled', angle: 62, x: -6.0, y: -1.4 },
  ],
},

// ─────────────────────────────────────────────────────────── 3.7 ──────────
{
  id: 'high-ground-high',
  num: '3.7',
  title: 'The High Ground of High Height',
  brief:
    'Raise wall A until, standing at mid range on the floor, you can barely see ' +
    'half of them. Everything from the low-height case still holds. It simply ' +
    'holds harder.',
  bounds: { x: [-13, 13], y: [-16, 10] },
  solids: [box([-FAR, 0, 0], [FAR, FAR, 2.95], { label: 'high ground (high)', role: 'platform' })],
  enemy: { x: 0, y: 0.75 },
  viewer: { x: 0, y: -6.5 },
  probes: [
    { label: 'long range', angle: 0, x: 0, y: -13.5 },
    { label: 'mid range', angle: 0, x: 0, y: -7.0 },
    { label: 'hugging wall A', angle: 0, x: 0, y: -1.1 },
    { label: 'hugging + angled', angle: 62, x: -5.4, y: -1.1 },
  ],
},

// ─────────────────────────────────────────────────────────── 3.8 ──────────
{
  id: 'high-ground-corner',
  num: '3.8',
  title: 'The High Ground With Corner',
  brief:
    'The high ground has a corner now. An edge A and an edge B meet at a right ' +
    'angle, with low ground zones C and D sitting in front of each of them.',
  bounds: { x: [-14, 12], y: [-14, 12] },
  solids: [box([0, 0, 0], [FAR, FAR, 2.4], { label: 'high ground with corner', role: 'platform' })],
  enemy: { x: 1.1, y: 1.1 },
  viewer: { x: -4.5, y: -4.5 },
  zones: [
    { id: 'C', label: 'zone C', x: [1.5, 11], y: [-12, -1.2] },
    { id: 'D', label: 'zone D', x: [-12, -1.2], y: [1.5, 11] },
  ],
  probes: [
    { label: 'from the corner diagonal', angle: 0, x: -5.0, y: -5.0 },
    { label: 'from zone C', angle: 0, x: 5.5, y: -6.5 },
    { label: 'from zone D', angle: 0, x: -6.5, y: 5.5 },
    { label: 'close under the corner', angle: 0, x: -1.1, y: -1.1 },
  ],
},

// ─────────────────────────────────────────────────────────── 3.9 ──────────
{
  id: 'the-slope',
  num: '3.9',
  title: 'The Slope',
  brief:
    'Red is standing on a slope with half their model hidden. Move them up or down ' +
    'it and their pitch changes a great deal, which is precisely the thing ' +
    'mirror-symmetry assumed would not happen.',
  bounds: { x: [-13, 13], y: [-14, 12] },
  solids: [ramp([-FAR, 0, 0], [FAR, 6.5, 0], '+y', 0, 3.1, { label: 'slope', role: 'slope' })],
  enemy: { x: 0, y: 3.1 },
  viewer: { x: 0, y: -7.5 },
  probes: [
    { label: '0°, on the ground in front', angle: 0, x: 0, y: -7.5 },
    { label: '±90°, from the side', angle: 90, x: -7.5, y: 3.1 },
    { label: '−135°', angle: -135, x: -5.6, y: 8.4 },
    { label: 'close, from the side', angle: 90, x: -3.2, y: 3.1 },
  ],
  variants: [
    {
      id: 'roof', label: 'Make it a roof',
      solids: [
        box([-FAR, 0, 0], [FAR, 6.5, 0.001], { label: 'house body', role: 'wall', walkable: true }),
        ramp([-FAR, 0, 0], [FAR, 6.5, 2.2], '+y', 2.2, 5.0, { label: 'roof', role: 'slope' }),
      ],
      enemy: { x: 0, y: 3.1 },
      note: 'A roof stops at a wall rather than at the ground, so there is a standoff where the vertical extents match again, question (3).',
    },
  ],
},

// ─────────────────────────────────────────────────────────── 3.10 ─────────
{
  id: 'symmetrization',
  num: '3.10',
  title: 'Symmetrization',
  brief:
    'Every exercise so far argued from one side of the fight. This one asks you ' +
    'to turn them around, and then to mix them: a high ground of high height ' +
    'behind an opening, while you are behind a rock.',
  bounds: { x: [-16, 16], y: [-16, 14] },
  solids: [
    box([-FAR, 6, 0], [-1.6, FAR, 2.9], { label: 'high ground, left of opening', role: 'platform' }),
    box([1.6, 6, 0], [FAR, FAR, 2.9], { label: 'high ground, right of opening', role: 'platform' }),
    box([-1.6, 8.4, 0], [1.6, FAR, 2.9], { label: 'high ground behind opening', role: 'platform' }),
    box([-1.4, -4.6, 0], [1.4, -1.8, 2.2], { label: 'your rock', role: 'rock' }),
  ],
  enemy: { x: 0.4, y: 8.6 },
  viewer: { x: 0.2, y: -5.6 },
  probes: [
    { label: 'behind your rock', angle: 0, x: 0.2, y: -5.6 },
    { label: 'angled off the rock', angle: 40, x: 6.4, y: -3.4 },
    { label: 'pushed to the opening', angle: 0, x: 0.4, y: 2.2 },
    { label: 'wide left', angle: -55, x: -8.2, y: -1.0 },
  ],
},

];

export const byId = (id) => SCENARIOS.find((s) => s.id === id);

/** Materialise a scenario (optionally with one of its variants applied). */
export function loadScenario(id, variantId) {
  const base = byId(id);
  if (!base) throw new Error(`no scenario ${id}`);
  const v = variantId ? (base.variants ?? []).find((x) => x.id === variantId) : null;
  return {
    ...base,
    solids: v?.solids ?? base.solids,
    enemy: { ...(v?.enemy ?? base.enemy) },
    viewer: { ...(v?.viewer ?? base.viewer) },
    variantId: v?.id ?? null,
  };
}
