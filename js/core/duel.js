/**
 * duel.js — scoring a position, and why the heuristic is true.
 *
 * The heuristic (§2.3), quoted in full:
 *
 *   "In a fight, a positioning is good if the apparent surface of the
 *    model-dome of your enemy (seen from your perspective) is bigger than the
 *    apparent surface of your model-dome (seen from the perspective of your
 *    enemy), and if the apparent surface of the empty-dome of your enemy
 *    (seen from your perspective) is smaller than the apparent surface of
 *    your empty-dome (seen from the perspective of your enemy)."
 *
 * That is two inequalities on four numbers the solver already produces. The
 * damage model below is *not* in the paper — it is the smallest honest model
 * that turns those four numbers into expected DPS, and its only job is to
 * show that the heuristic's two clauses are exactly the two partial
 * derivatives of expected damage. See `whyItWorks`.
 */

const TAU = Math.PI * 2;

/** Angular radius (rad) of a patch of solid angle Ω, treated as a disc. */
export const angularRadius = (omega) => Math.sqrt(Math.max(0, omega) / Math.PI);

/**
 * Probability that one shot lands, given the target's apparent size and the
 * total angular error of the shot.
 *
 * For a circular target of solid angle Ω and an isotropic 2-D Gaussian aim
 * error of standard deviation σ, this is exact:  P = 1 − exp(−Ω / 2πσ²).
 * σ = 0 (an aimbot) gives P = 1 for any visible target.
 */
export function hitProbability(omega, sigma) {
  if (omega <= 0) return 0;
  if (sigma <= 1e-9) return 1;
  return 1 - Math.exp(-omega / (TAU * sigma * sigma));
}

/**
 * Total angular aim error.
 *  - spread is a property of the weapon
 *  - tracking error scales with the space the target has to move into, i.e.
 *    with the angular radius of his **empty-dome**. `trackWeakness` is 1 for
 *    a player who is beaten by all of that space and 0 for a perfect tracker.
 */
export function aimError(p, empty, trackWeakness) {
  const spreadSigma = ((p.spread ?? 0) * Math.PI) / 180 / 2;
  const track = trackWeakness * angularRadius(empty);
  return Math.hypot(spreadSigma, track);
}

/**
 * Expected damage per second against a target whose apparent surfaces we know.
 * @param {Object} p params
 * @param {{model:number, head:number, empty:number, distance:number}} seen
 * @param {number} trackWeakness 0..1
 */
export function expectedDps(p, seen, trackWeakness) {
  const sigma = aimError(p, seen.empty, trackWeakness);
  // A projectile with a radius of its own is easier to land than a hitscan
  // pixel: it enlarges the effective target (§4.5-7, the rocket).
  let model = seen.model;
  if (p.projectileRadius > 0 && seen.distance > 0.2) {
    const grow = Math.atan(p.projectileRadius / seen.distance);
    const r = angularRadius(seen.model) + grow;
    model = Math.PI * r * r;
  }
  const pBody = hitProbability(model, sigma);
  const pHead = hitProbability(Math.min(seen.head, model), sigma);
  const factor = pBody + pHead * ((p.headshotMult ?? 1) - 1);
  return { dps: p.dps * factor, pBody, pHead, sigma, factor };
}

/**
 * Evaluate a duel from both sides.
 * @param {Object} mine   what I see of the enemy   {model, head, empty, dome, distance}
 * @param {Object} theirs what the enemy sees of me
 * @param {Object} p
 * @param {number} weight 0 = pure empty-dome player (precise but slow),
 *                        1 = pure model-dome player (reactive but imprecise)
 */
