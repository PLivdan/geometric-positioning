/**
 * concepts.js — the player-facing figures.
 *
 * These run in order and share one situation: Red standing near a wall with
 * Blue looking at him. The wall arrives, the angle changes, the corner
 * appears, the distance changes, the camera swaps. Nothing here is a fresh
 * scenario, so a reader follows one experiment getting richer rather than
 * collecting six unrelated definitions.
 */

import { el, slider, segmented, rafLoop, fmt } from '../ui/dom.js';
import { onResize, manage, dropCanvas } from '../ui/lifecycle.js';
import { C, alpha, fitCanvas, MONO, UI } from '../ui/palette.js';
import { drawPlot, angleTicks } from '../ui/plot.js';
import { drawScope } from '../ui/scope.js';
import { fitFine } from '../ui/engine.js';
import { createTopDown } from '../ui/topdown.js';
import { figure, sideBySide } from './figure.js';
import { gauge } from '../ui/teach.js';
import { requestRose, latest } from '../ui/solverClient.js';
import { DEFAULT_PARAMS, diskRadius, diskAxes } from '../core/params.js';
import { buildDome, freeDirections, freeDirectionSweep, DIR_NAMES } from '../core/dome.js';
import { bearing, angleOffNormal } from '../core/normals.js';
import { apparentDome, makeFramebuffer, look } from '../core/solver.js';
import { box, wrapDeg, DEG } from '../core/geom.js';

const FAR = 40;

/** The one situation the first half of the site keeps returning to. */
const wall = () => ({
  bounds: { x: [-13, 13], y: [-3, 15] },
  solids: [box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'wall', role: 'wall' })],
});
const openGround = () => ({ bounds: { x: [-13, 13], y: [-3, 15] }, solids: [] });

// ═══════════════════════════════════════════════════════════ hero ════════
/**
 * Blue orbits Red, who is pinned against a wall, and the room Red has to move
 * in visibly collapses. No terminology and no units: the point is only that
 * the same two players at the same distance are not in the same fight.
 */
export function hero(mount) {
  // The masthead scope is drawn about 830 CSS pixels wide, so 320 was being
  // enlarged more than five times. This loop pauses when it scrolls out of
  // view, so the extra cost is confined to the first screen.
  const p = { ...DEFAULT_PARAMS, bufW: 600, bufH: 300, domeGrid: 55, fov: 74 };
  const scene = wall();
  const enemy = { x: 0, y: 0.32 };
  const R = 7.2;
  const probe = makeFramebuffer(p.bufW, p.bufH);

  const scopeCanvas = el('canvas');
  const bigVal = el('span', '2.00');
  const angleVal = el('b', '0°');

  const node = el('div.scope.hero-scope',
    el('div.scope-head',
      el('span', 'Looking at an enemy standing against a wall'),
      el('b', ['viewing angle ', angleVal]),
    ),
    el('div', { style: { position: 'relative' } },
      scopeCanvas,
      el('div.hero-gauge',
        el('div.hero-num', bigVal, el('i', '×')),
        el('div.hero-lbl',
          el('div', 'the room the enemy has to move in,'),
          el('div', 'compared with the side-on view'),
        ),
      ),
    ),
    el('div.scope-foot',
      el('span', [el('i.swatch.sw-orange'), ' the enemy, and what you can hit']),
      el('span', [el('i.swatch.sw-yellow'), ' where they can move instead']),
    ),
  );
  mount.appendChild(node);

  const at = (theta) => {
    const b = (90 + theta) * DEG;
    return { x: enemy.x + Math.cos(b) * R, y: enemy.y + Math.sin(b) * R };
  };
  const sideRef = apparentDome(at(90), enemy, buildDome(scene, { ...enemy, yaw: 90 * DEG }, p), p, probe);

  rafLoop(node, (t) => {
    const u = (Math.sin(t * 0.45) + 1) / 2;
    const theta = ((1 - Math.cos(u * Math.PI)) / 2) * 90;
    const viewer = at(theta);
    const yaw = Math.atan2(enemy.y - viewer.y, enemy.x - viewer.x);
    const foe = { ...enemy, yaw: yaw + Math.PI };
    const dome = buildDome(scene, foe, p);
    const seen = look(scene, { ...viewer, yaw }, foe, dome, p, { drawWorld: true });
    drawScope(scopeCanvas, seen.fb, seen.cam, { contacts: seen.contacts });
    bigVal.textContent = (sideRef > 0 ? apparentDome(viewer, enemy, dome, p, probe) / sideRef : 0).toFixed(2);
    angleVal.textContent = `${theta.toFixed(0)}°`;
  });
}

