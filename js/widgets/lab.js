/**
 * lab.js, the whole framework on one map.
 *
 * Load any of the ten exercises, drag either player, and every quantity the
 * guide names is on screen at once and computed from both chairs. The
 * advantage field sweeps every legal standing position, runs the full duel at
 * each one, and colours the map by the result.
 */

import { el, slider, segmented, readout, versus, clear, fmt, $$ } from '../ui/dom.js';
import { advanced, chip } from '../ui/teach.js';
import { C, alpha } from '../ui/palette.js';
import { drawScope } from '../ui/scope.js';
import { createTopDown } from '../ui/topdown.js';
import { makePair, evaluateInto, clampToScene } from '../ui/engine.js';
import { DEFAULT_PARAMS } from '../core/params.js';
import { bearing, angleOffNormal } from '../core/normals.js';
import { requestRose, requestField, latest } from '../ui/solverClient.js';
import { SCENARIOS, loadScenario } from '../scenarios.js';
import { groundHeight, DEG } from '../core/geom.js';

const RES = { draft: { res: 34, bufW: 48, bufH: 34, domeGrid: 17 },
              standard: { res: 54, bufW: 62, bufH: 44, domeGrid: 21 },
              fine: { res: 78, bufW: 78, bufH: 56, domeGrid: 27 } };

let labApi = null;
/** Other sections use this to send a scenario into the lab. */
export const openInLab = (id, variantId) => labApi?.load(id, variantId);

