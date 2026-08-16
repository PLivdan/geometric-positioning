/**
 * perspective.js — what a step around a corner reveals.
 *
 * The purple region is the set of ground cells that become visible when the
 * current player takes one step sideways. It is measured, not sketched: two
 * visibility grids, differenced.
 *
 * The formula lives in the appendix. What belongs here is the mechanism, and
 * the warning that the mechanism is about a corner between the two players
 * rather than about cover in general.
 */

import { el, slider } from '../ui/dom.js';
import { C, alpha } from '../ui/palette.js';
import { drawPlot, numTicks } from '../ui/plot.js';
import { createTopDown } from '../ui/topdown.js';
import { clampToScene } from '../ui/engine.js';
import { gauge, advanced } from '../ui/teach.js';
import { DEFAULT_PARAMS } from '../core/params.js';
import { revealed, exposureLaw, cornerControl } from '../core/visibility.js';
import { box } from '../core/geom.js';

const FAR = 40;

export function revealControl(mount) {
  const p = { ...DEFAULT_PARAMS };
  const scene = {
    bounds: { x: [-13, 13], y: [-9, 13] },
    solids: [box([-FAR, -0.7, 0], [0, 0.7, 3.2], { label: 'wall', role: 'wall' })],
  };
  const corner = { x: 0, y: -0.7 };
  let you = { x: 6.4, y: 5.8 };
  let enemy = { x: -1.7, y: -1.9 };
  let step = 0.4;

  const mapCanvas = el('canvas');
  const plotCanvas = el('canvas');
  const gYou = gauge('New ground Blue exposes per step', { swatch: 'purple', color: 'var(--purple)' });
  const gEnemy = gauge('New ground Red exposes per step', { swatch: 'purple', color: 'var(--purple)' });
  const note = el('p', { class: 'dim', style: { fontSize: 'var(--step--1)', margin: '0.8rem 0 0' } });
  const exact = el('div', { class: 'mono', style: { fontSize: 'var(--step--2)', lineHeight: '1.7', color: 'var(--ink-2)' } });

  mount.appendChild(el('div.stack',
    el('div.map-wrap',
      el('div.scope',
        el('div.scope-head', el('span', 'One step sideways'), el('b', 'purple = newly visible')),
        el('div', mapCanvas),
      ),
      el('div.map-hint', 'drag either player'),
    ),
    el('div.legend',
      el('span', el('i.swatch.sw-yellow'), 'visible now'),
      el('span', el('i.swatch.sw-purple'), 'revealed by the step'),
    ),
    el('div.panel', el('div.panel-body',
      slider({
        label: 'Size of the step', min: 0.1, max: 1.2, step: 0.05, value: step,
        format: (v) => `${v.toFixed(2)} m`,
        hint: 'a 300 ms strafe covers roughly 1.6 m',
        oninput: (v) => { step = v; draw(); },
      }),
      el('div.gauge', { style: { marginTop: '0.8rem' } }, gYou, gEnemy),
      note,
      advanced('Exact figures', exact),
    )),
    el('div.scope',
      el('div.scope-head', el('span', 'Exposure against standoff'), el('b', 'measured')),
      el('div', plotCanvas),
    ),
  ));

  const map = createTopDown(mapCanvas, {
    maxHeight: 350,
    onDrag: (who, x, y) => {
      const q = clampToScene(scene, x, y, p);
      if (who === 'viewer') you = q; else enemy = q;
      draw();
    },
  });

  // The curve depends only on the corner, so it is computed once.
  const law = exposureLaw(scene, corner, { x: 0.62, y: 0.78 }, scene.bounds, {
    n: 16, dMin: 1.4, dMax: 13, res: 150, step: 0.3, L: 12,
  });
  const peak = Math.max(...law.points.map((q) => q.measured));

  function draw() {
    const dx = corner.x - you.x, dy = corner.y - you.y;
    const d = Math.hypot(dx, dy) || 1;
    const lx = -dy / d, ly = dx / d;
    const rev = revealed(scene, you, { x: you.x + lx * step, y: you.y + ly * step }, scene.bounds, 190);
    const ctl = cornerControl(scene, you, enemy, corner, scene.bounds, { step, res: 160 });

    map.render({
      scene, bounds: scene.bounds, enemy, viewer: you,
      layers: { visibility: true, sight: true },
      visibility: { grid: rev.A, gain: rev.gain, base: rev.A.g },
    });

    const scale = Math.max(ctl.mine.rate, ctl.theirs.rate, 1);
    gYou.set(ctl.mine.rate, scale, false);
    gEnemy.set(ctl.theirs.rate, scale, false);

    const finer = ctl.mine.rate < ctl.theirs.rate;
    note.textContent = finer
      ? `Blue is ${(ctl.mine.distance / Math.max(0.1, ctl.theirs.distance)).toFixed(1)} times further from the corner, so each step of his uncovers less new ground than each step of Red's. Blue decides how much to show and when.`
      : 'Red is further from the corner than Blue, so his steps uncover ground more gradually. He has the finer control here, and Blue is the one committing.';

    exact.innerHTML =
      `Blue &nbsp;${ctl.mine.rate.toFixed(1)} m² per m stepped, at ${ctl.mine.distance.toFixed(1)} m from the corner<br>` +
      `Red &nbsp;&nbsp;${ctl.theirs.rate.toFixed(1)} m² per m stepped, at ${ctl.theirs.distance.toFixed(1)} m<br>` +
      `ratio ${Number.isFinite(ctl.exposureRatio) ? ctl.exposureRatio.toFixed(2) : '—'}`;

    drawPlot(plotCanvas, {
      height: 186,
      xMin: 0, xMax: 13.5, yMin: 0, yMax: peak * 1.15,
      xTicks: numTicks(0, 13.5, 4, (v) => `${v.toFixed(0)} m`),
      yTicks: numTicks(0, peak * 1.1, 3, (v) => v.toFixed(0)),
      series: [
        { data: law.points.map((q) => [q.d, q.measured]), color: C.purpleLit, style: 'area', width: 2, fill: alpha(C.purpleLit, 0.12) },
        { data: law.points.map((q) => [q.d, q.measured]), color: C.purpleLit, style: 'dots', radius: 2.2 },
      ],
      markers: [{ x: d, color: C.blueLit, label: 'Blue', width: 1.4 }],
      xLabel: 'distance from the corner',
      yLabel: 'ground revealed per step',
    });
  }
  draw();
  window.addEventListener('resize', draw);
}