// ═════════════════════════════════════════════ 1. recognition ════════════
/** Two duels at identical range. Same models, same distance, different fight. */
export function recognition(mount) {
  const params = { bufW: 156, bufH: 108, domeGrid: 33 };
  const rangeA = el('b', { class: 'mono' }, '…');
  const rangeB = el('b', { class: 'mono' }, '…');

  // Both start at the same range on purpose: the claim the section makes is
  // that these are identical fights by every measure except the geometry, so
  // the range is displayed live rather than asserted in prose.
  const openFig = figure({
    scene: openGround(), you: { x: 0, y: 8.4 }, enemy: { x: 0, y: 0.9 },
    params, mapHeight: 200, gauges: false, fineWidth: 300,
    layers: { enemyDome: true, viewerDome: true },
    onChange: (r) => { rangeA.textContent = `${r.range.toFixed(1)} m apart`; },
  });
  const wallFig = figure({
    scene: wall(), you: { x: -5.30, y: 5.62 }, enemy: { x: 0, y: 0.32 },
    params, mapHeight: 200, gauges: false, fineWidth: 300,
    layers: { enemyDome: true, viewerDome: true },
    onChange: (r) => { rangeB.textContent = `${r.range.toFixed(1)} m apart`; },
  });

  const pane = (title, sub, fig, range) => el('div.stack',
    el('div.panel', el('div.panel-head', el('span', title), range)),
    fig.node,
    el('p', { class: 'dim', style: { fontSize: 'var(--step--1)', margin: 0 } }, sub),
  );

  mount.appendChild(sideBySide(
    pane('Red in the open', 'Every direction is available to them, so Blue has to cover all of them.', openFig, rangeA),
    pane('Red against a wall', 'Half of those directions end in a wall, and Blue is holding an easier shot.', wallFig, rangeB),
  ));
  openFig.render();
  wallFig.render();
}

// ═══════════════════════════════════════ 2. reachable space ══════════════
/** Show the region, then name it. */
export function reach(mount) {
  const fig = figure({
    scene: wall(), you: { x: 0, y: 8.4 }, enemy: { x: 0, y: 0.32 },
    mapHeight: 330, gauges: false,
    layers: { enemyDome: true, viewerDome: true },
    onChange: (r) => {
      clipRead.textContent = `${(r.enemyDome.clipRatio * 100).toFixed(0)}% of unblocked`;
      rRead.textContent = `${diskRadius(fig.params).toFixed(2)} m`;
    },
  });
  const rRead = el('span.val'), clipRead = el('span.val');
  const p = fig.params;

  mount.appendChild(el('div.stack',
    fig.node,
    el('div.readouts',
      el('div.readout', el('span.lbl', el('i.swatch.sw-red'), 'What the wall leaves Red'), clipRead),
      el('div.readout', el('span.lbl', el('i.swatch.sw-blue'), 'Radius of an unblocked one'), rRead),
    ),
    el('div.panel', el('div.panel-body',
      el('div.controls',
        slider({
          label: 'Movement speed', min: 3, max: 9, step: 0.1, value: p.speed,
          format: (v) => `${v.toFixed(1)} m/s`,
          hint: 'about 5.5 m/s in Overwatch, faster in Quake',
          oninput: (v) => { p.speed = v; fig.render(); },
        }),
        slider({
          label: 'Movement window', min: 0.1, max: 0.8, step: 0.01, value: p.dt,
          format: (v) => `${(v * 1000).toFixed(0)} ms`,
          hint: 'roughly 300 ms is a useful reference interval',
          oninput: (v) => { p.dt = v; fig.render(); },
        }),
      ),
    )),
  ));
  fig.render();
}

