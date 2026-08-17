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
import { requestRose, latest } from '../ui/solverClient.js';
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
 *   rose       drawn whenever layers.rose or layers.normals is on. The figure
 *              solves it itself and re-solves it when the enemy moves.
 *   layers     extra top-down layers
 *   onChange   called after every render with the evaluation
 */
export function figure(spec) {
  const p = { ...DEFAULT_PARAMS, bufW: 168, bufH: 116, domeGrid: 37, ...(spec.params || {}) };
  const scene = spec.scene;
  let you = { ...spec.you };
  let enemy = { ...spec.enemy };
  let rose = null;

  // The rose is a property of the target and the map, so it goes stale the
  // moment the enemy is dragged. It used to be solved once by the caller and
  // then kept forever, which left the reference directions and the yellow
  // openness curve describing a position the enemy had already left. The
  // figure owns the enemy, so it owns the rose.
  const wantsRose = !!(spec.layers?.rose || spec.layers?.normals);
  const takeRose = latest();
  let roseTimer = 0;

  function solveRose() {
    if (!wantsRose) return;
    const at = { x: enemy.x, y: enemy.y };
    takeRose(
      requestRose(scene, at, p, { radius: spec.roseRadius ?? 9 }),
      (r) => { rose = r; render(); },
    );
  }

  /**
   * Drop the stale rose straight away rather than draw a reference direction
   * for the wrong position, and re-solve once the drag settles. The sweep is
   * a hundred-odd renders, so it waits for the same pause the sharp pass does.
   */
  function roseWentStale() {
    if (!wantsRose) return;
    rose = null;
    clearTimeout(roseTimer);
    roseTimer = setTimeout(solveRose, 180);
  }

  // Two rendering tiers. Dragging wants frames, so it gets the small buffer.
  // Once the reader stops moving, the same view is redrawn near the display
  // resolution, which is both a sharper picture and a better measurement: a
  // sliver of a body that is a fraction of a pixel wide gets quantised to a
  // whole pixel at low resolution, and small visible targets read high.
  // The sharp pass used to render a fixed 420 pixels wide whatever the figure
  // was displayed at. A scope on a wide screen is drawn about 830 CSS pixels
  // across, so the picture was being blown up four times and looked it. It
  // now renders at the width it is actually shown at, which is a two-fold
  // improvement in linear resolution, and the cap keeps a single pass in the
  // low tens of milliseconds rather than the hundreds.
  const FINE_CAP = 900;
  const aspect = p.bufH / p.bufW;
  const makeFine = (w) => ({
    ...p,
    bufW: w,
    bufH: Math.round(w * aspect),
    // The reachable space is drawn as a grid of columns, so its outline is a
    // staircase at cell resolution. The cells have to stay under about two
    // pixels or the silhouette gains visible steps, which is exactly the edge
    // being measured, so the grid grows with the buffer.
    domeGrid: Math.max(p.domeGrid, Math.min(71, Math.round(w / 12) * 2 + 1)),
  });

  let fine = makeFine(Math.max(p.bufW, spec.fineWidth ?? 420));
  const pair = makePair(p.bufW, p.bufH);
  let fineBuf = makeFramebuffer(fine.bufW, fine.bufH);
  const refBuf = makeFramebuffer(p.bufW, p.bufH);
  let refBufFine = makeFramebuffer(fine.bufW, fine.bufH);

  /** Match the sharp buffer to how large the scope is actually being drawn. */
  function ensureFine() {
    const cssW = scopeCanvas.getBoundingClientRect().width;
    if (!cssW) return;
    const want = Math.min(FINE_CAP, Math.max(p.bufW, Math.round(cssW)));
    if (Math.abs(want - fine.bufW) <= 32) return;    // ignore small reflows
    fine = makeFine(want);
    fineBuf = makeFramebuffer(fine.bufW, fine.bufH);
    refBufFine = makeFramebuffer(fine.bufW, fine.bufH);
  }
  let refineTimer = 0;
  const mapCanvas = el('canvas');
  const scopeCanvas = el('canvas');

  const swap = povSwap('you', () => render('fine'));
  const gModel = gauge('Hittable area', { swatch: 'orange', color: 'var(--orange)' });
  const gModelSwatch = gModel.querySelector('.swatch');
  const gModelFill = gModel.querySelector('.gauge-track i');
  const gEmpty = gauge('Movement room', { swatch: 'yellow', color: '#c9a521' });
  const gaugeNote = el('p', { class: 'dim gauge-note', style: { fontSize: 'var(--step--2)', margin: '0.5rem 0 0', fontFamily: 'var(--mono)' } });

  // The note is a live readout that rewrites on every drag, so a shorter
  // wording would let the panel collapse and the figure jump under the
  // reader's cursor. Reserving a flat two lines does not solve it: this
  // sentence runs to about ninety characters, so a wide panel wants one line
  // and a narrow column wants three and still jumps. Instead the box is
  // measured once against the longest wording it can ever hold, and measured
  // again only if the column changes width.
  const LONGEST = "Enemy's camera. Enemy has very large movement room, "
    + 'and very large of their body is showing.';
  let noteWidth = -1;
  function reserveNote() {
    const w = gaugeNote.clientWidth;
    if (w === 0 || w === noteWidth) return;
    noteWidth = w;
    const shown = gaugeNote.textContent;
    gaugeNote.style.minHeight = '';
    gaugeNote.textContent = LONGEST;
    const h = gaugeNote.scrollHeight;
    gaugeNote.textContent = shown;
    gaugeNote.style.minHeight = `${h}px`;
  }

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
      // Only the enemy's own position changes his rose. Moving yourself
      // changes where you stand relative to it, which the readouts already
      // recompute on every render.
      if (who === 'viewer') you = q; else { enemy = q; roseWentStale(); }
      spec.onDrag?.(who, q);
      render('fast');
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
  function references(observer, target, targetIs, q, buf) {
    const zT = groundHeight(scene.solids, target.x, target.y);
    const zO = groundHeight(scene.solids, observer.x, observer.y);
    const pad = { solids: [box([-500, -500, zT - 1], [500, 500, zT], { role: 'platform' })] };
    const yaw = Math.atan2(target.y - observer.y, target.x - observer.x);
    const obs = { x: observer.x, y: observer.y, z: zO, yaw };
    const tgt = { x: target.x, y: target.y, z: zT, yaw: yaw + Math.PI };
    const openDome = buildDome(pad, tgt, q);
    const clear = look(pad, obs, tgt, openDome, q, { fb: buf, targetIs });
    return { dome: clear.dome * 1000, model: clear.model * 1000 };
  }

  function render(quality = 'fine') {
    const hi = quality === 'fine';
    if (hi) ensureFine();
    // The cheap pass always runs: it supplies the map, both reachable spaces
    // and the facings, none of which need resolution. Only the one viewport
    // actually on screen is then redrawn sharply, which is half the work of
    // rendering both sides at full size.
    const r = evaluateInto(pair, scene, you, enemy, p, spec.evalOpts || {});
    const fromYou = swap.pov === 'you';
    const q = hi ? fine : p;

    // While the reader is dragging, come back for a sharp pass once they stop.
    clearTimeout(refineTimer);
    if (!hi) refineTimer = setTimeout(() => render('fine'), 160);

    // The scope always shows what the current camera sees of the other player.
    let seen = fromYou ? r.mine : r.theirs;
    if (hi) {
      const observer = fromYou ? r.me : r.foe;
      const target = fromYou ? r.foe : r.me;
      seen = look(scene, observer, target, buildDome(scene, target, fine), fine, {
        fb: fineBuf, drawWorld: true, targetIs: fromYou ? 'red' : 'blue',
      });
      seen.distance = r.range;
    }
    const cam = seen.cam;
    drawScope(scopeCanvas, seen.fb, cam, {
      note: `${r.range.toFixed(1)} m`,
      aimPoint: spec.aimPoint,
      marks: spec.marks,
      contacts: seen.contacts,
    });

    if (gaugeBlock) {
      const observer = fromYou ? you : enemy;
      const target = fromYou ? enemy : you;
      const ref = references(observer, target, fromYou ? 'red' : 'blue', q, hi ? refBufFine : refBuf);
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
        + `and ${describe(model, ref.model)} of their body is showing.`;
      reserveNote();
      exact.innerHTML =
        `hittable area &nbsp;${model.toFixed(2)} msr<br>` +
        `movement room &nbsp;${empty.toFixed(2)} msr<br>` +
        `of their whole body &nbsp;${ref.model > 0 ? ((model / ref.model) * 100).toFixed(0) : '0'}%<br>` +
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
      if (nextEnemy) {
        const moved = nextEnemy.x !== enemy.x || nextEnemy.y !== enemy.y;
        enemy = { ...nextEnemy };
        if (moved) roseWentStale();
      }
      render();
    },
    solveRose,
    setScene(next) { spec.scene = next; },
  };
}

/** Two figures side by side, for the contrasts the site leans on. */
export const sideBySide = (a, b) => el('div', {
  style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 13rem), 1fr))', gap: 'var(--gap)' },
}, a, b);
