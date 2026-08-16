/**
 * concepts.js, the instruments that carry §2.1 and §2.2.
 */

import { el, slider, segmented, readout, rafLoop, onVisible, fmt } from '../ui/dom.js';
import { C, alpha, fitCanvas, MONO, UI } from '../ui/palette.js';
import { drawPlot, angleTicks, numTicks } from '../ui/plot.js';
import { drawScope } from '../ui/scope.js';
import { createTopDown } from '../ui/topdown.js';
import { evaluatePair, makePair, evaluateInto, clampToScene } from '../ui/engine.js';
import { DEFAULT_PARAMS, diskRadius, diskAxes } from '../core/params.js';
import { buildDome, freeDirections, freeDirectionSweep } from '../core/dome.js';
import { bearing, angleOffNormal } from '../core/normals.js';
import { requestRose, latest } from '../ui/solverClient.js';
import { apparentDome, makeFramebuffer, look } from '../core/solver.js';
import { box, groundHeight, wrapDeg, DEG, RAD } from '../core/geom.js';

const FAR = 40;
const wallScene = {
  bounds: { x: [-13, 13], y: [-3, 15] },
  solids: [box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'infinite wall' })],
};

// ═══════════════════════════════════════════════════════════════ hero ════
/**
 * The thesis, moving: an observer orbits an enemy pinned to a wall while the
 * apparent width of his dome falls from 2r to r. Figures 6 and 7, animated,
 * with the rose being traced behind it.
 */
export function hero(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 320, bufH: 160, domeGrid: 47, fov: 74 };
  const enemy = { x: 0, y: 0.32 };
  const R = 7.2;
  let rose = null;
  requestRose(wallScene, enemy, p, { n: 108, radius: R }).then((r) => { rose = r; });
  const free = buildDome({ solids: [] }, { ...enemy, yaw: 0 }, p);
  const probe = makeFramebuffer(p.bufW, p.bufH);

  const scopeCanvas = el('canvas');
  const mapCanvas = el('canvas');
  const bigVal = el('span', '2.00');
  const angleVal = el('b', '0°');
  const msrVal = el('span', '0.0');

  const wrap = el('div.stack',
    el('div.scope.hero-scope',
      el('div.scope-head',
        el('span', 'Your view of him'),
        el('b', ['θ = ', angleVal, ' off the normal']),
      ),
      el('div', { style: { position: 'relative' } },
        scopeCanvas,
        el('div.hero-gauge',
          el('div.hero-num', bigVal, el('i', '×')),
          el('div.hero-lbl',
            el('div', 'his apparent player-dome,'),
            el('div', 'relative to the side-on view'),
          ),
        ),
      ),
      el('div.scope-foot',
        el('span', [el('i.swatch.sw-yellow'), ' empty-dome, the space you must chase']),
        el('span', [el('i.swatch.sw-orange'), ' model-dome, what you can hit']),
        el('span', { style: { marginLeft: 'auto' } }, [el('b', msrVal), ' msr on screen']),
      ),
    ),
    el('div.map-wrap',
      el('div.scope', el('div', mapCanvas)),
      el('div.map-hint', 'the Positioning Rose, green marks the normal'),
    ),
  );
  mount.appendChild(wrap);

  const map = createTopDown(mapCanvas, { draggable: false, maxHeight: 320 });
  let side = 1;

  const at = (theta) => {
    const b = (90 + theta) * DEG;
    return { x: enemy.x + Math.cos(b) * R, y: enemy.y + Math.sin(b) * R };
  };
  const sideRef = apparentDome(at(90), enemy, buildDome(wallScene, { ...enemy, yaw: 90 * DEG }, p), p, probe);

  rafLoop(wrap, (t) => {
    // 0 → 90 → 0, easing at the turns so the two extremes get read
    const u = (Math.sin(t * 0.45) + 1) / 2;
    const theta = (1 - Math.cos(u * Math.PI)) / 2 * 90 * side;
    const viewer = at(theta);
    const yaw = Math.atan2(enemy.y - viewer.y, enemy.x - viewer.x);
    const foe = { ...enemy, yaw: yaw + Math.PI };
    const dome = buildDome(wallScene, foe, p);
    const seen = look(wallScene, { ...viewer, yaw }, foe, dome, p, { drawWorld: true });

    drawScope(scopeCanvas, seen.fb, seen.cam, {});
    const ratio = sideRef > 0 ? apparentDome(viewer, enemy, dome, p, probe) / sideRef : 0;
    bigVal.textContent = ratio.toFixed(2);
    angleVal.textContent = `${Math.abs(theta).toFixed(0)}°`;
    msrVal.textContent = (seen.dome * 1000).toFixed(1);

    map.render({
      scene: wallScene, bounds: wallScene.bounds,
      enemy, viewer, enemyYaw: foe.yaw, viewerYaw: yaw,
      enemyDome: dome, rose,
      layers: { rose: !!rose, normals: !!rose, enemyDome: true, sight: true },
    });
  });
}

