/**
 * heuristic.js, the aimbot calculator (§1) and the duel scorecard (§2.3).
 */

import { el, slider, segmented, readout, versus, clear, fmt } from '../ui/dom.js';
import { C, alpha, MONO } from '../ui/palette.js';
import { drawScope } from '../ui/scope.js';
import { drawPlot } from '../ui/plot.js';
import { createTopDown } from '../ui/topdown.js';
import { makePair, evaluateInto, evaluatePair, clampToScene } from '../ui/engine.js';
import { DEFAULT_PARAMS } from '../core/params.js';
import { aimbotCriterion } from '../core/duel.js';
import { bearing, angleOffNormal } from '../core/normals.js';
import { requestRose, latest } from '../ui/solverClient.js';
import { box, DEG } from '../core/geom.js';

const FAR = 40;

// ═══════════════════════════════════════════════ the aimbot criterion ════
export function aimbot(mount) {
  const me = { hp: 157, dps: 100 };
  let foes = [{ hp: 100, dps: 80 }, { hp: 50, dps: 80 }];

  const verdict = el('div');
  const timeline = el('div.scroll-x');
  const foeList = el('div.stack');

  const numberBox = (label, value, onchange, opts = {}) => {
    const input = el('input', {
      type: 'number', value, min: opts.min ?? 1, max: opts.max ?? 9999, step: opts.step ?? 1,
      oninput: (e) => { onchange(Math.max(1, parseFloat(e.target.value) || 1)); },
    });
    return el('div.ctl', el('div.ctl-top', el('label', label)), input);
  };

  const wrap = el('div.stack',
    el('div.panel',
      el('div.panel-head', el('span', 'The aggressive aimbot criterion'), el('b', { class: 'mono' }, '§1')),
      el('div.panel-body.stack',
        el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' } },
          numberBox('Your HP', me.hp, (v) => { me.hp = v; run(); }, { max: 2000 }),
          numberBox('Your DPS', me.dps, (v) => { me.dps = v; run(); }, { max: 2000 }),
        ),
        el('div', { style: { borderTop: '1px solid var(--rule)', paddingTop: '0.7rem' } }, foeList),
        el('div', { style: { display: 'flex', gap: '0.5rem' } },
          el('button.btn.ghost', {
            type: 'button',
            onclick: () => { if (foes.length < 4) { foes.push({ hp: 100, dps: 60 }); renderFoes(); run(); } },
          }, 'Add an enemy'),
          el('button.btn.ghost', {
            type: 'button',
            onclick: () => { foes = [{ hp: 100, dps: 80 }, { hp: 50, dps: 80 }]; me.hp = 157; me.dps = 100; renderFoes(); run(); },
          }, "Reset to the guide's example"),
        ),
      ),
    ),
    verdict,
    timeline,
  );
  mount.appendChild(wrap);

  function renderFoes() {
    clear(foeList);
    foes.forEach((f, i) => {
      foeList.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.6rem', alignItems: 'end' } },
        numberBox(`Enemy ${i + 1} HP`, f.hp, (v) => { f.hp = v; run(); }, { max: 2000 }),
        numberBox('DPS', f.dps, (v) => { f.dps = v; run(); }, { max: 2000 }),
        el('button.btn.ghost', {
          type: 'button', title: 'remove',
          disabled: foes.length <= 1,
          onclick: () => { foes.splice(i, 1); renderFoes(); run(); },
        }, '×'),
      ));
    });
  }

  function run() {
    const r = aimbotCriterion(me, foes);
    const total = foes.reduce((s, f) => s + f.dps, 0);
    clear(verdict);
    verdict.appendChild(el('div.panel',
      el('div.panel-body',
        el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' } },
          el(`span.tag.${r.survive ? 'good' : 'bad'}`, r.survive ? 'Take the fight' : 'Do not take the fight'),
          el('span', { class: 'mono', style: { fontSize: 'var(--step--1)', color: 'var(--ink-2)' } },
            r.survive
              ? `${r.hpLeft.toFixed(0)} hp left after ${r.time.toFixed(2)} s`
              : `dead at ${r.time.toFixed(2)} s, ${r.killed} of ${foes.length} killed`),
        ),
        el('p', { style: { marginTop: '0.7rem', marginBottom: 0, fontSize: 'var(--step--1)' } },
          r.survive
            ? `Even against ${total} incoming dps you finish this with health to spare, so by the passive criterion, they should not be avoiding you either.`
            : `You have ${me.hp > foes.reduce((s, f) => s + f.hp, 0) ? 'more health' : 'less health'} and ${me.dps > Math.max(...foes.map((f) => f.dps)) ? 'better dps' : 'worse dps'} than any one of them, and it does not matter: ${total} incoming dps kills you first. There is no way to win this even with an aimbot, so the decision to take it is bad however well you aim.`),
      ),
    ));

    clear(timeline);
    const rows = r.timeline.map((t, i) => el('tr',
      el('td', `${i + 1}`),
      el('td', t.target ? `${t.target.hp} hp target` : 'switch'),
      el('td', `${t.dt.toFixed(2)} s`),
      el('td', `${t.incoming} dps`),
      el('td', { style: { color: t.died ? 'var(--red)' : 'inherit' } }, t.died ? 'dead' : `${t.hp.toFixed(0)} hp`),
    ));
    timeline.appendChild(el('table.data',
      el('thead', el('tr', el('th', '#'), el('th', 'Killing'), el('th', 'Takes'), el('th', 'Incoming'), el('th', 'You end on'))),
      el('tbody', rows),
    ));
  }

  renderFoes();
  run();
}