export function evaluate(mine, theirs, p, weight = 0.5, trackWeakness = 0.55) {
  // The heuristic compares two players who can both see each other. Below this
  // much visible player-dome there is no fight to have an opinion about, and
  // the ratios stop meaning anything: one stray pixel divided by nothing is a
  // very large number, and it is not a good position.
  const ENGAGE = 5e-4;                       // steradians, about half a msr
  const engaged = mine.dome >= ENGAGE && theirs.dome >= ENGAGE;

  // A floor well under one pixel, plus a cap, so no single degenerate cell can
  // dominate a whole advantage field.
  const floor = 1e-6;
  const cap = (v) => (v > 3 ? 3 : v < -3 ? -3 : v);
  const modelEdge = cap(Math.log((mine.model + floor) / (theirs.model + floor)));
  const emptyEdge = cap(Math.log((theirs.empty + floor) / (mine.empty + floor)));

  // "Even" is a real answer here, not a rounding artefact: standing on the
  // normal against an infinite wall makes the two sides literally identical,
  // and §4.1-4 says exactly that — you gain nothing.
  const EVEN = 0.015;
  const even = Math.abs(modelEdge) < EVEN && Math.abs(emptyEdge) < EVEN;
  const clauseModel = mine.model > theirs.model;
  const clauseEmpty = mine.empty < theirs.empty;

  const me = expectedDps(p, mine, trackWeakness);
  const them = expectedDps(p, theirs, trackWeakness);
  const ttkMine = me.dps > 0 ? p.hp / me.dps : Infinity;   // time for me to kill him
  const ttkTheirs = them.dps > 0 ? p.hp / them.dps : Infinity;

  return {
    modelEdge, emptyEdge, engaged,
    clauseModel, clauseEmpty, even,
    satisfied: clauseModel && clauseEmpty,
    score: engaged ? weight * modelEdge + (1 - weight) * emptyEdge : NaN,
    me, them,
    ttkMine, ttkTheirs,
    // Positive means the fight resolves in my favour.
    ttkEdge: (ttkTheirs - ttkMine) / Math.max(1e-6, Math.min(ttkTheirs, ttkMine)),
    verdict:
      !engaged ? 'none'
      : even ? 'even'
      : clauseModel && clauseEmpty ? 'good'
      : !clauseModel && !clauseEmpty ? 'bad'
      : 'mixed',
  };
}

/**
 * The heuristic's two clauses are the two partial derivatives of expected
 * damage. We evaluate them numerically so the page can show the signs rather
 * than assert them.
 */
export function whyItWorks(p, seen, trackWeakness = 0.55) {
  const h = 1e-4;
  const base = expectedDps(p, seen, trackWeakness).dps;
  const dModel = (expectedDps(p, { ...seen, model: seen.model + h, head: seen.head }, trackWeakness).dps - base) / h;
  const dEmpty = (expectedDps(p, { ...seen, empty: seen.empty + h }, trackWeakness).dps - base) / h;
  return {
    base,
    dByModel: dModel,  // > 0 : a bigger model-dome is always better
    dByEmpty: dEmpty,  // < 0 : a bigger empty-dome is always worse
    ratio: dEmpty !== 0 ? Math.abs(dModel / dEmpty) : Infinity,
  };
}

// ------------------------------------------------------- aimbot criterion --

/**
 * §1, the aggressive aimbot criterion:
 *   "a decision to take a fight (or a way to take it) is bad if you have no
 *    way to win it even by assuming you have an aimbot."
 *
 * With an aimbot every shot lands, so the fight is pure arithmetic. Killing
 * the lowest-HP target first always minimises damage taken, so that is the
 * order we simulate. Defaults reproduce the paper's own worked example:
 * 157 hp at 100 dps against 100 hp and 50 hp, each dealing 80 dps — a fight
 * you lose despite more HP and better DPS.
 */
export function aimbotCriterion(me, enemies, opts = {}) {
  const order = [...enemies].sort((a, b) => a.hp - b.hp);
  const switchTime = opts.switchTime ?? 0;
  let hp = me.hp, t = 0;
  const timeline = [];
  let alive = order.length;

  for (let i = 0; i < order.length; i++) {
    const e = order[i];
    const incoming = order.slice(i).reduce((s, x) => s + x.dps, 0);
    if (i > 0 && switchTime > 0) {
      hp -= incoming * switchTime; t += switchTime;
      timeline.push({ phase: 'switch', dt: switchTime, t, hp, incoming });
    }
    const dt = e.hp / me.dps;
    const dmg = incoming * dt;
    if (hp - dmg <= 0) {
      const tDeath = hp / incoming;
      t += tDeath;
      timeline.push({ phase: 'killing', target: e, dt: tDeath, t, hp: 0, incoming, died: true });
      return { survive: false, hpLeft: 0, time: t, killed: order.length - alive, timeline, order };
    }
    hp -= dmg; t += dt; alive--;
    timeline.push({ phase: 'killing', target: e, dt, t, hp, incoming, died: false });
  }
  return { survive: true, hpLeft: hp, time: t, killed: order.length, timeline, order };
}

/**
 * §1, the passive criterion: a decision to *avoid* a fight is bad if there is
 * no way to lose it even assuming the enemy has an aimbot.
 */
export function passiveAimbotCriterion(me, enemies, opts = {}) {
  const totalDps = enemies.reduce((s, e) => s + e.dps, 0);
  const r = aimbotCriterion({ hp: me.hp, dps: me.dps }, enemies, opts);
  return {
    ...r,
    cannotLose: r.survive && r.hpLeft > me.hp * 0.5,
    incoming: totalDps,
  };
}