// ═════════════════════════════════════════════════════════ Necker cube ═══
export function necker(mount) {
  const readings = [
    { id: 'above', label: 'A cube from above' },
    { id: 'below', label: 'A cube from below' },
    { id: 'flat', label: 'Twelve line segments' },
  ];
  let mode = 'above';
  const canvas = el('canvas');
  const caption = el('p.fig-cap', { html: '<b>Figure 1.</b> Do you see a cube from above, from below, or just a collection of 2-dimensional lines?' });

  const wrap = el('div.stack',
    el('div.scope', el('div.scope-head', el('span', 'Figure 1'), el('b', 'the same 12 lines')), el('div', canvas)),
    segmented({
      value: mode, options: readings.map((r) => ({ value: r.id, label: r.label })),
      onchange: (v) => { mode = v; draw(); },
    }),
    caption,
  );
  mount.appendChild(wrap);

  function draw() {
    const cssW = mount.clientWidth || 380;
    const { ctx, w, h } = fitCanvas(canvas, cssW, Math.round(cssW * 0.62));
    ctx.fillStyle = C.scope; ctx.fillRect(0, 0, w, h);
    const s = Math.min(w, h) * 0.29;
    const cx = w / 2, cy = h / 2;
    const front = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [cx + x * s, cy + y * s]);
    const off = s * 0.55;
    const back = front.map(([x, y]) => [x + off, y - off]);

    const line = (a, b, style) => {
      ctx.strokeStyle = style.color; ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash || []);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.setLineDash([]);
    };
    const bold = { color: C.scopeInk, width: 2.2 };
    const faint = { color: alpha(C.scopeInk2, 0.55), width: 1.2 };
    const flat = { color: alpha(C.blueLit, 0.9), width: 1.6 };

    const nearIsFront = mode === 'above';
    const A = mode === 'flat' ? flat : (nearIsFront ? bold : faint);
    const B = mode === 'flat' ? flat : (nearIsFront ? faint : bold);

    for (let i = 0; i < 4; i++) {
      line(front[i], front[(i + 1) % 4], A);
      line(back[i], back[(i + 1) % 4], B);
      line(front[i], back[i], mode === 'flat' ? flat : { color: alpha(C.scopeInk, 0.8), width: 1.6 });
    }
    if (mode === 'flat') {
      ctx.font = MONO(10.5, 500);
      ctx.fillStyle = alpha(C.blueLit, 0.85);
      ctx.textAlign = 'center';
      ctx.fillText('no depth, this is what 2d aim sees', cx, h - 14);
      ctx.textAlign = 'left';
    }
  }
  draw();
  window.addEventListener('resize', draw);
}

