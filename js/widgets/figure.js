/**
 * figure.js — the standard teaching figure.
 *
 * One map, one camera, and a swap control. Every explanatory figure on the
 * player-facing half of the site is built from this, which is what keeps the
 * editorial rules from being re-decided widget by widget:
 *
 *   · the camera can always be swapped, so no claim is ever made from one side
 *   · quantities read in words, with the millisteradians behind a disclosure
 *   · Blue is always you and Red is always the enemy, in the map, the scope
 *     and the prose
 *
 * The figure never renders a number it did not measure. `look()` produces the
 * tagged framebuffer, the scope paints that exact buffer, and the gauges sum
 * the same pixels.
 */

import { el } from '../ui/dom.js';
import { gauge, advanced, povSwap, describe } from '../ui/teach.js';
import { C } from '../ui/palette.js';
import { drawScope } from '../ui/scope.js';
import { createTopDown } from '../ui/topdown.js';
import { makePair, evaluateInto, clampToScene } from '../ui/engine.js';
import { DEFAULT_PARAMS } from '../core/params.js';
import { buildDome } from '../core/dome.js';
import { apparentDome, makeFramebuffer } from '../core/solver.js';
import { box, groundHeight } from '../core/geom.js';

/**
 * @param {Object} spec
 *   scene      {solids, bounds}
 *   you, enemy starting positions
 *   title      scope caption
 *   gauges     true to show the hittable/movement-room bars
 *   rose       true to draw the positioning rose (set later via setRose)
 *   layers     extra top-down layers
 *   onChange   called after every render with the evaluation
 */
export function figure(spec) {
  const p = { ...DEFAULT_PARAMS, bufW: 168, bufH: 116, domeGrid: 37, ...(spec.params || {}) };
  const scene = spec.scene;
  let you = { ...spec.you };
  let enemy = { ...spec.enemy };
  let rose = null;

  const pair = makePair(p.bufW, p.bufH);
  const refBuf = makeFramebuffer(p.bufW, p.bufH);
  const mapCanvas = el('canvas');
  const scopeCanvas = el('canvas');

  const swap = povSwap('you', () => render());
  const gModel = gauge('Hittable area', { swatch: 'orange', color: 'var(--orange)' });
  const gModelSwatch = gModel.querySelector('.swatch');
  const gModelFill = gModel.querySelector('.gauge-track i');
  const gEmpty = gauge('Movement room', { swatch: 'yellow', color: '#c9a521' });
  const gaugeNote = el('p', { class: 'dim', style: { fontSize: 'var(--step--2)', margin: '0.5rem 0 0', fontFamily: 'var(--mono)' } });

  const exact = el('div', { class: 'mono', style: { fontSize: 'var(--step--2)', lineHeight: '1.7', color: 'var(--ink-2)' } });
  const advBlock = advanced('Exact figures', exact);

  const gaugeBlock = spec.gauges === false ? null : el('div.panel',
    el('div.panel-body',
      el('div.gauge', gModel, gEmpty),
      gaugeNote,
      advBlock,
    ),
  );

  const node = el('div.stack',
    el('div.scope',
      el('div.scope-head', swap.label, swap.button),
      el('div', scopeCanvas),
    ),
    el('div.map-wrap',
      el('div.scope', el('div', mapCanvas)),
      el('div.map-hint', spec.hint ?? 'drag either player'),
    ),
    gaugeBlock,
  );

  const map = createTopDown(mapCanvas, {
    maxHeight: spec.mapHeight ?? 300,
    dragEnemy: spec.dragEnemy !== false,
    onDrag: (who, x, y) => {
      const q = clampToScene(scene, x, y, p);
      if (who === 'viewer') you = q; else enemy = q;
      spec.onDrag?.(who, q);
      render();
    },
  });

  /** Apparent surface of the same dome with nothing in the world to clip it. */
  function freeReference(observer, target) {
    const z = groundHeight(scene.solids, target.x, target.y);
    const pad = { solids: [box([-500, -500, z - 1], [500, 500, z], { role: 'platform' })] };
    const d = buildDome(pad, { x: target.x, y: target.y, yaw: 0 }, p);
    return apparentDome(
      { x: observer.x, y: observer.y, z: groundHeight(scene.solids, observer.x, observer.y) },
      target, d, p, refBuf,
    ) * 1000;
  }

  function render() {
    const r = evaluateInto(pair, scene, you, enemy, p, spec.evalOpts || {});
    const fromYou = swap.pov === 'you';

    // The scope always shows what the current camera sees of the other player.
    const seen = fromYou ? r.mine : r.theirs;
    const cam = fromYou ? r.mine.cam : r.theirs.cam;
    drawScope(scopeCanvas, seen.fb, cam, {
      note: `${r.range.toFixed(1)} m`,
      aimPoint: spec.aimPoint,
      marks: spec.marks,
    });

    if (gaugeBlock) {
      const observer = fromYou ? you : enemy;
      const target = fromYou ? enemy : you;
      const ref = freeReference(observer, target);
      const model = seen.model * 1000, empty = seen.empty * 1000;
      gModel.set(model, ref, spec.showNumbers);
      gEmpty.set(empty, ref, spec.showNumbers);
      const whoT = fromYou ? 'Red' : 'Blue';
      const whoO = fromYou ? 'Blue' : 'Red';
      // The body on screen is drawn in the identity colour of whoever is being
      // looked at, so the gauge that measures it matches.
      const bodyColour = fromYou ? 'var(--orange)' : 'var(--blue)';
      if (gModelSwatch) gModelSwatch.style.background = bodyColour;
      if (gModelFill) gModelFill.style.background = bodyColour;
      gModel.querySelector('.gauge-lbl').lastChild.textContent = `${whoT}'s body you can hit`;
      gaugeNote.textContent =
        `${whoO}'s camera. ${whoT} has ${describe(empty, ref)} movement room and offers ${describe(model, ref)} target.`;
      exact.innerHTML =
        `hittable area &nbsp;${model.toFixed(2)} msr<br>` +
        `movement room &nbsp;${empty.toFixed(2)} msr<br>` +
        `unclipped reference &nbsp;${ref.toFixed(2)} msr<br>` +
        `range &nbsp;${r.range.toFixed(2)} m`;
    }

    map.render({
      scene, scenario: spec.scenario, bounds: scene.bounds,
      enemy, viewer: you,
      enemyYaw: r.foe.yaw, viewerYaw: r.me.yaw,
      enemyDome: r.enemyDome, viewerDome: r.viewerDome,
      freeDirs: r.enemyFree, rose, showShapeRose: spec.showShapeRose,
      probes: spec.probes,
      layers: {
        sight: true,
        enemyDome: true,
        viewerDome: true,
        ...(spec.layers || {}),
        rose: !!(rose && spec.layers?.rose),
        normals: !!(rose && spec.layers?.normals),
      },
    });

    spec.onChange?.(r, { fromYou, rose });
    return r;
  }

  return {
    node, render,
    get you() { return you; },
    get enemy() { return enemy; },
    get params() { return p; },
    set(nextYou, nextEnemy) {
      if (nextYou) you = { ...nextYou };
      if (nextEnemy) enemy = { ...nextEnemy };
      render();
    },
    setRose(r) { rose = r; render(); },
    setScene(next) { spec.scene = next; },
  };
}

/** Two figures side by side, for the contrasts the site leans on. */
export const sideBySide = (a, b) => el('div', {
  style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))', gap: 'var(--gap)' },
}, a, b);
