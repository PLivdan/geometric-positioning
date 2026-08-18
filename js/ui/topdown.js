/**
 * topdown.js — the map, and the Positioning Rose drawn around the enemy on it.
 *
 * The rose is the shape of the answer. For every bearing you could stand at,
 * it plots how much of the enemy's player-dome would be on your monitor from
 * there, as a fraction of what it would be with nothing in the world. The
 * green arcs are the maximisers — the paper's **normals**. Your own bearing is
 * the blue radial, and the gap between it and the nearest green arc is
 * literally "the angle you have taken".
 *
 * Drawn concentric with the enemy, so the map and the quality of every
 * position on it are one object rather than two charts to correlate by eye.
 */

import { C, alpha, fitCanvas, MONO, UI, advantageColor } from './palette.js';
import { RAD, DEG, wrapDeg } from '../core/geom.js';

export function createTopDown(canvas, opts = {}) {
  const state = { view: null, drag: null, hover: null };
  let tf = null;

  function transform(bounds, w, h) {
    const [x0, x1] = bounds.x, [y0, y1] = bounds.y;
    const s = Math.min(w / (x1 - x0), h / (y1 - y0));
    const ox = (w - (x1 - x0) * s) / 2 - x0 * s;
    const oy = (h + (y1 - y0) * s) / 2 + y0 * s;
    return {
      s,
      X: (x) => x * s + ox,
      Y: (y) => oy - y * s,
      inv: (px, py) => ({ x: (px - ox) / s, y: (oy - py) / s }),
    };
  }

  /**
   * What the map should actually show.
   *
   * A scenario declares generous bounds so the solver has somewhere to put
   * things, and the map was drawing all of it. That left the two players
   * huddled in a corner of a mostly empty field, worst where a scene is
   * declared far larger than the fight inside it.
   *
   * The frame is taken from what is in play instead: both players, the
   * ground each can reach, and any probe or zone the scenario marks. Solids
   * deliberately do not widen it, or a wall that runs to the horizon would
   * pull the frame back out to the horizon. They are simply cropped, which
   * is what a wall running past the edge of a diagram should do.
   */
  function framedBounds(view) {
    const outer = view.bounds ?? view.scene.bounds;
    if (!view.viewer || !view.enemy) return outer;
    const reach = (view.enemyDome?.rMax ?? 1.8) + 1.2;
    const xs = [view.viewer.x, view.enemy.x], ys = [view.viewer.y, view.enemy.y];
    for (const p of view.probes ?? []) { xs.push(p.x); ys.push(p.y); }
    for (const z of view.scenario?.zones ?? []) {
      if (z.x && z.y) { xs.push(z.x[0], z.x[1]); ys.push(z.y[0], z.y[1]); }
    }
    let x0 = Math.min(...xs) - reach, x1 = Math.max(...xs) + reach;
    let y0 = Math.min(...ys) - reach, y1 = Math.max(...ys) + reach;
    // A little air, and a floor so a close pair does not fill the frame.
    const padX = Math.max((x1 - x0) * 0.18, 1.5), padY = Math.max((y1 - y0) * 0.18, 1.5);
    x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
    const MIN = 9;
    if (x1 - x0 < MIN) { const c = (x0 + x1) / 2; x0 = c - MIN / 2; x1 = c + MIN / 2; }
    if (y1 - y0 < MIN) { const c = (y0 + y1) / 2; y0 = c - MIN / 2; y1 = c + MIN / 2; }
    return {
      x: [Math.max(outer.x[0], x0), Math.min(outer.x[1], x1)],
      y: [Math.max(outer.y[0], y0), Math.min(outer.y[1], y1)],
    };
  }

  // ─────────────────────────────────────────────────────────── drawing ──
  function render(view) {
    state.view = view;
    if (!view) return;
    const cssW = canvas.parentElement.clientWidth || 520;
    const bounds = opts.fitScene ? (view.bounds ?? view.scene.bounds) : framedBounds(view);
    const ar = (bounds.y[1] - bounds.y[0]) / (bounds.x[1] - bounds.x[0]);
    const cssH = Math.round(Math.min(Math.max(cssW * ar, 240), opts.maxHeight ?? 640));
    const { ctx, w, h } = fitCanvas(canvas, cssW, cssH);
    tf = transform(bounds, w, h);
    const L = view.layers ?? {};

    ctx.fillStyle = C.scope;
    ctx.fillRect(0, 0, w, h);

    if (L.field && view.field) drawField(ctx, view.field, tf);
    if (L.visibility && view.visibility) drawVisibility(ctx, view, tf, w, h);
    drawGrid(ctx, bounds, tf, w, h);
    drawSolids(ctx, view.scene.solids, tf);
    if (L.zones && view.scenario?.zones) drawZones(ctx, view.scenario.zones, tf);

    if (L.rose && view.rose) drawRose(ctx, view, tf);
    if (L.enemyDome && view.enemyDome) drawDomeCells(ctx, view.enemyDome, tf, C.redLit, 0.2);
    if (L.viewerDome && view.viewerDome) drawDomeCells(ctx, view.viewerDome, tf, C.blueLit, 0.18);
    if (L.sight) drawSightline(ctx, view, tf);
    if (L.normals && view.rose && !view.rose.flat) drawNormals(ctx, view, tf);
    if (L.freeDirs && view.freeDirs) drawFreeDirs(ctx, view, tf);
    if (L.probes && view.probes) drawProbes(ctx, view, tf);
    if (L.best && view.best) drawBest(ctx, view.best, tf);

    drawActor(ctx, view.enemy, tf, C.redLit, 'ENEMY', view.enemyYaw);
    drawActor(ctx, view.viewer, tf, C.blueLit, 'YOU', view.viewerYaw);

    drawScale(ctx, tf, w, h);
  }

  function drawGrid(ctx, bounds, t, w, h) {
    ctx.strokeStyle = alpha('#ffffff', 0.045);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = t.s < 12 ? 5 : 2;
    for (let x = Math.ceil(bounds.x[0] / step) * step; x <= bounds.x[1]; x += step) {
      ctx.moveTo(t.X(x), 0); ctx.lineTo(t.X(x), h);
    }
    for (let y = Math.ceil(bounds.y[0] / step) * step; y <= bounds.y[1]; y += step) {
      ctx.moveTo(0, t.Y(y)); ctx.lineTo(w, t.Y(y));
    }
    ctx.stroke();
  }

  function drawSolids(ctx, solids, t) {
    for (const s of solids) {
      const x = t.X(s.min.x), y = t.Y(s.max.y);
      const ww = (s.max.x - s.min.x) * t.s, hh = (s.max.y - s.min.y) * t.s;
      const tall = s.max.z > 1.5;
      ctx.fillStyle = tall ? alpha('#7d8a92', 0.4) : alpha('#7d8a92', 0.26);
      ctx.fillRect(x, y, ww, hh);
      // hatching reads as "solid" without needing a key
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, ww, hh); ctx.clip();
      ctx.strokeStyle = alpha('#aebac1', 0.22); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let d = -hh; d < ww + hh; d += 7) { ctx.moveTo(x + d, y); ctx.lineTo(x + d + hh, y + hh); }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = alpha('#c3cdd2', 0.55); ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1);
      if (s.label && ww > 54 && hh > 16) {
        ctx.font = MONO(9.5, 500);
        ctx.fillStyle = alpha('#c3cdd2', 0.72);
        ctx.textBaseline = 'top';
        ctx.fillText(s.label.toUpperCase(), x + 5, y + 4);
      }
    }
  }

  function drawZones(ctx, zones, t) {
    ctx.font = MONO(11, 600);
    for (const z of zones) {
      ctx.strokeStyle = alpha(C.greenLit, 0.4);
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.strokeRect(t.X(z.x[0]), t.Y(z.y[1]), (z.x[1] - z.x[0]) * t.s, (z.y[1] - z.y[0]) * t.s);
      ctx.setLineDash([]);
      ctx.fillStyle = alpha(C.greenLit, 0.75);
      ctx.textBaseline = 'top';
      ctx.fillText(z.id, t.X(z.x[0]) + 5, t.Y(z.y[1]) + 4);
    }
  }

  /** The reachable cells of a player-dome, as the paper's clipped disk. */
  function drawDomeCells(ctx, dome, t, color, a) {
    const c = dome.cell * t.s;
    ctx.fillStyle = alpha(color, a);
    for (let j = 0; j < dome.K; j++) {
      for (let i = 0; i < dome.K; i++) {
        if (!dome.reach[j * dome.K + i]) continue;
        const x = dome.cx - dome.rMax + i * dome.cell;
        const y = dome.cy - dome.rMax + (j + 1) * dome.cell;
        ctx.fillRect(t.X(x), t.Y(y), c + 0.6, c + 0.6);
      }
    }
    ctx.strokeStyle = alpha(color, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(t.X(dome.cx), t.Y(dome.cy), dome.rMax * t.s, 0, Math.PI * 2);
    ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
  }

  // ───────────────────────────────────────────────────── the rose ──────
  function roseRadius(dome, openness) {
    const inner = dome ? dome.rMax * 1.30 : 2.2;
    const span = dome ? dome.rMax * 1.55 : 2.6;
    return inner + openness * span;
  }

  function drawRose(ctx, view, t) {
    const rose = view.rose, dome = view.enemyDome;
    const cx = t.X(view.enemy.x), cy = t.Y(view.enemy.y);
    const R = (o) => roseRadius(dome, o) * t.s;

    // reference circle at openness = 1 (the free dome of Figure 3)
    ctx.strokeStyle = alpha('#ffffff', 0.16);
    ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R(1), 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    const pt = (i, arr) => {
      const a = (i / rose.n) * Math.PI * 2;
      const r = R(arr[i]);
      return [cx + Math.cos(a) * r, cy - Math.sin(a) * r];
    };

    // the shape-only curve, as a quiet inner trace
    if (view.showShapeRose && rose.shapeOpenness) {
      ctx.beginPath();
      for (let i = 0; i <= rose.n; i++) {
        const [x, y] = pt(i % rose.n, rose.shapeOpenness);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = alpha(C.blueLit, 0.5);
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }

    // the sight curve — the one the normals come from
    ctx.beginPath();
    for (let i = 0; i <= rose.n; i++) {
      const [x, y] = pt(i % rose.n, rose.openness);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    const grad = ctx.createRadialGradient(cx, cy, R(0) * 0.6, cx, cy, R(1.05));
    grad.addColorStop(0, alpha(C.yellowLit, 0.02));
    grad.addColorStop(1, alpha(C.yellowLit, 0.17));
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = alpha(C.yellowLit, 0.8); ctx.lineWidth = 1.4; ctx.stroke();

    // Bearings you could not actually stand at are drawn hollow: the curve is
    // still measured there, but it is not a place you can take an angle from.
    if (rose.blocked) {
      ctx.strokeStyle = alpha(C.greyLit, 0.9); ctx.lineWidth = 2.4;
      for (let i = 0; i < rose.n; i++) {
        if (!rose.blocked[i]) continue;
        const j = (i + 1) % rose.n;
        if (!rose.blocked[j]) continue;
        const [x0, y0] = pt(i, rose.openness), [x1, y1] = pt(j, rose.openness);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }

    // the maximising arcs: the normals, drawn as arcs because that is what
    // they are — a set of directions, not always a single ray
    if (!rose.flat) {
      ctx.strokeStyle = C.greenLit; ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      for (const arc of rose.arcs) {
        ctx.beginPath();
        arc.idx.forEach((i, k) => {
          const [x, y] = pt(i, rose.openness);
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    } else {
      ctx.strokeStyle = alpha(C.greenLit, 0.7); ctx.lineWidth = 2.4;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(cx, cy, R(rose.max), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = MONO(10, 500);
      ctx.fillStyle = alpha(C.greenLit, 0.9);
      ctx.textAlign = 'center';
      ctx.fillText('EVERY DIRECTION IS A NORMAL', cx, cy - R(rose.max) - 8);
      ctx.textAlign = 'left';
    }

    // your bearing
    const b = Math.atan2(view.viewer.y - view.enemy.y, view.viewer.x - view.enemy.x);
    const idx = Math.round(((b + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * rose.n) % rose.n;
    const rr = R(rose.openness[idx]);
    ctx.strokeStyle = C.blueLit; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(b) * rr, cy - Math.sin(b) * rr);
    ctx.stroke();
    ctx.fillStyle = C.blueLit;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(b) * rr, cy - Math.sin(b) * rr, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawNormals(ctx, view, t) {
    const cx = t.X(view.enemy.x), cy = t.Y(view.enemy.y);
    const len = (view.enemyDome ? view.enemyDome.rMax : 2) * 3.4 * t.s;
    ctx.font = MONO(10, 600);
    for (const nd of view.rose.normals) {
      const a = nd * DEG;
      ctx.strokeStyle = alpha(C.greenLit, 0.85);
      ctx.lineWidth = 1.3; ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy - Math.sin(a) * len);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.greenLit;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', cx + Math.cos(a) * (len + 11), cy - Math.sin(a) * (len + 11));
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /** The eight keys, red as in Figure 2; blocked ones stop short. */
  function drawFreeDirs(ctx, view, t) {
    const { dirs } = view.freeDirs;
    const cx = t.X(view.enemy.x), cy = t.Y(view.enemy.y);
    for (const d of dirs) {
      const L = d.reach * t.s;
      const T = d.travel * t.s;
      ctx.strokeStyle = alpha(C.redLit, 0.22);
      ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + d.dir.x * L, cy - d.dir.y * L); ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = d.free ? C.redLit : alpha(C.redLit, 0.35);
      ctx.lineWidth = d.free ? 2 : 1.4;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + d.dir.x * T, cy - d.dir.y * T); ctx.stroke();

      const ex = cx + d.dir.x * T, ey = cy - d.dir.y * T;
      ctx.fillStyle = d.free ? C.redLit : C.scope;
      ctx.strokeStyle = C.redLit; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(ex, ey, d.free ? 2.6 : 2.2, 0, Math.PI * 2);
      d.free ? ctx.fill() : ctx.stroke();
    }
  }

  function drawSightline(ctx, view, t) {
    ctx.strokeStyle = alpha('#ffffff', 0.28);
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(t.X(view.viewer.x), t.Y(view.viewer.y));
    ctx.lineTo(t.X(view.enemy.x), t.Y(view.enemy.y));
    ctx.stroke(); ctx.setLineDash([]);
  }

  function drawField(ctx, field, t) {
    const { nx, ny, bounds, score, mask } = field;
    const [x0] = bounds.x, [y0] = bounds.y;
    const img = ctx.createImageData(nx, ny);
    const lo = field.range?.lo ?? -1, hi = field.range?.hi ?? 1;
    const span = Math.max(1e-6, Math.max(Math.abs(lo), Math.abs(hi)));
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        // image rows run downward; world rows run upward
        const o = ((ny - 1 - j) * nx + i) * 4;
        if (!mask[k] || Number.isNaN(score[k])) {
          img.data[o] = 12; img.data[o + 1] = 18; img.data[o + 2] = 21; img.data[o + 3] = 255;
          continue;
        }
        const [r, g, b] = advantageColor(score[k] / span);
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 235;
      }
    }
    const off = document.createElement('canvas');
    off.width = nx; off.height = ny;
    off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, t.X(x0), t.Y(y0 + ny * field.dy), nx * field.dx * t.s, ny * field.dy * t.s);
  }

  function drawVisibility(ctx, view, t, w, h) {
    const v = view.visibility;
    if (v.gain) {
      // Figure 23's purple: what one step around the corner reveals
      const { nx, ny, bounds, cellArea } = v.grid;
      const img = ctx.createImageData(nx, ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i, o = ((ny - 1 - j) * nx + i) * 4;
          if (v.gain[k]) { img.data[o] = 169; img.data[o + 1] = 126; img.data[o + 2] = 240; img.data[o + 3] = 210; }
          else if (v.base[k]) { img.data[o] = 236; img.data[o + 1] = 201; img.data[o + 2] = 58; img.data[o + 3] = 34; }
        }
      }
      const off = document.createElement('canvas');
      off.width = nx; off.height = ny;
      off.getContext('2d').putImageData(img, 0, 0);
      const dx = (bounds.x[1] - bounds.x[0]) / nx, dy = (bounds.y[1] - bounds.y[0]) / ny;
      ctx.drawImage(off, t.X(bounds.x[0]), t.Y(bounds.y[0] + ny * dy), nx * dx * t.s, ny * dy * t.s);
    } else if (v.polygon) {
      ctx.beginPath();
      v.polygon.forEach((p, i) => (i ? ctx.lineTo(t.X(p.x), t.Y(p.y)) : ctx.moveTo(t.X(p.x), t.Y(p.y))));
      ctx.closePath();
      ctx.fillStyle = alpha(C.yellowLit, 0.09);
      ctx.fill();
    }
  }

  function drawProbes(ctx, view, t) {
    ctx.font = MONO(9.5, 500);
    for (const p of view.probes) {
      const x = t.X(p.x), y = t.Y(p.y);
      const on = view.activeProbe === p.label;
      ctx.strokeStyle = on ? C.blueLit : alpha('#ffffff', 0.4);
      ctx.fillStyle = on ? alpha(C.blueLit, 0.3) : 'transparent';
      ctx.lineWidth = on ? 2 : 1;
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = on ? C.scopeInk : alpha(C.scopeInk2, 0.85);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.label, x, y - 8);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function drawBest(ctx, best, t) {
    ctx.font = MONO(9.5, 600);
    best.forEach((b, i) => {
      const x = t.X(b.x), y = t.Y(b.y);
      ctx.strokeStyle = C.greenLit; ctx.lineWidth = i === 0 ? 2 : 1.2;
      ctx.setLineDash(i === 0 ? [] : [3, 3]);
      ctx.beginPath(); ctx.arc(x, y, 8 - i, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (i === 0) {
        ctx.fillStyle = C.greenLit;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('BEST', x, y + 11);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    });
  }

  function drawActor(ctx, a, t, color, label, yaw) {
    const x = t.X(a.x), y = t.Y(a.y);
    if (yaw !== undefined && yaw !== null) {
      ctx.strokeStyle = alpha(color, 0.9); ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(yaw) * 15, y - Math.sin(yaw) * 15);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = C.scope; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.font = MONO(9.5, 600);
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(label, x, y + 9);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function drawScale(ctx, t, w, h) {
    const metres = t.s < 10 ? 5 : 2;
    const px = metres * t.s;
    const x = w - px - 14, y = h - 14;
    ctx.strokeStyle = alpha(C.scopeInk2, 0.8); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.font = MONO(9.5, 500);
    ctx.fillStyle = alpha(C.scopeInk2, 0.9);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${metres} m`, x + px / 2, y - 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // ──────────────────────────────────────────────────── interaction ────
  function pick(px, py) {
    if (!state.view || !tf) return null;
    const v = state.view;
    const cands = [];
    if (opts.draggable !== false) {
      cands.push({ who: 'viewer', x: v.viewer.x, y: v.viewer.y });
      if (opts.dragEnemy !== false) cands.push({ who: 'enemy', x: v.enemy.x, y: v.enemy.y });
    }
    let best = null, bestD = 20;
    for (const c of cands) {
      const d = Math.hypot(tf.X(c.x) - px, tf.Y(c.y) - py);
      if (d < bestD) { bestD = d; best = c.who; }
    }
    return best;
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (opts.draggable === false) return;
    const { px, py } = local(e);
    const who = pick(px, py) ?? (opts.dragAnywhere ? 'viewer' : null);
    if (!who) return;
    state.drag = who;
    canvas.setPointerCapture(e.pointerId);
    const p = tf.inv(px, py);
    opts.onDrag?.(who, p.x, p.y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const { px, py } = local(e);
    if (state.drag) {
      const p = tf.inv(px, py);
      opts.onDrag?.(state.drag, p.x, p.y);
      e.preventDefault();
    } else if (opts.draggable !== false) {
      canvas.style.cursor = pick(px, py) ? 'grab' : (opts.dragAnywhere ? 'crosshair' : 'default');
    }
  });
  const end = () => { state.drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);

  return {
    render,
    toWorld: (px, py) => tf?.inv(px, py),
    get transform() { return tf; },
  };
}