// ══════════════════════════════════════════════════════ player-disk ══════
export function disk(mount) {
  const p = { ...DEFAULT_PARAMS };
  const canvas = el('canvas');
  const rRead = readout('Player-disk radius', { swatch: 'blue' });
  const aRead = readout('Reachable ground area');
  const vRead = readout('Dome height (jump apex)');

  const wrap = el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', 'Player-disk, from above'), el('b', 'Figure 2')),
      el('div', canvas),
    ),
    el('div.legend',
      el('span', el('i.swatch.sw-red'), 'the eight keys'),
      el('span', el('i.swatch.sw-purple'), 'reachable by tapping'),
      el('span', el('i.swatch.sw-blue'), 'the player-disk'),
    ),
    el('div.panel', el('div.panel-body',
      el('div.controls',
        slider({
          label: 'Ground speed', min: 3, max: 9, step: 0.1, value: p.speed,
          format: (v) => `${v.toFixed(1)} m/s`,
          hint: 'Overwatch base is 5.5, Quake is faster',
          oninput: (v) => { p.speed = v; draw(); },
        }),
        slider({
          label: 'Fight time-scale', min: 0.1, max: 0.8, step: 0.01, value: p.dt,
          format: (v) => `${(v * 1000).toFixed(0)} ms`,
          hint: 'the 300 ms of a fight',
          oninput: (v) => { p.dt = v; draw(); },
        }),
        slider({
          label: 'Strafe speed', min: 0.4, max: 1, step: 0.01, value: p.strafeRatio,
          format: (v) => `${(v * 100).toFixed(0)}% of forward`,
          hint: 'below 100% the disk becomes an ellipse',
          oninput: (v) => { p.strafeRatio = v; draw(); },
        }),
        slider({
          label: 'Backward speed', min: 0.4, max: 1, step: 0.01, value: p.backRatio,
          format: (v) => `${(v * 100).toFixed(0)}% of forward`,
          oninput: (v) => { p.backRatio = v; draw(); },
        }),
      ),
    )),
    el('div.readouts', rRead, aRead, vRead),
    el('p.fig-cap', { html: '<b>Figure 2.</b> He is in blue and does not turn, so his orientation is fixed. The eight movement directions are red. The purple ones are what tapping keys in combination buys him. Every point of the disk is reachable inside 300 ms.' }),
  );
  mount.appendChild(wrap);

  function draw() {
    const cssW = mount.clientWidth || 380;
    const { ctx, w, h } = fitCanvas(canvas, cssW, Math.round(cssW * 0.72));
    ctx.fillStyle = C.scope; ctx.fillRect(0, 0, w, h);
    const ax = diskAxes(p);
    const rMax = Math.max(ax.fwd, ax.back, ax.side);
    const s = (Math.min(w, h) * 0.40) / Math.max(rMax, 0.4);
    const cx = w / 2, cy = h / 2;

    // grid
    ctx.strokeStyle = alpha('#ffffff', 0.05); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = -6; g <= 6; g++) {
      ctx.moveTo(cx + g * s, 0); ctx.lineTo(cx + g * s, h);
      ctx.moveTo(0, cy + g * s); ctx.lineTo(w, cy + g * s);
    }
    ctx.stroke();

    // the disk: forward is up
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const u = Math.cos(a), v = Math.sin(a);
      const ru = u >= 0 ? ax.fwd : ax.back;
      const rr = 1 / Math.hypot(u / ru, v / ax.side);
      const x = cx + v * rr * s, y = cy - u * rr * s;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = alpha(C.blueLit, 0.15); ctx.fill();
    ctx.strokeStyle = alpha(C.blueLit, 0.85); ctx.lineWidth = 1.6; ctx.stroke();

    // tapped directions (purple), then the eight keys (red)
    for (let k = 0; k < 32; k++) {
      if (k % 4 === 0) continue;
      const a = (k / 32) * Math.PI * 2;
      const u = Math.cos(a), v = Math.sin(a);
      const ru = u >= 0 ? ax.fwd : ax.back;
      const rr = 1 / Math.hypot(u / ru, v / ax.side);
      ctx.strokeStyle = alpha(C.purpleLit, 0.4); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + v * rr * s, cy - u * rr * s); ctx.stroke();
    }
    const names = ['W', 'WD', 'D', 'SD', 'S', 'SA', 'A', 'WA'];
    ctx.font = MONO(10, 600);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const u = Math.cos(a), v = Math.sin(a);
      const ru = u >= 0 ? ax.fwd : ax.back;
      const rr = 1 / Math.hypot(u / ru, v / ax.side);
      const ex = cx + v * rr * s, ey = cy - u * rr * s;
      ctx.strokeStyle = C.redLit; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = C.redLit;
      ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(names[k], cx + v * rr * s * 1.16, cy - u * rr * s * 1.16);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // the player
    ctx.fillStyle = C.blueLit;
    ctx.strokeStyle = C.scope; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    const r = diskRadius(p);
    rRead.set(`${r.toFixed(2)}`, 'm');
    aRead.set(`${(Math.PI * ax.fwd * ax.side).toFixed(1)}`, 'm²');
    vRead.set(`${(p.bodyHeight + p.jump).toFixed(2)}`, 'm');
  }
  draw();
  window.addEventListener('resize', draw);
}

