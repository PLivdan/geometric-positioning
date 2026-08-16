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
import { apparentDome, makeFramebuffer, look } from '../core/solver.js';
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

  const compact = spec.compactGauges === true;
  const gaugeBlock = spec.gauges === false ? null : el('div.panel',
    el('div.panel-body',
      el('div.gauge', gModel, gEmpty),
      compact ? null : gaugeNote,
      compact ? null : advBlock,
    ),
  );

  const showMap = spec.showMap !== false;
  const node = el('div.stack',
    el('div.scope',
      el('div.scope-head', swap.label, swap.button),
      el('div', scopeCanvas),
    ),
    showMap ? el('div.map-wrap',
      el('div.scope', el('div', mapCanvas)),
      el('div.map-hint', spec.hint ?? 'drag either player'),
    ) : null,
    gaugeBlock,
  );

  const map = showMap ? createTopDown(mapCanvas, {
    maxHeight: spec.mapHeight ?? 300,
    dragEnemy: spec.dragEnemy !== false,
    onDrag: (who, x, y) => {
      const q = clampToScene(scene, x, y, p);
      if (who === 'viewer') you = q; else enemy = q;
      spec.onDrag?.(who, q);
      render();
    },
  }) : null;

  /**
   * The same two players at the same range with nothing in the world between
   * them, which is what the bars are read against.
   *
   * The two quantities need different references, and using one for both was
   * wrong. Movement room is naturally compared with an unclipped reachable
   * space. The body is not: measured that way a fully exposed player at range
   * still reads "tiny", because his body is a small share of everywhere he
   * could go. What you actually want to know about the body is how much of it
   * you can see out of all of it, so that is what it is compared with.
   */
  function references(observer, target, targetIs) {
    const zT = groundHeight(scene.solids, target.x, target.y);
    const zO = groundHeight(scene.solids, observer.x, observer.y);
    const pad = { solids: [box([-500, -500, zT - 1], [500, 500, zT], { role: 'platform' })] };
    const yaw = Math.atan2(target.y - observer.y, target.x - observer.x);
    const obs = { x: observer.x, y: observer.y, z: zO, yaw };
    const tgt = { x: target.x, y: target.y, z: zT, yaw: yaw + Math.PI };
    const openDome = buildDome(pad, tgt, p);
    const clear = look(pad, obs, tgt, openDome, p, { fb: refBuf, targetIs });
    return { dome: clear.dome * 1000, model: clear.model * 1000 };
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
      const ref = references(observer, target, fromYou ? 'red' : 'blue');
      const model = seen.model * 1000, empty = seen.empty * 1000;
      gModel.set(model, ref.model, spec.showNumbers);
      gEmpty.set(empty, ref.dome, spec.showNumbers);
      const whoT = fromYou ? 'Red' : 'Blue';
      const whoO = fromYou ? 'Blue' : 'Red';
      // The body on screen is drawn in the identity colour of whoever is being
      // looked at, so the gauge that measures it matches.
      const bodyColour = fromYou ? 'var(--orange)' : 'var(--blue)';
      if (gModelSwatch) gModelSwatch.style.background = bodyColour;
      if (gModelFill) gModelFill.style.background = bodyColour;
      gModel.querySelector('.gauge-lbl').lastChild.textContent = `${whoT}'s body you can hit`;
      gaugeNote.textContent =
        `${whoO}'s camera. ${whoT} has ${describe(empty, ref.dome)} movement room, `
        + `and ${describe(model, ref.model)} of his body is showing.`;
      exact.innerHTML =
        `hittable area &nbsp;${model.toFixed(2)} msr<br>` +
        `movement room &nbsp;${empty.toFixed(2)} msr<br>` +
        `of his whole body &nbsp;${ref.model > 0 ? ((model / ref.model) * 100).toFixed(0) : '0'}%<br>` +
        `unclipped reachable space &nbsp;${ref.dome.toFixed(2)} msr<br>` +
        `range &nbsp;${r.range.toFixed(2)} m`;
    }

    map?.render({
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
