/**
 * heuristic.js — the comparison at the centre of the framework.
 *
 * The comparison involves four quantities and it is very easy to write it as
 * a sentence nobody can parse. So it is never written as a sentence here. It
 * is two screens side by side, each with two bars, and the reader compares
 * pictures rather than nested possessives.
 */

import { el, slider, clear } from '../ui/dom.js';
import { C, alpha } from '../ui/palette.js';
import { drawScope } from '../ui/scope.js';
import { drawPlot } from '../ui/plot.js';
import { createTopDown } from '../ui/topdown.js';
import { gauge, advanced, chip, describe } from '../ui/teach.js';
import { makePair, evaluateInto, evaluatePair, clampToScene } from '../ui/engine.js';
import { DEFAULT_PARAMS } from '../core/params.js';
import { aimbotCriterion } from '../core/duel.js';
import { buildDome } from '../core/dome.js';
import { apparentDome, makeFramebuffer } from '../core/solver.js';
import { box, groundHeight, DEG } from '../core/geom.js';

const FAR = 40;

// ═════════════════════════════════════ should I take this fight? ═════════
/**
 * The gate that sits in front of all the geometry. Nothing on this page helps
 * with a fight that cannot be won regardless of how well it is played, so the
 * arithmetic that decides that comes first and stays short.
 */
export function aimbot(mount) {
  const me = { hp: 157, dps: 100 };
  let foes = [{ hp: 100, dps: 80 }, { hp: 50, dps: 80 }];

  const verdict = el('div');
  const foeList = el('div.stack');

  const num = (label, value, onchange) => el('div.ctl',
    el('div.ctl-top', el('label', label)),
    el('input', {
      type: 'number', value, min: 1, max: 2000, step: 1,
      oninput: (e) => onchange(Math.max(1, parseFloat(e.target.value) || 1)),
    }),
  );

  mount.appendChild(el('div.stack',
    el('div.panel',
      el('div.panel-head', el('span', 'Perfect aim, and the fight still resolves')),
      el('div.panel-body.stack',
        el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' } },
          num('Your health', me.hp, (v) => { me.hp = v; run(); }),
          num('Your damage per second', me.dps, (v) => { me.dps = v; run(); }),
        ),
        el('div', { style: { borderTop: '1px solid var(--rule)', paddingTop: '0.7rem' } }, foeList),
        el('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } },
          el('button.btn.ghost', {
            type: 'button',
            onclick: () => { if (foes.length < 4) { foes.push({ hp: 100, dps: 60 }); drawFoes(); run(); } },
          }, 'Add an enemy'),
          el('button.btn.ghost', {
            type: 'button',
            onclick: () => { foes = [{ hp: 100, dps: 80 }, { hp: 50, dps: 80 }]; me.hp = 157; me.dps = 100; drawFoes(); run(); },
          }, 'Reset'),
        ),
      ),
    ),
    verdict,
  ));

  function drawFoes() {
    clear(foeList);
    foes.forEach((f, i) => foeList.appendChild(el('div', {
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.6rem', alignItems: 'end' },
    },
      num(`Enemy ${i + 1} health`, f.hp, (v) => { f.hp = v; run(); }),
      num('Damage per second', f.dps, (v) => { f.dps = v; run(); }),
      el('button.btn.ghost', {
        type: 'button', title: 'remove', disabled: foes.length <= 1,
        onclick: () => { foes.splice(i, 1); drawFoes(); run(); },
      }, '×'),
    )));
  }

  function run() {
    const r = aimbotCriterion(me, foes);
    const incoming = foes.reduce((s, f) => s + f.dps, 0);
    clear(verdict);
    verdict.appendChild(el('div.panel', el('div.panel-body',
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' } },
        el(`span.tag.${r.survive ? 'good' : 'bad'}`, r.survive ? 'Winnable' : 'Not winnable'),
        el('span', { class: 'mono', style: { fontSize: 'var(--step--1)', color: 'var(--ink-2)' } },
          r.survive
            ? `${r.hpLeft.toFixed(0)} health left after ${r.time.toFixed(2)} s`
            : `dead at ${r.time.toFixed(2)} s, ${r.killed} of ${foes.length} down`),
      ),
      el('p', { style: { marginTop: '0.7rem', marginBottom: 0, fontSize: 'var(--step--1)' } },
        r.survive
          ? `Against ${incoming} incoming damage per second you finish this with health to spare, so the geometry is worth thinking about.`
          : `${incoming} incoming damage per second kills you first, even with every shot landing and targets taken in the best order. No amount of positioning rescues this one. Change the fight instead.`),
    )));
  }

  drawFoes();
  run();
}