// ═══════════════════════════════════════════════════ free directions ═════
export function freedirs(mount) {
  const p = { ...DEFAULT_PARAMS };
  const scene = wallScene;
  const enemy = { x: 0, y: 0.30 };
  let theta = 65;

  const mapCanvas = el('canvas');
  const plotCanvas = el('canvas');
  const nFree = readout('Free directions', { swatch: 'red', big: true });
  const mob = readout('Mobility (mean achievable step)');
  const verdict = el('p.fig-cap');

  const wrap = el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', 'Enemy against an infinite wall'), el('b', 'from above')),
      el('div', mapCanvas),
    ),
    el('div.panel', el('div.panel-body',
      slider({
        label: 'Your angle from the normal', min: -180, max: 180, step: 1, value: theta,
        format: (v) => `${v > 0 ? '+' : ''}${v}°`,
        hint: 'drag through 45° and watch a key come back to him',
        oninput: (v) => { theta = v; draw(); },
      }),
    )),
    el('div.readouts', nFree, mob),
    el('div.scope',
      el('div.scope-head', el('span', 'Free directions vs your angle'), el('b', '§4.1-6')),
      el('div', plotCanvas),
    ),
    verdict,
  );
  mount.appendChild(wrap);

  const map = createTopDown(mapCanvas, { draggable: false, maxHeight: 300 });
  const sweep = freeDirectionSweep(scene, enemy, p, 360);
  let rose = null;
  requestRose(scene, enemy, p, { radius: 8.5 }).then((r) => { rose = r; draw(); });

  function draw() {
    const b = (90 + theta) * DEG;
    const R = 8.5;
    const viewer = { x: enemy.x + Math.cos(b) * R, y: enemy.y + Math.sin(b) * R };
    const yaw = Math.atan2(enemy.y - viewer.y, enemy.x - viewer.x);
    const foe = { ...enemy, yaw: yaw + Math.PI };
    const fd = freeDirections(scene, foe, p);
    const dome = buildDome(scene, foe, p);

    map.render({
      scene, bounds: scene.bounds, enemy, viewer,
      enemyYaw: foe.yaw, viewerYaw: yaw, enemyDome: dome, rose,
      layers: { enemyDome: true, freeDirs: true, sight: true, normals: !!rose },
      freeDirs: fd,
    });

    nFree.set(`${fd.nFree}`, 'of 8');
    mob.set(`${(fd.mobility * 100).toFixed(0)}`, '%');

    const data = [];
    for (let i = 0; i < 360; i++) {
      // sweep index i is a world bearing; convert to an angle off the normal
      data.push([wrapDeg(i - 90), sweep.counts[i]]);
    }
    data.sort((a, b2) => a[0] - b2[0]);

    drawPlot(plotCanvas, {
      height: 168,
      xMin: -180, xMax: 180, yMin: 2.4, yMax: 5.6,
      xTicks: [-180, -135, -90, -45, 0, 45, 90, 135, 180].map((v) => ({ v, label: `${v}°` })),
      yTicks: [3, 4, 5].map((v) => ({ v, label: String(v) })),
      series: [{ data, color: C.redLit, style: 'step', width: 1.8 }],
      markers: [{ x: theta, color: C.blueLit, label: 'you', width: 1.6 }],
      bands: [-180, -135, -90, -45, 0, 45, 90, 135, 180].map((v) => ({
        from: v - 1.6, to: v + 1.6, color: alpha(C.greenLit, 0.16),
      })),
      xLabel: 'your angle from the normal',
      yLabel: 'free directions',
    });

    const onSpike = Math.abs(wrapDeg(theta) % 45) < 2 || Math.abs(Math.abs(wrapDeg(theta) % 45) - 45) < 2;
    verdict.innerHTML = onSpike
      ? '<b>Five free directions.</b> Two of his keys land exactly tangent to the wall, so they slide along it instead of into it. That is why 45° is not an optimal angle. It hands him a key back for nothing.'
      : '<b>Four free directions.</b> Four of his eight keys now run straight into the wall. If he holds one too long he collides, loses ground speed, and becomes easier to hit.';
  }
  draw();
  window.addEventListener('resize', draw);
}