// ═══════════════════════════════ 1b. where the shape comes from ═══════════
/**
 * The reachable region, built in front of you out of key presses.
 *
 * Everywhere else on this page the region simply appears, already the right
 * shape, and the reader is asked to accept it. This runs the movement in slow
 * motion instead: hold a key for some part of the window, and you finish
 * somewhere. Do that from every direction and for every fraction of the
 * window, and the marks fill in the region the rest of the site draws.
 *
 * Two things it is meant to make obvious. The edge is where you get to by
 * holding a key for the whole window, so the region is a boundary and not a
 * blur. And the interior is reachable because you can let go early, which is
 * why it is filled rather than eight spokes.
 *
 * The boundary comes from the same expression the solver uses, so this is the
 * shape being measured elsewhere rather than an illustration of it.
 */
export function keysToDome(mount) {
  const p = { ...DEFAULT_PARAMS, strafeRatio: 0.78, backRatio: 0.86 };
  const canvas = el('canvas');
  const readSpeed = el('span.val'), readShape = el('span.val'), readCount = el('span.val');

  // Distance reachable along a heading measured from forward, in the player's
  // own frame. Identical to the test buildDome applies per cell.
  const reach = (phi) => {
    const ax = diskAxes(p);
    const cu = Math.cos(phi), cw = Math.sin(phi);
    const ru = cu >= 0 ? ax.fwd : ax.back;
    return 1 / Math.hypot(cu / ru, cw / ax.side);
  };

  const DIR_PHI = DIR_NAMES.map((_, i) => (i * Math.PI) / 4);
  let marks = [], runners = [], phase = 0, settled = 0;

  function resetRun() { marks = []; runners = []; phase = 0; settled = 0; }

  mount.appendChild(el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', 'One player, from above, at a tenth of speed'), el('b', 'the window runs over and over')),
      el('div', canvas),
    ),
    el('div.readouts',
      el('div.readout', el('span.lbl', 'Reachable in one window'), readSpeed),
      el('div.readout', el('span.lbl', 'Forward / back / sideways'), readShape),
      el('div.readout', el('span.lbl', 'Endings recorded'), readCount),
    ),
    el('div.panel', el('div.panel-body',
      el('div.controls',
        slider({
          label: 'Sideways speed, against forward', min: 0.4, max: 1, step: 0.01, value: p.strafeRatio,
          format: (v) => `${(v * 100).toFixed(0)}%`,
          hint: 'set both of these to 100% and the region is a circle',
          oninput: (v) => { p.strafeRatio = v; resetRun(); },
        }),
        slider({
          label: 'Backward speed, against forward', min: 0.4, max: 1, step: 0.01, value: p.backRatio,
          format: (v) => `${(v * 100).toFixed(0)}%`,
          oninput: (v) => { p.backRatio = v; resetRun(); },
        }),
      ),
    )),
  ));

  let last = 0;
  rafLoop(canvas, (t) => {
    const dt = Math.min(0.05, last ? t - last : 0.016);
    last = t;
    const ax = diskAxes(p);
    const R = ax.fwd;

    // ── advance the simulation ──────────────────────────────────────────
    if (phase < 1) {
      phase = Math.min(1, phase + dt * 0.16);
      // A steady trickle of runs rather than all at once, so the region is
      // visibly assembled instead of appearing.
      while (runners.length < 7 && marks.length < 1400) {
        const phi = Math.random() * Math.PI * 2;
        runners.push({ phi, hold: 0.25 + Math.random() * 0.75, u: 0 });
      }
      for (const r of runners) {
        r.u += dt * 3.1;                          // a tenth of real speed
        if (r.u >= 1) {
          marks.push({ phi: r.phi, d: reach(r.phi) * r.hold });
          r.done = true;
        }
      }
      runners = runners.filter((r) => !r.done);
    } else {
      settled += dt;
      if (settled > 2.4) resetRun();
    }

    // ── draw ────────────────────────────────────────────────────────────
    const cssW = canvas.parentElement.clientWidth || 360;
    const { ctx, w, h } = fitCanvas(canvas, cssW, Math.round(cssW * 0.52));
    const cx = w * 0.5, cy = h * 0.56;
    const scale = Math.min(w, h * 1.7) / (R * 2.9);      // px per metre

    ctx.fillStyle = C.scope;
    ctx.fillRect(0, 0, w, h);

    // a metre grid, so the numbers on the readouts have something to sit on
    ctx.strokeStyle = alpha(C.scopeInk, 0.07); ctx.lineWidth = 1;
    for (let m = -3; m <= 3; m++) {
      ctx.beginPath();
      ctx.moveTo(cx + m * scale, 0); ctx.lineTo(cx + m * scale, h);
      ctx.moveTo(0, cy + m * scale); ctx.lineTo(w, cy + m * scale);
      ctx.stroke();
    }

    // every recorded ending, which is what fills the region in
    for (const m of marks) {
      const x = cx + Math.sin(m.phi) * m.d * scale;
      const y = cy - Math.cos(m.phi) * m.d * scale;
      ctx.fillStyle = alpha(C.yellowLit, 0.5);
      ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
    }

    // the boundary the solver uses, drawn once the marks have arrived
    if (phase >= 1) {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const phi = (i / 96) * Math.PI * 2;
        const d = reach(phi) * scale;
        const x = cx + Math.sin(phi) * d, y = cy - Math.cos(phi) * d;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = alpha(C.yellowLit, 0.95); ctx.lineWidth = 1.6; ctx.stroke();
    }

    // the eight keys, each as far as holding it for the whole window gets you
    ctx.font = MONO(11, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const phi = DIR_PHI[i], d = reach(phi) * scale;
      const x = cx + Math.sin(phi) * d, y = cy - Math.cos(phi) * d;
      ctx.strokeStyle = alpha(C.scopeInk, 0.3); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      const lx = cx + Math.sin(phi) * (d + 15), ly = cy - Math.cos(phi) * (d + 15);
      ctx.fillStyle = C.scopeInk2;
      ctx.fillText(DIR_NAMES[i], lx, ly);
    }

    // runs still in flight
    for (const r of runners) {
      const d = reach(r.phi) * r.hold * r.u * scale;
      const x = cx + Math.sin(r.phi) * d, y = cy - Math.cos(r.phi) * d;
      ctx.strokeStyle = alpha(C.greenLit, 0.75); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = C.greenLit;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    }

    // the player
    ctx.fillStyle = C.redLit;
    ctx.beginPath(); ctx.arc(cx, cy, 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.font = UI(10, 600); ctx.fillStyle = C.scopeInk2;
    ctx.fillText('facing this way', cx, cy - R * scale - 34);
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * scale - 26); ctx.lineTo(cx, cy - R * scale - 14);
    ctx.strokeStyle = alpha(C.scopeInk, 0.45); ctx.lineWidth = 1.2; ctx.stroke();

    ctx.font = MONO(11, 500); ctx.textAlign = 'left';
    ctx.fillStyle = C.scopeInk2;
    ctx.fillText(`1 m grid  ·  window ${(p.dt * 1000).toFixed(0)} ms`, 10, h - 12);

    readSpeed.textContent = `${diskRadius(p).toFixed(2)} m forward`;
    readShape.textContent = `${ax.fwd.toFixed(2)} / ${ax.back.toFixed(2)} / ${ax.side.toFixed(2)} m`;
    readCount.textContent = `${marks.length}`;
  });
}