// ═══════════════════════════════════════════════════ the duel scorecard ══
export function duel(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 152, bufH: 106 };
  const scene = {
    bounds: { x: [-13, 13], y: [-11, 13] },
    solids: [
      box([-FAR, -0.6, 0], [-1.25, 0.6, 3.2], { label: 'wall' }),
      box([1.25, -0.6, 0], [FAR, 0.6, 3.2], { label: 'wall' }),
    ],
  };
  let enemy = { x: 0.55, y: -2.4 };
  let viewer = { x: 5.0, y: 5.0 };
  let weight = 0.5, track = 0.55;

  const pair = makePair(p.bufW, p.bufH);
  const scopeA = el('canvas'), scopeB = el('canvas'), mapCanvas = el('canvas');
  const vModel = versus('Model-dome, bigger is better for you');
  const vEmpty = versus('Empty-dome, smaller is better for you');
  const badge = el('span.tag', 'evaluating');
  const clauseA = el('li'), clauseB = el('li');
  const scoreRead = readout('Positioning score', { big: true });
  const ttkRead = readout('Time to kill, you vs him');
  const whyRead = readout('∂(expected dps)/∂Ω');
  let rose = null;
  const offRead = readout('Your angle off the normal', { swatch: 'green' });

  const wrap = el('div.stack',
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' } },
      el('div.scope',
        el('div.scope-head', el('span', 'You see'), el('b', 'him')),
        el('div', scopeA)),
      el('div.scope',
        el('div.scope-head', el('span', 'He sees'), el('b', 'you')),
        el('div', scopeB)),
    ),
    el('div.map-wrap',
      el('div.scope', el('div', mapCanvas)),
      el('div.map-hint', 'drag either player'),
    ),
    el('div.panel',
      el('div.panel-head', el('span', 'Heuristic'), badge),
      el('div.panel-body.stack',
        el('div.versus', vModel, vEmpty),
        el('ul.notelist.checks', { style: { marginTop: '0.9rem', fontSize: 'var(--step--1)' } }, clauseA, clauseB),
      ),
    ),
    el('div.readouts', scoreRead, offRead, ttkRead, whyRead),
    el('div.panel', el('div.panel-body',
      el('div.controls',
        slider({
          label: 'Precision ← → reactivity', min: 0, max: 1, step: 0.01, value: weight,
          format: (v) => (v < 0.35 ? 'mind the empty-dome' : v > 0.65 ? 'mind the model-dome' : 'balanced'),
          hint: 'which clause you weight. The guide refuses to rank them, and this is why',
          oninput: (v) => { weight = v; draw(); },
        }),
        slider({
          label: 'How much his space beats your tracking', min: 0, max: 1, step: 0.01, value: track,
          format: (v) => (v === 0 ? 'aimbot' : `${(v * 100).toFixed(0)}%`),
          hint: 'set it to zero and you have an aimbot, so only the model-dome matters',
          oninput: (v) => { track = v; draw(); },
        }),
        slider({
          label: 'Weapon spread', min: 0, max: 4, step: 0.05, value: p.spread,
          format: (v) => `${v.toFixed(2)}° cone`,
          oninput: (v) => { p.spread = v; draw(); },
        }),
        segmented({
          label: 'Camera',
          value: p.camera,
          options: [{ value: 'fps', label: 'First person' }, { value: 'tps', label: 'Third person' }],
          onchange: (v) => { p.camera = v; draw(); },
        }),
      ),
    )),
  );
  mount.appendChild(wrap);

  const map = createTopDown(mapCanvas, {
    maxHeight: 320,
    onDrag: (who, x, y) => {
      const q = clampToScene(scene, x, y, p);
      if (who === 'viewer') viewer = q; else { enemy = q; rose = null; refreshRose(); }
      draw();
    },
  });

  function draw() {
    const r = evaluateInto(pair, scene, viewer, enemy, p, { weight, trackWeakness: track });
    drawScope(scopeA, r.mine.fb, r.mine.cam, { aimPoint: { x: 0, y: 0, z: 1.5 } });
    drawScope(scopeB, r.theirs.fb, r.theirs.cam);

    vModel.set(r.mine.model * 1000, r.theirs.model * 1000, (v) => v.toFixed(2), true);
    vEmpty.set(r.mine.empty * 1000, r.theirs.empty * 1000, (v) => v.toFixed(2), false);

    const v = r.ev.verdict;
    badge.className = `tag ${v}`;
    badge.textContent = !r.ev.engaged ? 'no line of sight'
      : v === 'good' ? 'good position'
      : v === 'bad' ? 'bad position'
      : v === 'even' ? 'perfectly even' : 'mixed';

    clauseA.textContent = !r.ev.engaged
      ? 'Neither of you can see any part of the other, so there is nothing here to judge.'
      : r.ev.even
      ? 'The two model-domes are identical, mirror-symmetry, so neither of you is the easier target.'
      : r.ev.clauseModel
        ? 'His model-dome is bigger than yours, he is easier to hit than you are.'
        : 'His model-dome is smaller than yours, you are the easier target.';
    clauseA.parentElement.className = 'notelist ' + (r.ev.clauseModel ? 'checks' : 'limits');
    clauseB.textContent = !r.ev.engaged
      ? 'Walk somewhere you can actually be shot from and the heuristic has something to say.'
      : r.ev.even
      ? 'The two empty-domes are identical too. You have gained nothing by standing here.'
      : r.ev.clauseEmpty
        ? 'His empty-dome is smaller than yours, you have more room to move than he does.'
        : 'His empty-dome is bigger than yours, he has more room to move than you do.';

    scoreRead.set(r.ev.engaged ? `${r.ev.score >= 0 ? '+' : ''}${r.ev.score.toFixed(2)}` : 'no fight here');
    ttkRead.set(`${r.ev.ttkMine.toFixed(2)} / ${r.ev.ttkTheirs.toFixed(2)}`, 's');
    whyRead.setHTML(
      `<span style="color:var(--green)">model +${r.why.dByModel.toFixed(0)}</span>` +
      ` <span class="dimmer">/</span> ` +
      `<span style="color:var(--red)">empty ${r.why.dByEmpty.toFixed(0)}</span>`,
    );

    const off = rose ? angleOffNormal(bearing(enemy, viewer), rose.normals) : null;
    offRead.set(!rose ? 'solving…' : rose.flat ? 'no normal' : fmt.deg(off.off));

    map.render({
      scene, bounds: scene.bounds, enemy, viewer,
      enemyYaw: r.foe.yaw, viewerYaw: r.me.yaw,
      enemyDome: r.enemyDome, viewerDome: r.viewerDome, rose,
      layers: { enemyDome: true, viewerDome: true, sight: true, rose: !!rose, normals: !!rose },
    });
  }

  const takeRose = latest();
  function refreshRose() {
    takeRose(requestRose(scene, enemy, p, { radius: 9 }), (r) => { rose = r; draw(); });
  }
  refreshRose();
  draw();
  window.addEventListener('resize', draw);
}