// ═══════════════════════════════════════════════════════════ the rose ════
export function roseWidget(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 132, bufH: 92 };
  const scenes = {
    wall: {
      label: 'Against a wall', enemy: { x: 0, y: 0.32 },
      scene: wallScene, note: 'One maximum, perpendicular to the wall, and the curve is r(1 + cos θ).',
    },
    corner: {
      label: 'In a corner', enemy: { x: 0.34, y: 0.34 },
      scene: {
        bounds: { x: [-4, 16], y: [-4, 16] },
        solids: [
          box([-2.4, -FAR, 0], [0, FAR, 3.2], { label: 'wall' }),
          box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'wall' }),
        ],
      },
      note: 'One maximum, sitting on the angle bisector, which is the answer the guide gives.',
    },
    open: {
      label: 'In the open', enemy: { x: 0, y: 0 },
      scene: { bounds: { x: [-11, 11], y: [-11, 11] }, solids: [] },
      note: 'The curve is flat, so every direction is a normal and there is nothing here to take an angle on.',
    },
    rock: {
      label: 'Behind a rock', enemy: { x: 0, y: -1.9 },
      scene: {
        bounds: { x: [-11, 11], y: [-11, 11] },
        solids: [box([-1.5, -1.5, 0], [1.5, 1.5, 2.3], { label: 'rock', role: 'rock' })],
      },
      note: 'More than one normal. A freestanding rock has a maximiser on either side of it.',
    },
    opening: {
      label: 'Behind an opening', enemy: { x: 0.55, y: -2.4 },
      scene: {
        bounds: { x: [-12, 12], y: [-11, 12] },
        solids: [
          box([-FAR, -0.6, 0], [-1.25, 0.6, 3.2], { label: 'wall' }),
          box([1.25, -0.6, 0], [FAR, 0.6, 3.2], { label: 'wall' }),
        ],
      },
      note: 'The dashed curve is flat, because the wall never stops him moving. Only his sight is clipped, so only the solid curve has a maximum. This is where the single word "normal" turns out to be doing two jobs.',
    },
  };
  let key = 'wall';
  let angle = 0;

  const mapCanvas = el('canvas');
  const plotCanvas = el('canvas');
  const noteEl = el('p.fig-cap');
  const normalRead = readout('Normals found', { swatch: 'green' });
  const offRead = readout('Your angle off the nearest normal', { swatch: 'blue' });
  const openRead = readout('Apparent surface vs a free dome', { swatch: 'yellow' });

  const wrap = el('div.stack',
    segmented({
      value: key,
      options: Object.entries(scenes).map(([k, v]) => ({ value: k, label: v.label })),
      onchange: (v) => { key = v; recompute(); },
    }),
    el('div.map-wrap',
      el('div.scope',
        el('div.scope-head', el('span', 'The Positioning Rose'), el('b', 'drag to move')),
        el('div', mapCanvas),
      ),
      el('div.map-hint', 'drag anywhere to move yourself'),
    ),
    el('div.readouts', normalRead, offRead, openRead),
    el('div.scope',
      el('div.scope-head', el('span', 'The rose, unrolled'), el('b', 'apparent surface vs bearing')),
      el('div', plotCanvas),
    ),
    noteEl,
  );
  mount.appendChild(wrap);

  let cur, rose, viewer;
  const map = createTopDown(mapCanvas, {
    maxHeight: 380, dragAnywhere: true, dragEnemy: false,
    onDrag: (who, x, y) => {
      const q = clampToScene(cur.scene, x, y, p);
      viewer = q; draw();
    },
  });

  const take = latest();
  function recompute() {
    cur = scenes[key];
    rose = null;
    noteEl.innerHTML = `<b>${cur.label}.</b> ${cur.note}`;
    viewer = { x: cur.enemy.x, y: cur.enemy.y + 8.5 };
    draw();
    take(requestRose(cur.scene, cur.enemy, p, { n: 120, radius: 9 }), (r) => {
      rose = r;
      const b = (r.normals[0] ?? 90) * DEG;
      viewer = { x: cur.enemy.x + Math.cos(b) * 8.5, y: cur.enemy.y + Math.sin(b) * 8.5 };
      draw();
    });
  }

  function draw() {
    const yaw = Math.atan2(cur.enemy.y - viewer.y, cur.enemy.x - viewer.x);
    const foe = { ...cur.enemy, yaw: yaw + Math.PI };
    const dome = buildDome(cur.scene, foe, p);
    const bear = bearing(cur.enemy, viewer);
    if (!rose) {
      map.render({
        scene: cur.scene, bounds: cur.scene.bounds,
        enemy: cur.enemy, viewer, enemyYaw: foe.yaw, viewerYaw: yaw,
        enemyDome: dome, layers: { enemyDome: true, sight: true },
      });
      normalRead.set('solving…'); offRead.set('…'); openRead.set('…');
      return;
    }
    const off = angleOffNormal(bear, rose.normals);

    map.render({
      scene: cur.scene, bounds: cur.scene.bounds,
      enemy: cur.enemy, viewer, enemyYaw: foe.yaw, viewerYaw: yaw,
      enemyDome: dome, rose, showShapeRose: true,
      layers: { rose: !!rose, normals: !!rose, enemyDome: true, sight: true },
    });

    normalRead.set(rose.flat ? 'every direction' : rose.normals.map((n) => `${n.toFixed(0)}°`).join(', '));
    offRead.set(rose.flat ? 'undefined' : fmt.deg(off.off));
    const idx = Math.round(((bear + 360) % 360) / 360 * rose.n) % rose.n;
    openRead.set(`${(rose.openness[idx] * 100).toFixed(0)}`, '%');

    const seriesA = [], seriesB = [];
    for (let i = 0; i < rose.n; i++) {
      const deg = wrapDeg((i / rose.n) * 360);
      seriesA.push([deg, rose.openness[i] * 100]);
      seriesB.push([deg, rose.shapeOpenness[i] * 100]);
    }
    seriesA.sort((a, b2) => a[0] - b2[0]);
    seriesB.sort((a, b2) => a[0] - b2[0]);

    drawPlot(plotCanvas, {
      height: 176,
      xMin: -180, xMax: 180, yMin: 0, yMax: 108,
      xTicks: angleTicks(45),
      yTicks: [0, 25, 50, 75, 100].map((v) => ({ v, label: `${v}%` })),
      bands: rose.flat ? [] : rose.arcs.map((a) => ({
        from: a.deg - a.width / 2, to: a.deg + a.width / 2, color: alpha(C.greenLit, 0.2),
      })),
      series: [
        { data: seriesB, color: alpha(C.blueLit, 0.75), style: 'line', width: 1.2, dash: [4, 3] },
        { data: seriesA, color: C.yellowLit, style: 'area', width: 1.8, fill: alpha(C.yellowLit, 0.12) },
      ],
      markers: [{ x: bear > 180 ? bear - 360 : bear, color: C.blueLit, label: 'you', width: 1.5 }],
      legend: [
        { label: 'what you can see', color: C.yellowLit },
        { label: 'reachable set alone', color: alpha(C.blueLit, 0.75), dash: [4, 3] },
      ],
      xLabel: 'bearing from the enemy',
      yLabel: 'of a free dome',
    });
  }
  recompute();
  window.addEventListener('resize', draw);
}