// ═════════════════════════════════════ 3. cover and free directions ══════
/** Cover, isolated to what it does to movement inputs. */
export function cover(mount) {
  const p = { ...DEFAULT_PARAMS };
  const scene = wall();
  const enemy = { x: 0, y: 0.30 };
  let theta = 65;

  const mapCanvas = el('canvas');
  const plotCanvas = el('canvas');
  const freeRead = el('span.val');
  const note = el('p', { class: 'dim', style: { fontSize: 'var(--step--1)', margin: '0.8rem 0 0' } });

  mount.appendChild(el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', "Red's movement inputs, from above"), el('b', 'solid = still works')),
      el('div', mapCanvas),
    ),
    el('div.panel', el('div.panel-body',
      slider({
        label: "Blue's viewing angle", min: -180, max: 180, step: 1, value: theta,
        format: (v) => `${v > 0 ? '+' : ''}${v}°`,
        hint: 'drag slowly through 45 and watch an input come back',
        oninput: (v) => { theta = v; draw(); },
      }),
    )),
    el('div.readouts',
      el('div.readout', el('span.lbl', el('i.swatch.sw-red'), 'Inputs that still work'), freeRead),
    ),
    el('div.scope',
      el('div.scope-head', el('span', 'Working inputs against viewing angle'), el('b', 'measured')),
      el('div', plotCanvas),
    ),
    note,
  ));

  const map = createTopDown(mapCanvas, { draggable: false, maxHeight: 290 });
  const sweep = freeDirectionSweep(scene, enemy, p, 360);

  function draw() {
    const b = (90 + theta) * DEG;
    const R = 8.5;
    const viewer = { x: enemy.x + Math.cos(b) * R, y: enemy.y + Math.sin(b) * R };
    const yaw = Math.atan2(enemy.y - viewer.y, enemy.x - viewer.x);
    const foe = { ...enemy, yaw: yaw + Math.PI };
    const fd = freeDirections(scene, foe, p);

    map.render({
      scene, bounds: scene.bounds, enemy, viewer,
      enemyYaw: foe.yaw, viewerYaw: yaw,
      enemyDome: buildDome(scene, foe, p), freeDirs: fd,
      layers: { enemyDome: true, freeDirs: true, sight: true },
    });
    freeRead.textContent = `${fd.nFree} of 8`;

    const data = [];
    for (let i = 0; i < 360; i++) data.push([wrapDeg(i - 90), sweep.counts[i]]);
    data.sort((a, b2) => a[0] - b2[0]);

    drawPlot(plotCanvas, {
      height: 168,
      xMin: -180, xMax: 180, yMin: 2.4, yMax: 5.6,
      xTicks: [-180, -135, -90, -45, 0, 45, 90, 135, 180].map((v) => ({ v, label: `${v}°` })),
      yTicks: [3, 4, 5].map((v) => ({ v, label: String(v) })),
      series: [{ data, color: C.redLit, style: 'step', width: 1.8 }],
      markers: [{ x: theta, color: C.blueLit, label: 'Blue', width: 1.6 }],
      bands: [-180, -135, -90, -45, 0, 45, 90, 135, 180].map((v) => ({
        from: v - 1.6, to: v + 1.6, color: alpha(C.greenLit, 0.16),
      })),
      xLabel: 'viewing angle',
      yLabel: 'inputs that work',
    });

    const spike = Math.abs(wrapDeg(theta) % 45) < 2 || Math.abs(Math.abs(wrapDeg(theta) % 45) - 45) < 2;
    note.textContent = spike
      ? 'Five inputs still work. Two of them run along the wall rather than into it, so they slide instead of colliding. That happens at every multiple of 45°.'
      : 'Four inputs still work. The other four run into the wall, and holding one of them costs Red speed.';
  }
  draw();
  onResize(draw);
}