// ═══════════════════════════════════ the four-way comparison ═════════════
/**
 * Both cameras at once, two bars each. Whatever the reader concludes has to
 * survive looking at the right-hand panel, which is the entire point.
 */
export function compare(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 158, bufH: 110, domeGrid: 35 };
  const scene = {
    bounds: { x: [-13, 13], y: [-3, 15] },
    solids: [box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'wall', role: 'wall' })],
  };
  let you = { x: -5.4, y: 5.6 };
  let enemy = { x: 0, y: 0.32 };
  let weight = 0.5, track = 0.55;

  // Both viewports are on screen here, so both get the sharper pass, and both
  // are paid for on every one. Hence the lower cap.
  let fine = { ...p, bufW: 380, bufH: Math.round(380 * (p.bufH / p.bufW)), domeGrid: 51 };
  const pair = makePair(p.bufW, p.bufH);
  let finePair = makePair(fine.bufW, fine.bufH);
  function ensureFine() {
    const next = fitFine(p, scopeA, 640);
    if (!next || Math.abs(next.bufW - fine.bufW) <= 32) return;
    fine = next;
    finePair = makePair(fine.bufW, fine.bufH);
  }
  const refBuf = makeFramebuffer(p.bufW, p.bufH);
  let refineTimer = 0;
  const scopeA = el('canvas'), scopeB = el('canvas'), mapCanvas = el('canvas');

  const yourModel = gauge('Red body you can hit', { swatch: 'orange', color: 'var(--orange)' });
  const yourEmpty = gauge('Red movement to cover', { swatch: 'yellow', color: '#c9a521' });
  const theirModel = gauge('Blue body they can hit', { swatch: 'orange', color: 'var(--orange)' });
  const theirEmpty = gauge('Blue movement to cover', { swatch: 'yellow', color: '#c9a521' });

  const verdictTag = el('span.tag', 'idle');
  const verdictText = el('p', { style: { margin: '0.6rem 0 0', fontSize: 'var(--step-0)' } });
  const exact = el('div', { class: 'mono', style: { fontSize: 'var(--step--2)', lineHeight: '1.7', color: 'var(--ink-2)' } });

  const panel = (title, sub, canvas, gModel, gEmpty) => el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', title), el('b', sub)),
      el('div', canvas),
    ),
    el('div.panel', el('div.panel-body', el('div.gauge', gModel, gEmpty))),
  );

  mount.appendChild(el('div.stack',
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))', gap: 'var(--gap)' } },
      panel("Blue's screen", 'what you get', scopeA, yourModel, yourEmpty),
      panel("Red's screen", 'what they get', scopeB, theirModel, theirEmpty),
    ),
    el('div.panel',
      el('div.panel-head', el('span', 'Reading the two screens together'), verdictTag),
      el('div.panel-body', verdictText, advanced('Exact figures', exact)),
    ),
    el('div.map-wrap',
      el('div.scope', el('div', mapCanvas)),
      el('div.map-hint', 'drag either player'),
    ),
    el('div.panel', el('div.panel-body',
      el('div.controls',
        slider({
          label: 'What beats your aim', min: 0, max: 1, step: 0.01, value: weight,
          format: (v) => (v < 0.35 ? 'small targets' : v > 0.65 ? 'fast movement' : 'both equally'),
          hint: 'a precise but slow player and a fast but loose one want different positions',
          oninput: (v) => { weight = v; draw(); },
        }),
        slider({
          label: 'How much of their room actually beats you', min: 0, max: 1, step: 0.01, value: track,
          format: (v) => (v === 0 ? 'none of it' : `${(v * 100).toFixed(0)}%`),
          hint: 'set this to none and only the hittable area matters',
          oninput: (v) => { track = v; draw(); },
        }),
      ),
    )),
  ));

  const map = createTopDown(mapCanvas, {
    maxHeight: 300,
    onDrag: (who, x, y) => {
      const q = clampToScene(scene, x, y, p);
      if (who === 'viewer') you = q; else enemy = q;
      draw('fast');
    },
  });

  function reference(observer, target) {
    const z = groundHeight(scene.solids, target.x, target.y);
    const pad = { solids: [box([-500, -500, z - 1], [500, 500, z], { role: 'platform' })] };
    const d = buildDome(pad, { x: target.x, y: target.y, yaw: 0 }, p);
    return apparentDome(
      { x: observer.x, y: observer.y, z: groundHeight(scene.solids, observer.x, observer.y) },
      target, d, p, refBuf,
    ) * 1000;
  }

  function draw(quality = 'fine') {
    const hi = quality === 'fine';
    if (hi) ensureFine();
    const r = evaluateInto(hi ? finePair : pair, scene, you, enemy, hi ? fine : p,
      { weight, trackWeakness: track });
    clearTimeout(refineTimer);
    if (!hi) refineTimer = setTimeout(() => draw('fine'), 160);
    drawScope(scopeA, r.mine.fb, r.mine.cam, { note: `${r.range.toFixed(1)} m`, contacts: r.mine.contacts });
    drawScope(scopeB, r.theirs.fb, r.theirs.cam, { note: `${r.range.toFixed(1)} m`, contacts: r.theirs.contacts });

    const refA = reference(you, enemy), refB = reference(enemy, you);
    const mm = r.mine.model * 1000, me = r.mine.empty * 1000;
    const tm = r.theirs.model * 1000, te = r.theirs.empty * 1000;
    yourModel.set(mm, refA, false);
    yourEmpty.set(me, refA, false);
    theirModel.set(tm, refB, false);
    theirEmpty.set(te, refB, false);

    const v = r.ev.engaged ? r.ev.verdict : 'none';
    verdictTag.className = `tag ${v}`;
    verdictTag.textContent = {
      good: 'both ways in your favour', bad: 'both ways against you',
      even: 'exactly symmetric', mixed: 'a trade', none: 'no line of sight',
    }[v];

    verdictText.textContent = !r.ev.engaged
      ? 'Neither player can see any part of the other from here, so there is nothing to compare. Move somewhere you could actually be shot from.'
      : v === 'even'
        ? 'The two screens are identical. Whatever the wall is doing to Red it is doing to you in equal measure, so standing here has bought you nothing.'
        : v === 'good'
          ? `You get ${describe(mm, refA)} target and ${describe(me, refA)} movement to cover. They get ${describe(tm, refB)} target and ${describe(te, refB)} movement to cover. Both comparisons point the same way.`
          : v === 'bad'
            ? `They get the better half of both comparisons: ${describe(tm, refB)} target against your ${describe(mm, refA)}, and ${describe(me, refA)} of their movement for you to cover against ${describe(te, refB)} of yours.`
            : 'One comparison favours you and the other does not. Which one matters depends on whether small targets or fast movement is the thing that beats your aim, which is the slider below.';

    exact.innerHTML =
      `Blue sees &nbsp;hittable ${mm.toFixed(2)} &nbsp;movement ${me.toFixed(2)} msr<br>` +
      `Red sees &nbsp;&nbsp;hittable ${tm.toFixed(2)} &nbsp;movement ${te.toFixed(2)} msr<br>` +
      `range ${r.range.toFixed(2)} m`;

    map.render({
      scene, bounds: scene.bounds, enemy, viewer: you,
      enemyYaw: r.foe.yaw, viewerYaw: r.me.yaw,
      enemyDome: r.enemyDome, viewerDome: r.viewerDome,
      layers: { enemyDome: true, viewerDome: true, sight: true },
    });
  }
  draw();
  window.addEventListener('resize', draw);
}

