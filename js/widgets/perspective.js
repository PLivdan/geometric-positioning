/**
 * perspective.js, Figure 23, measured.
 *
 * The purple region on the map is literally the set of ground cells that
 * become visible when you take one step sideways. Its area, divided by the
 * step, is the exposure rate, and the chart puts that measurement against
 * the closed form L²/2d.
 */

import { el, slider, readout, fmt } from '../ui/dom.js';
import { C, alpha } from '../ui/palette.js';
import { drawPlot, numTicks } from '../ui/plot.js';
import { createTopDown } from '../ui/topdown.js';
import { clampToScene } from '../ui/engine.js';
import { DEFAULT_PARAMS } from '../core/params.js';
import { revealed, exposureRate, exposureLaw, cornerControl } from '../core/visibility.js';
import { box } from '../core/geom.js';

const FAR = 40;

export function perspective(mount) {
  const p = { ...DEFAULT_PARAMS };
  const scene = {
    bounds: { x: [-13, 13], y: [-9, 13] },
    solids: [box([-FAR, -0.7, 0], [0, 0.7, 3.2], { label: 'wall', role: 'wall' })],
  };
  const corner = { x: 0, y: -0.7 };
  let me = { x: 6.4, y: 5.8 };
  let foe = { x: -1.7, y: -1.9 };
  let step = 0.4;

  const mapCanvas = el('canvas');
  const plotCanvas = el('canvas');
  const rMine = readout('You reveal, per metre stepped', { swatch: 'purple' });
  const rTheirs = readout('He reveals, per metre stepped', { swatch: 'purple' });
  const rDist = readout('Distance to the corner, you / him');
  const rCtl = readout('Control ratio', { big: true });
  const note = el('p.fig-cap');

  const wrap = el('div.stack',
    el('div.map-wrap',
      el('div.scope',
        el('div.scope-head', el('span', 'One step around the corner'), el('b', 'Figure 23')),
        el('div', mapCanvas),
      ),
      el('div.map-hint', 'drag either player'),
    ),
    el('div.legend',
      el('span', el('i.swatch.sw-yellow'), 'visible now'),
      el('span', el('i.swatch.sw-purple'), 'revealed by one step'),
    ),
    el('div.panel', el('div.panel-body',
      slider({
        label: 'Size of the step', min: 0.1, max: 1.2, step: 0.05, value: step,
        format: (v) => `${v.toFixed(2)} m`,
        hint: 'a 300 ms strafe covers about 1.6 m',
        oninput: (v) => { step = v; draw(); },
      }),
    )),
    el('div.readouts', rMine, rTheirs, rDist, rCtl),
    note,
    el('div.scope',
      el('div.scope-head', el('span', 'Exposure against standoff'), el('b', 'measured vs L²/2d')),
      el('div', plotCanvas),
    ),
  );
  mount.appendChild(wrap);

  const map = createTopDown(mapCanvas, {
    maxHeight: 360,
    onDrag: (who, x, y) => {
      const q = clampToScene(scene, x, y, p);
      if (who === 'viewer') me = q; else foe = q;
      draw();
    },
  });

  // The law only needs computing once, the geometry of the corner is fixed.
  const law = exposureLaw(scene, corner, { x: 0.62, y: 0.78 }, scene.bounds, {
    n: 16, dMin: 1.4, dMax: 13, res: 150, step: 0.3, L: 12,
  });

  function draw() {
    const dx = corner.x - me.x, dy = corner.y - me.y;
    const d = Math.hypot(dx, dy) || 1;
    const lx = -dy / d, ly = dx / d;
    const rev = revealed(scene, me, { x: me.x + lx * step, y: me.y + ly * step }, scene.bounds, 190);

    const ctl = cornerControl(scene, me, foe, corner, scene.bounds, { step, res: 160 });

    map.render({
      scene, bounds: scene.bounds, enemy: foe, viewer: me,
      layers: { visibility: true, sight: true },
      visibility: { grid: rev.A, gain: rev.gain, base: rev.A.g },
    });

    rMine.set(ctl.mine.rate.toFixed(1), 'm²/m');
    rTheirs.set(ctl.theirs.rate.toFixed(1), 'm²/m');
    rDist.set(`${ctl.mine.distance.toFixed(1)} / ${ctl.theirs.distance.toFixed(1)}`, 'm');
    const ratio = Number.isFinite(ctl.exposureRatio) ? ctl.exposureRatio : 99;
    rCtl.setHTML(`<span style="color:${ratio < 1 ? 'var(--green)' : 'var(--red)'}">${ratio.toFixed(2)}×</span>`);

    note.innerHTML = ratio < 1
      ? `<b>You control the corner.</b> Each step you take reveals ${(1 / ratio).toFixed(1)}× less than each step he takes, so you choose what to show and when. He does not. You are ${(ctl.mine.distance / Math.max(0.1, ctl.theirs.distance)).toFixed(1)}× further from it than he is.`
      : `<b>He controls the corner.</b> He is standing further from it than you are, so his steps reveal less than yours do. Back off the corner before you show yourself.`;

    drawPlot(plotCanvas, {
      height: 186,
      xMin: 0, xMax: 13.5,
      yMin: 0, yMax: Math.max(...law.points.map((q) => Math.max(q.measured, q.model))) * 1.1,
      xTicks: numTicks(0, 13.5, 4, (v) => `${v.toFixed(0)} m`),
      yTicks: numTicks(0, Math.max(...law.points.map((q) => q.measured)) * 1.15, 3, (v) => v.toFixed(0)),
      series: [
        { data: law.points.map((q) => [q.d, q.model]), color: alpha(C.scopeInk2, 0.85), style: 'line', width: 1.3, dash: [5, 4] },
        { data: law.points.map((q) => [q.d, q.measured]), color: C.purpleLit, style: 'line', width: 2 },
        { data: law.points.map((q) => [q.d, q.measured]), color: C.purpleLit, style: 'dots', radius: 2.2 },
      ],
      markers: [{ x: d, color: C.blueLit, label: 'you', width: 1.4 }],
      legend: [
        { label: 'measured', color: C.purpleLit },
        { label: 'L² / 2d', color: alpha(C.scopeInk2, 0.85), dash: [5, 4] },
      ],
      xLabel: 'distance to the corner',
      yLabel: 'm² revealed per m',
    });
  }
  draw();
  window.addEventListener('resize', draw);
}