// ════════════════════════════════ 4. world space vs screen space ═════════
/**
 * Red's reachable space does not change here. Only Blue's camera moves. The
 * map shows the region holding its size while the scope shows it shrinking.
 */
export function screenspace(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 200, bufH: 132, domeGrid: 41 };
  const scene = wall();
  const enemy = { x: 0, y: 0.32 };
  let theta = 0;
  const R = 8.5;
  const probe = makeFramebuffer(p.bufW, p.bufH);

  const scopeCanvas = el('canvas');
  const mapCanvas = el('canvas');
  const headAngle = el('span', '0°');
  const gWorld = gauge('Reachable space on the map', { swatch: 'red', color: 'var(--red)' });
  const gScreen = gauge("The same space on Blue's screen", { swatch: 'yellow', color: '#c9a521' });
  const note = el('p', { class: 'dim', style: { fontSize: 'var(--step--1)', margin: '0.8rem 0 0' } });

  mount.appendChild(el('div.stack',
    el('div.scope',
      el('div.scope-head', el('span', "Blue's camera"), el('b', headAngle)),
      el('div', scopeCanvas),
    ),
    el('div.map-wrap', el('div.scope', el('div', mapCanvas))),
    el('div.panel', el('div.panel-body',
      slider({
        label: 'Walk Blue around Red', min: -90, max: 90, step: 1, value: theta,
        format: (v) => `${v > 0 ? '+' : ''}${v}°`,
        hint: 'the range never changes, only the direction',
        oninput: (v) => { theta = v; draw('fast'); },
      }),
      el('div.gauge', { style: { marginTop: '0.8rem' } }, gWorld, gScreen),
      note,
    )),
  ));

  const map = createTopDown(mapCanvas, { draggable: false, maxHeight: 250 });

  // This scope is drawn several times wider than the 200 pixel buffer it was
  // always rendered into. It now redraws at the displayed width once the
  // slider settles, while the gauges keep measuring at the original size so
  // the numbers do not shift as the picture sharpens.
  let fine = null, fineFb = null, refineTimer = 0;
  function ensureFine() {
    const fit = fitFine(p, scopeCanvas, 900, fine);
    if (!fit) return fine;
    fine = fit.params;
    if (!fineFb || fineFb.W !== fine.bufW) fineFb = makeFramebuffer(fine.bufW, fine.bufH);
    return fine;
  }

  function draw(quality = 'fine') {
    const hi = quality === 'fine';
    const q = hi ? ensureFine() : null;
    clearTimeout(refineTimer);
    if (!hi) refineTimer = setTimeout(() => draw('fine'), 160);

    const b = (90 + theta) * DEG;
    const viewer = { x: enemy.x + Math.cos(b) * R, y: enemy.y + Math.sin(b) * R };
    const yaw = Math.atan2(enemy.y - viewer.y, enemy.x - viewer.x);
    const foe = { ...enemy, yaw: yaw + Math.PI };
    const dome = buildDome(scene, foe, p);
    const seen = q
      ? look(scene, { ...viewer, yaw }, foe, buildDome(scene, foe, q), q, { fb: fineFb, drawWorld: true })
      : look(scene, { ...viewer, yaw }, foe, dome, p, { drawWorld: true });
    drawScope(scopeCanvas, seen.fb, seen.cam, { note: `${R.toFixed(1)} m`, contacts: seen.contacts });
    headAngle.textContent = `${theta > 0 ? '+' : ''}${theta}°`;

    const reachable = dome.nReach * dome.cell * dome.cell;
    const unblocked = dome.nFree * dome.cell * dome.cell;
    gWorld.set(reachable, unblocked, false);
    const straight = apparentDome({ x: enemy.x, y: enemy.y + R }, enemy, dome, p, probe) * 1000;
    gScreen.set(apparentDome(viewer, enemy, dome, p, probe) * 1000, straight, false);

    map.render({
      scene, bounds: scene.bounds, enemy, viewer,
      enemyYaw: foe.yaw, viewerYaw: yaw, enemyDome: dome,
      layers: { enemyDome: true, sight: true },
    });

    note.textContent = Math.abs(theta) < 8
      ? 'Head on. Red has their widest possible spread of movement across the screen.'
      : `From ${Math.abs(theta)}° the reachable space is the same shape on the map and covers less of the screen. Nothing about Red has changed.`;
  }
  draw();
  onResize(draw, mount);
  manage(mount, {
    sharpen: () => draw(),
    release: () => {
      dropCanvas(scopeCanvas);
      dropCanvas(mapCanvas);
    },
  });
}