// ═══════════════════════════════════════════ angle, as an experiment ═════
/**
 * A sweep rather than a recommendation. The interesting part is the shape of
 * the curve: zero at both ends, broad in the middle. The exact peak belongs
 * to this movement model and this geometry, and the caption says so.
 */
export function angleSweep(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 112, bufH: 78, domeGrid: 29 };
  const scene = {
    bounds: { x: [-18, 18], y: [-3, 18] },
    solids: [box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'wall', role: 'wall' })],
  };
  const enemy = { x: 0, y: 0.32 };
  let range = 9, weight = 0.5;

  const canvas = el('canvas');
  const bestRead = el('span.val', '…');
  const note = el('p', { class: 'dim', style: { fontSize: 'var(--step--1)', margin: '0.8rem 0 0' } });

  mount.appendChild(el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', 'Asymmetry against viewing angle'), el('b', 'one wall, fixed range')),
      el('div', canvas),
    ),
    el('div.readouts',
      el('div.readout', el('span.lbl', el('i.swatch.sw-green'), 'Strongest asymmetry at this range'), bestRead),
    ),
    el('div.panel', el('div.panel-body',
      el('div.controls',
        slider({
          label: 'Range to Red', min: 3, max: 18, step: 0.5, value: range,
          format: (v) => `${v.toFixed(1)} m`,
          oninput: (v) => { range = v; compute(); },
        }),
        slider({
          label: 'What beats your aim', min: 0, max: 1, step: 0.01, value: weight,
          format: (v) => (v < 0.35 ? 'small targets' : v > 0.65 ? 'fast movement' : 'both equally'),
          oninput: (v) => { weight = v; compute(); },
        }),
      ),
    )),
    note,
  ));

  const N = 61;
  let data = [], job = 0;

  function compute() {
    const mine = ++job;
    data = [];
    let i = 0;
    const step = () => {
      if (mine !== job) return;
      const t0 = performance.now();
      while (i < N && performance.now() - t0 < 10) {
        const theta = -90 + (180 * i) / (N - 1);
        const b = (90 + theta) * DEG;
        const v = { x: enemy.x + Math.cos(b) * range, y: enemy.y + Math.sin(b) * range };
        const r = evaluatePair(scene, v, enemy, p, { weight });
        data.push([theta, Number.isFinite(r.ev.score) ? r.ev.score : 0]);
        i++;
      }
      draw();
      if (i < N) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function draw() {
    if (!data.length) return;
    let best = data[0];
    for (const d of data) if (d[1] > best[1]) best = d;
    const lo = Math.min(0, ...data.map((d) => d[1]));
    const hi = Math.max(0.05, ...data.map((d) => d[1]));
    bestRead.textContent = `${Math.abs(best[0]).toFixed(0)}° either side`;

    drawPlot(canvas, {
      height: 200,
      xMin: -92, xMax: 92, yMin: lo - 0.02, yMax: hi * 1.12,
      xTicks: [-90, -45, 0, 45, 90].map((v) => ({ v, label: `${v}°` })),
      yTicks: [lo, 0, hi].map((v) => ({ v, label: v.toFixed(2) })),
      bands: [
        { from: -2, to: 2, color: alpha(C.redLit, 0.15) },
        { from: -92, to: -88, color: alpha(C.redLit, 0.15) },
        { from: 88, to: 92, color: alpha(C.redLit, 0.15) },
      ],
      series: [
        { data: [[-92, 0], [92, 0]], color: alpha(C.scopeInk2, 0.5), width: 1, dash: [3, 3] },
        { data, color: C.greenLit, style: 'area', width: 2, fill: alpha(C.greenLit, 0.13) },
      ],
      markers: [{ x: best[0], color: C.blueLit, label: 'widest gap', width: 1.6 }],
      xLabel: 'viewing angle',
      yLabel: 'how unequal the two screens are',
    });

    note.textContent = 'Zero at both ends, and for the same reason each time. Square to the wall the two screens are identical. Flat against the wall yourself they are identical again. Everything useful happens in between, and the middle is broad enough that no single angle is the answer.';
  }
  compute();
  window.addEventListener('resize', draw);
}