export function lab(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 176, bufH: 122 };
  let sc = loadScenario(SCENARIOS[0].id);
  let viewer = { ...sc.viewer }, enemy = { ...sc.enemy };
  let weight = 0.5, track = 0.55;
  let rose = null, field = null, fieldStale = true, busy = false;
  let resKey = 'standard';
  const layers = {
    rose: true, normals: true, enemyDome: true, viewerDome: true,
    sight: true, freeDirs: false, field: false, probes: true, zones: true, best: true,
  };

  const pair = makePair(p.bufW, p.bufH);
  const mapCanvas = el('canvas');
  const scopeA = el('canvas'), scopeB = el('canvas');
  const progress = el('i');
  const probeBar = el('div.seg');
  const titleEl = el('b', sc.title);
  const briefEl = el('p', { style: { fontSize: 'var(--step--1)', margin: 0, color: 'var(--ink-2)' } }, sc.brief);
  const variantBar = el('div');

  // ── readouts ──────────────────────────────────────────────────────────
  const vModel = versus('Model-dome  ·  msr');
  const vEmpty = versus('Empty-dome  ·  msr');
  const badge = el('span.tag', 'idle');
  const rScore = readout('Positioning score', { big: true });
  const rNormals = readout('Normals', { swatch: 'green' });
  const rOff = readout('Your angle off the normal', { swatch: 'blue' });
  const rFreeE = readout('His free directions', { swatch: 'red' });
  const rFreeY = readout('Your free directions', { swatch: 'blue' });
  const rClip = readout('His dome, vs unclipped');
  const rRange = readout('Range');
  const rTtk = readout('Time to kill, you / him');
  const rBest = readout('Best position found', { swatch: 'green' });

  // ── build ─────────────────────────────────────────────────────────────
  const scenarioPicker = el('div.seg', SCENARIOS.map((s) => el('button', {
    type: 'button', 'aria-pressed': String(s.id === sc.id),
    'data-scenario': s.id,
    onclick: () => load(s.id),
  }, `${s.num} ${s.title}`)));

  const layerToggles = el('div.seg', [
    ['rose', 'Rose'], ['normals', 'Normals'], ['enemyDome', 'His dome'],
    ['viewerDome', 'Your dome'], ['freeDirs', 'Free dirs'], ['field', 'Advantage field'],
    ['probes', 'Probes'],
  ].map(([k, label]) => el('button', {
    type: 'button', 'aria-pressed': String(!!layers[k]), 'data-layer': k,
    onclick: (e) => {
      layers[k] = !layers[k];
      e.currentTarget.setAttribute('aria-pressed', String(layers[k]));
      if (k === 'field' && layers.field && fieldStale && !busy) solveField();
      draw();
    },
  }, label)));

  const solveBtn = el('button.btn', { type: 'button', onclick: () => solveField() }, 'Solve advantage field');

  const wrap = el('div.lab',
    el('div.lab-main',
      el('div.panel',
        el('div.panel-head', el('span', 'Scenario'), titleEl),
        el('div.panel-body.stack', scenarioPicker, variantBar, briefEl),
      ),
      el('div.map-wrap',
        el('div.scope',
          el('div.scope-head',
            el('span', 'Map'),
            el('b', 'drag either player'),
          ),
          el('div', mapCanvas),
          el('div.progress', progress),
        ),
        el('div.map-hint', 'blue = you · red = enemy · green = normal'),
      ),
      layerToggles,
      probeBar,
      el('div.lab-scopes',
        el('div.scope',
          el('div.scope-head', el('span', 'You see'), el('b', 'him')),
          el('div', scopeA),
        ),
        el('div.scope',
          el('div.scope-head', el('span', 'He sees'), el('b', 'you')),
          el('div', scopeB),
        ),
      ),
      el('div.legend',
        el('span', el('i.swatch.sw-orange'), 'model-dome'),
        el('span', el('i.swatch.sw-yellow'), 'empty-dome'),
        el('span', el('i.swatch.sw-grey'), 'obstacle'),
        el('span', el('i.swatch.sw-green'), 'normal'),
        el('span', el('i.swatch.sw-red'), 'the eight keys'),
      ),
    ),

    el('div.lab-side',
      el('div.panel',
        el('div.panel-head', el('span', 'Heuristic'), badge),
        el('div.panel-body.stack', el('div.versus', vModel, vEmpty)),
      ),
      el('div.readouts', rScore, rNormals, rOff, rRange),
      el('div.panel', el('div.panel-body',
        advanced('More measurements', el('div.readouts', rFreeE, rFreeY, rClip, rTtk, rBest)),
      )),
      el('div.panel',
        el('div.panel-head', el('span', 'Settings')),
        el('div.panel-body',
          advanced('Movement and weapon',
          el('div.controls',
            slider({
              label: 'Ground speed', min: 3, max: 9, step: 0.1, value: p.speed,
              format: (v) => `${v.toFixed(1)} m/s`,
              oninput: (v) => { p.speed = v; invalidate(); },
            }),
            slider({
              label: 'Fight time-scale', min: 0.1, max: 0.7, step: 0.01, value: p.dt,
              format: (v) => `${(v * 1000).toFixed(0)} ms`,
              oninput: (v) => { p.dt = v; invalidate(); },
            }),
            slider({
              label: 'Weapon spread', min: 0, max: 4, step: 0.05, value: p.spread,
              format: (v) => `${v.toFixed(2)}°`,
              oninput: (v) => { p.spread = v; draw(); },
            }),
            slider({
              label: 'Head-shot multiplier', min: 1, max: 3, step: 0.1, value: p.headshotMult,
              format: (v) => `${v.toFixed(1)}×`,
              oninput: (v) => { p.headshotMult = v; draw(); },
            }),
            slider({
              label: 'Projectile radius', min: 0, max: 0.5, step: 0.01, value: p.projectileRadius,
              format: (v) => (v === 0 ? 'hitscan' : `${(v * 100).toFixed(0)} cm rocket`),
              oninput: (v) => { p.projectileRadius = v; draw(); },
            }),
            slider({
              label: 'Precision ← → reactivity', min: 0, max: 1, step: 0.01, value: weight,
              format: (v) => (v < 0.35 ? 'empty-dome' : v > 0.65 ? 'model-dome' : 'balanced'),
              oninput: (v) => { weight = v; fieldStale = true; draw(); },
            }),
            slider({
              label: 'His space beats your tracking', min: 0, max: 1, step: 0.01, value: track,
              format: (v) => (v === 0 ? 'aimbot' : `${(v * 100).toFixed(0)}%`),
              oninput: (v) => { track = v; draw(); },
            }),
            slider({
              label: 'Strafe speed', min: 0.4, max: 1, step: 0.01, value: p.strafeRatio,
              format: (v) => `${(v * 100).toFixed(0)}%`,
              oninput: (v) => { p.strafeRatio = v; invalidate(); },
            }),
            segmented({
              label: 'Camera',
              value: p.camera,
              options: [{ value: 'fps', label: 'First person' }, { value: 'tps', label: 'Third person' }],
              onchange: (v) => { p.camera = v; invalidate(); },
            }),
            segmented({
              label: 'Third-person shoulder',
              value: String(p.tpsSide),
              options: [{ value: '1', label: 'Right' }, { value: '-1', label: 'Left' }],
              onchange: (v) => { p.tpsSide = parseInt(v, 10); draw(); },
            }),
            segmented({
              label: 'Will he step off a ledge?',
              value: p.noFall ? 'no' : 'yes',
              options: [{ value: 'no', label: 'No (§4.6-2)' }, { value: 'yes', label: 'Yes' }],
              onchange: (v) => { p.noFall = v === 'no'; invalidate(); },
            }),
            segmented({
              label: 'Reachable-space shape',
              value: p.domeShape,
              options: [{ value: 'cap', label: 'Tapered' }, { value: 'prism', label: 'Straight-sided' }],
              onchange: (v) => { p.domeShape = v === 'prism' ? 'cylinder' : 'cap'; invalidate(); },
            }),
          )),
          el('p', { style: { fontSize: 'var(--step--2)', fontFamily: 'var(--mono)', color: 'var(--ink-3)', margin: '0.9rem 0 0', lineHeight: 1.5 } },
            'Everything above is supplied rather than measured. Changing it changes the model, not the map.'),
        ),
      ),
    ),
  );
  mount.appendChild(wrap);

  const map = createTopDown(mapCanvas, {
    maxHeight: 560,
    onDrag: (who, x, y) => {
      const q = clampToScene(sc, x, y, p);
      if (who === 'viewer') { viewer = q; }
      else { enemy = q; recomputeRose(); fieldStale = true; }
      draw();
    },
  });

  // ── the two slow solves, via the shared worker ───────────────────────
  const takeField = latest();
  function solveField() {
    if (busy) return;
    busy = true;
    solveBtn.disabled = true;
    solveBtn.textContent = 'Solving…';
    progress.style.width = '2%';
    const opts = { ...RES[resKey], weight, trackWeakness: track, bounds: sc.bounds };
    requestField({ solids: sc.solids, bounds: sc.bounds }, enemy, p, opts, (m) => {
      progress.style.width = `${((m.row + 1) / m.ny) * 100}%`;
    }).then((f) => {
      field = f; fieldStale = false; busy = false;
      solveBtn.disabled = false; solveBtn.textContent = 'Solve advantage field';
      progress.style.width = '0%';
      layers.field = true;
      $$('[data-layer="field"]', wrap).forEach((b) => b.setAttribute('aria-pressed', 'true'));
      draw();
    }).catch(() => {
      busy = false;
      solveBtn.disabled = false; solveBtn.textContent = 'Solve advantage field';
      progress.style.width = '0%';
    });
  }

  function invalidate() { recomputeRose(); fieldStale = true; draw(); }

  const takeRose = latest();
  function recomputeRose() {
    rose = null;
    const radius = Math.max(6, Math.min(11, Math.hypot(viewer.x - enemy.x, viewer.y - enemy.y)));
    takeRose(requestRose(sc, enemy, p, { radius }), (r) => { rose = r; draw(); });
  }

  function renderProbes() {
    clear(probeBar);
    (sc.probes ?? []).forEach((pr) => probeBar.appendChild(el('button', {
      type: 'button', 'aria-pressed': 'false',
      onclick: () => {
        viewer = { x: pr.x, y: pr.y };
        [...probeBar.children].forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === pr.label)));
        draw();
      },
    }, pr.label)));
  }

  function renderVariants() {
    clear(variantBar);
    if (!sc.variants?.length) return;
    variantBar.appendChild(segmented({
      label: 'Variant',
      value: sc.variantId ?? 'base',
      options: [{ value: 'base', label: 'As drawn' }, ...sc.variants.map((v) => ({ value: v.id, label: v.label }))],
      onchange: (v) => load(sc.id, v === 'base' ? null : v),
    }));
  }

  function load(id, variantId) {
    sc = loadScenario(id, variantId);
    viewer = { ...sc.viewer }; enemy = { ...sc.enemy };
    field = null; fieldStale = true;
    layers.field = false;
    $$('[data-layer="field"]', wrap).forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $$('[data-scenario]', wrap).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scenario === id)));
    titleEl.textContent = sc.title;
    briefEl.textContent = sc.brief;
    renderProbes();
    renderVariants();
    recomputeRose();
    draw();
  }

  function draw() {
    const r = evaluateInto(pair, sc, viewer, enemy, p, { weight, trackWeakness: track });
    drawScope(scopeA, r.mine.fb, r.mine.cam, { note: `${r.range.toFixed(1)} m` });
    drawScope(scopeB, r.theirs.fb, r.theirs.cam, { note: `${r.range.toFixed(1)} m` });

    vModel.set(r.mine.model * 1000, r.theirs.model * 1000, (v) => v.toFixed(2), true);
    vEmpty.set(r.mine.empty * 1000, r.theirs.empty * 1000, (v) => v.toFixed(2), false);
    badge.className = `tag ${r.ev.verdict}`;
    badge.textContent = !r.ev.engaged ? 'no line of sight'
      : r.ev.verdict === 'good' ? 'good position'
      : r.ev.verdict === 'bad' ? 'bad position'
      : r.ev.verdict === 'even' ? 'perfectly even' : 'mixed';

    rScore.set(r.ev.engaged ? `${r.ev.score >= 0 ? '+' : ''}${r.ev.score.toFixed(2)}` : 'no fight here');
    rNormals.set(!rose ? 'solving…' : rose.flat ? 'every direction' : rose.normals.map((n) => `${n.toFixed(0)}°`).join(' · '));
    const off = rose ? angleOffNormal(bearing(enemy, viewer), rose.normals) : null;
    rOff.set(!rose ? 'solving…' : rose.flat ? 'no normal' : fmt.deg(off.off));
    rRange.set(r.range.toFixed(1), 'm');
    rFreeE.set(`${r.enemyFree.nFree}`, 'of 8');
    rFreeY.set(`${r.viewerFree.nFree}`, 'of 8');
    rClip.set(`${(r.enemyDome.clipRatio * 100).toFixed(0)}`, '%');
    rTtk.set(`${r.ev.ttkMine.toFixed(2)} / ${r.ev.ttkTheirs.toFixed(2)}`, 's');
    rBest.set(field?.best?.length
      ? `${field.best[0].x.toFixed(1)}, ${field.best[0].y.toFixed(1)}`
      : (fieldStale ? 'not solved' : 'none'));

    map.render({
      scene: sc, scenario: sc, bounds: sc.bounds, enemy, viewer,
      enemyYaw: r.foe.yaw, viewerYaw: r.me.yaw,
      enemyDome: r.enemyDome, viewerDome: r.viewerDome,
      freeDirs: r.enemyFree, rose, showShapeRose: true,
      probes: sc.probes, field: layers.field ? field : null,
      best: field?.best,
      layers: { ...layers, rose: layers.rose && !!rose, normals: layers.normals && !!rose },
    });
  }

  labApi = { load };
  renderProbes();
  renderVariants();
  recomputeRose();
  draw();
  window.addEventListener('resize', draw);
}