// ════════════════════════════════ 5. hittable area vs movement room ══════
/** The dome split in two on one picture. */
export function split(mount) {
  const fig = figure({
    scene: wall(), you: { x: -4.6, y: 6.8 }, enemy: { x: 0, y: 0.32 },
    mapHeight: 270,
    layers: { enemyDome: true, viewerDome: true },
  });
  mount.appendChild(el('div.stack',
    fig.node,
    el('p.fig-cap', 'The body is what the current camera can hit, drawn in that player\'s own colour, so Red stays red and Blue stays blue when you swap. The yellow around it is where they can move instead. Between them they fill the whole reachable space, with nothing left over.'),
  ));
  fig.render();
}

/** The tradeoff as a contrast: constrained but tiny, against exposed but free. */
export function tension(mount) {
  // A glance, not a study. The two viewports carry the whole contrast, so
  // this pair drops the map and the exact figures and keeps a letterboxed
  // view of each player.
  const params = { bufW: 200, bufH: 76, domeGrid: 33 };
  const rock = {
    bounds: { x: [-10, 10], y: [-7, 12] },
    solids: [box([-1.5, -1.5, 0], [1.5, 1.5, 1.55], { label: 'cover', role: 'rock' })],
  };
  const pinned = figure({
    scene: rock, you: { x: 0, y: 8.2 }, enemy: { x: 0, y: -1.85 },
    params, showMap: false, compactGauges: true, dragEnemy: false, fineWidth: 320,
  });
  const exposed = figure({
    scene: openGround(), you: { x: 0, y: 8.2 }, enemy: { x: 0, y: 0.9 },
    params, showMap: false, compactGauges: true, dragEnemy: false, fineWidth: 320,
  });

  // The two headers carry only a short title. A longer subtitle wraps to a
  // second line in one column and not the other, which knocks every row below
  // it out of alignment with its opposite number.
  const pane = (title, fig, note) => el('div.stack',
    el('div.panel', el('div.panel-head', el('span', title))),
    fig.node,
    el('p', { class: 'dim', style: { fontSize: 'var(--step--1)', margin: 0 } }, note),
  );
  // Open first, then cover, because that is the order the two enemies are
  // described in the prose beside it.
  mount.appendChild(sideBySide(
    pane('In the open', exposed, 'Plenty of room, and plenty to shoot at.'),
    pane('Behind cover', pinned, 'Very little room, and very little to shoot at.'),
  ));
  pinned.render();
  exposed.render();
}