// ══════════════════════════════════════════════ model & empty domes ══════
export function domes(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 168, bufH: 116 };
  const scene = {
    bounds: { x: [-12, 12], y: [-3, 14] },
    solids: [box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'infinite wall' })],
  };
  let enemy = { x: 0, y: 0.32 };
  let viewer = { x: 4.6, y: 6.8 };

  const scopeA = el('canvas'), scopeB = el('canvas');
  const mapCanvas = el('canvas');
  const pair = makePair(p.bufW, p.bufH);
  const mModel = readout('Model-dome', { swatch: 'orange' });
  const mEmpty = readout('Empty-dome', { swatch: 'yellow' });
  const tModel = readout('Model-dome', { swatch: 'orange' });
  const tEmpty = readout('Empty-dome', { swatch: 'yellow' });

  const wrap = el('div.stack',
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' } },
      el('div.stack',
        el('div.scope',
          el('div.scope-head', el('span', 'What you see'), el('b', 'of him')),
          el('div', scopeA),
        ),
        el('div.readouts', mModel, mEmpty),
      ),
      el('div.stack',
        el('div.scope',
          el('div.scope-head', el('span', 'What he sees'), el('b', 'of you')),
          el('div', scopeB),
        ),
        el('div.readouts', tModel, tEmpty),
      ),
    ),
    el('div.map-wrap',
      el('div.scope', el('div', mapCanvas)),
      el('div.map-hint', 'drag either player'),
    ),
    el('p.fig-cap', { html: '<b>Figure 10.</b> Orange is the model-dome, yellow is the empty-dome. In the guide they are two pictures. Here they are one, because they partition the apparent player-dome exactly and there is nothing left over.' }),
  );
  mount.appendChild(wrap);

  const map = createTopDown(mapCanvas, {
    maxHeight: 300,
    onDrag: (who, x, y) => {
      const q = clampToScene(scene, x, y, p);
      if (who === 'viewer') viewer = q; else enemy = q;
      draw();
    },
  });

  function draw() {
    const r = evaluateInto(pair, scene, viewer, enemy, p);
    drawScope(scopeA, r.mine.fb, r.mine.cam, { note: `${r.range.toFixed(1)} m` });
    drawScope(scopeB, r.theirs.fb, r.theirs.cam, { note: `${r.range.toFixed(1)} m` });
    mModel.set(fmt.msr(r.mine.model * 1000), 'msr');
    mEmpty.set(fmt.msr(r.mine.empty * 1000), 'msr');
    tModel.set(fmt.msr(r.theirs.model * 1000), 'msr');
    tEmpty.set(fmt.msr(r.theirs.empty * 1000), 'msr');
    map.render({
      scene, bounds: scene.bounds, enemy, viewer,
      enemyYaw: r.foe.yaw, viewerYaw: r.me.yaw,
      enemyDome: r.enemyDome, viewerDome: r.viewerDome,
      layers: { enemyDome: true, viewerDome: true, sight: true },
    });
  }
  draw();
  window.addEventListener('resize', draw);
}