// ═════════════════════════════════════════════════ score against angle ═══
/**
 * Exercise 3.1 asks for "at least two optimal angles". This sweeps every angle
 * at a fixed range against an infinite wall and plots the heuristic score, so
 * the answer is a curve rather than an opinion.
 *
 * What comes out matches the guide on all three of its checkable claims: the
 * score is exactly zero on the normal (mirror-symmetry, §4.1-4), it is exactly
 * zero again at ±90° where you are touching the wall yourself, and the maximum
 * in between is broad, which is why ±65° is a good answer rather than the
 * only one.
 */
export function angleSweep(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 112, bufH: 78, domeGrid: 29 };
  const scene = {
    bounds: { x: [-18, 18], y: [-3, 18] },
    solids: [box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'infinite wall' })],
  };
  const enemy = { x: 0, y: 0.32 };
  let range = 9;
  let weight = 0.5;

  const canvas = el('canvas');
  const rBest = readout('Best angle at this range', { swatch: 'green', big: true });
  const rGain = readout('Score there');
  const r65 = readout('Score at his suggested 65°');
  const note = el('p.fig-cap');

  mount.appendChild(el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', 'Heuristic score against angle'), el('b', 'infinite wall')),
      el('div', canvas),
    ),
    el('div.panel', el('div.panel-body',
      el('div.controls',
        slider({
          label: 'Range to the enemy', min: 3, max: 18, step: 0.5, value: range,
          format: (v) => `${v.toFixed(1)} m`,
          oninput: (v) => { range = v; compute(); },
        }),
        slider({
          label: 'Precision ← → reactivity', min: 0, max: 1, step: 0.01, value: weight,
          format: (v) => (v < 0.35 ? 'empty-dome' : v > 0.65 ? 'model-dome' : 'balanced'),
          oninput: (v) => { weight = v; compute(); },
        }),
      ),
    )),
    el('div.readouts', rBest, rGain, r65),
    note,
  ));

  const N = 61;
  let data = [];
  let job = 0;

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
        data.push([theta, r.ev.score]);
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
    const at = (deg) => {
      let closest = data[0];
      for (const d of data) if (Math.abs(d[0] - deg) < Math.abs(closest[0] - deg)) closest = d;
      return closest[1];
    };
    const lo = Math.min(0, ...data.map((d) => d[1]));
    const hi = Math.max(0.05, ...data.map((d) => d[1]));

    rBest.set(`${best[0] > 0 ? '+' : ''}${best[0].toFixed(0)}°`, ' / ' + (-best[0]).toFixed(0) + '°');
    rGain.set(`${best[1] >= 0 ? '+' : ''}${best[1].toFixed(3)}`);
    r65.set(`${at(65) >= 0 ? '+' : ''}${at(65).toFixed(3)}`);

    drawPlot(canvas, {
      height: 200,
      xMin: -92, xMax: 92, yMin: lo - 0.02, yMax: hi * 1.12,
      xTicks: [-90, -65, -45, 0, 45, 65, 90].map((v) => ({ v, label: `${v}°` })),
      yTicks: [lo, 0, hi / 2, hi].map((v) => ({ v, label: v.toFixed(2) })),
      bands: [
        { from: -2, to: 2, color: alpha(C.redLit, 0.15) },
        { from: -92, to: -88, color: alpha(C.redLit, 0.15) },
        { from: 88, to: 92, color: alpha(C.redLit, 0.15) },
      ],
      series: [
        { data: [[-92, 0], [92, 0]], color: alpha(C.scopeInk2, 0.5), width: 1, dash: [3, 3] },
        { data, color: C.greenLit, style: 'area', width: 2, fill: alpha(C.greenLit, 0.13) },
      ],
      markers: [
        { x: 65, color: alpha(C.yellowLit, 0.9), label: 'his 65°', dash: [4, 3] },
        { x: best[0], color: C.blueLit, label: 'best', width: 1.6 },
      ],
      xLabel: 'angle from the normal',
      yLabel: 'heuristic score',
    });

    note.innerHTML = `<b>Zero at 0°, zero again at ±90°.</b> On the normal, mirror-symmetry makes the fight even; at ±90° you are against the wall yourself and it is even again, both of the guide's "no advantage" answers, measured. The maximum at this range is ${Math.abs(best[0]).toFixed(0)}°, and the curve is broad enough that ±65° gives up only ${((1 - at(65) / Math.max(best[1], 1e-9)) * 100).toFixed(0)}% of it.`;
  }
  compute();
  window.addEventListener('resize', draw);
}