// ═══════════════════════════════════════ 6. the reference direction ══════
/** The normal, introduced as a measurement rather than as advice. */
export function reference(mount) {
  const p = { ...DEFAULT_PARAMS, bufW: 132, bufH: 92 };
  const scenes = {
    wall: {
      label: 'Against a wall', enemy: { x: 0, y: 0.32 }, scene: wall(),
      note: 'One maximum, square to the wall. Walk away from it and the movement Blue has to cover falls off smoothly.',
    },
    corner: {
      label: 'In a corner', enemy: { x: 0.34, y: 0.34 },
      scene: {
        bounds: { x: [-4, 16], y: [-4, 16] },
        solids: [
          box([-2.4, -FAR, 0], [0, FAR, 3.2], { label: 'wall', role: 'wall' }),
          box([-FAR, -2.4, 0], [FAR, 0, 3.2], { label: 'wall', role: 'wall' }),
        ],
      },
      note: 'One maximum, along the diagonal that splits the corner.',
    },
    open: {
      label: 'In the open', enemy: { x: 0, y: 0 },
      scene: { bounds: { x: [-11, 11], y: [-11, 11] }, solids: [] },
      note: 'The curve is flat. Every direction is a reference direction, which is the precise way of saying there is nothing here to angle off.',
    },
    rock: {
      label: 'Behind a rock', enemy: { x: 0, y: -1.9 },
      scene: {
        bounds: { x: [-11, 11], y: [-11, 11] },
        solids: [box([-1.5, -1.5, 0], [1.5, 1.5, 2.3], { label: 'rock', role: 'rock' })],
      },
      note: 'More than one maximum. A freestanding obstacle gives a reference direction on either side of it.',
    },
  };
  let key = 'wall';

  const mapCanvas = el('canvas');
  const plotCanvas = el('canvas');
  const noteEl = el('p', { class: 'dim', style: { fontSize: 'var(--step--1)', margin: '0.8rem 0 0' } });
  const normalRead = el('span.val', 'solving…');
  const offRead = el('span.val', '…');

  mount.appendChild(el('div.stack',
    segmented({
      value: key, options: Object.entries(scenes).map(([k, v]) => ({ value: k, label: v.label })),
      onchange: (v) => { key = v; recompute(); },
    }),
    el('div.map-wrap',
      el('div.scope',
        el('div.scope-head', el('span', 'How wide Red looks from every direction'), el('b', 'drag Blue')),
        el('div', mapCanvas),
      ),
      el('div.map-hint', 'drag anywhere to move Blue'),
    ),
    el('div.readouts',
      el('div.readout', el('span.lbl', el('i.swatch.sw-green'), 'Reference direction'), normalRead),
      el('div.readout', el('span.lbl', el('i.swatch.sw-blue'), 'Blue, relative to it'), offRead),
    ),
    el('div.scope',
      el('div.scope-head', el('span', 'The same curve, unrolled'), el('b', 'apparent width vs bearing')),
      el('div', plotCanvas),
    ),
    noteEl,
  ));

  let cur, rose, viewer;
  const map = createTopDown(mapCanvas, {
    maxHeight: 350, dragAnywhere: true, dragEnemy: false,
    onDrag: (who, x, y) => {
      const b = cur.scene.bounds;
      viewer = {
        x: Math.min(Math.max(x, b.x[0] + 0.4), b.x[1] - 0.4),
        y: Math.min(Math.max(y, b.y[0] + 0.4), b.y[1] - 0.4),
      };
      draw();
    },
  });
  const take = latest();

  function recompute() {
    cur = scenes[key];
    rose = null;
    noteEl.textContent = cur.note;
    viewer = { x: cur.enemy.x, y: cur.enemy.y + 8.5 };
    normalRead.textContent = 'solving…';
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

    map.render({
      scene: cur.scene, bounds: cur.scene.bounds,
      enemy: cur.enemy, viewer, enemyYaw: foe.yaw, viewerYaw: yaw,
      enemyDome: dome, rose, showShapeRose: true,
      layers: { rose: !!rose, normals: !!rose, enemyDome: true, sight: true },
    });

    if (!rose) return;
    normalRead.textContent = rose.flat ? 'every direction' : rose.normals.map((n) => `${n.toFixed(0)}°`).join(' · ');
    const off = angleOffNormal(bear, rose.normals);
    offRead.textContent = rose.flat ? 'no reference' : `${fmt.deg(off.off)} away`;

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
      yTicks: [0, 50, 100].map((v) => ({ v, label: `${v}%` })),
      bands: rose.flat ? [] : rose.arcs.map((a) => ({
        from: a.deg - a.width / 2, to: a.deg + a.width / 2, color: alpha(C.greenLit, 0.2),
      })),
      series: [
        { data: seriesB, color: alpha(C.blueLit, 0.75), style: 'line', width: 1.2, dash: [4, 3] },
        { data: seriesA, color: C.yellowLit, style: 'area', width: 1.8, fill: alpha(C.yellowLit, 0.12) },
      ],
      markers: [{ x: bear > 180 ? bear - 360 : bear, color: C.blueLit, label: 'Blue', width: 1.5 }],
      legend: [
        { label: 'what Blue can see', color: C.yellowLit },
        { label: 'reachable space alone', color: alpha(C.blueLit, 0.75), dash: [4, 3] },
      ],
      xLabel: 'bearing from Red',
      yLabel: 'of an unblocked dome',
    });
  }
  recompute();
  onResize(draw, mount);
  manage(mount, {
    sharpen: () => draw(),
    release: () => {
      dropCanvas(mapCanvas);
      dropCanvas(plotCanvas);
    },
  });
}
