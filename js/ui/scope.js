/**
 * scope.js — the first-person viewport.
 *
 * This does not render a picture of the measurement. It renders *the*
 * measurement: the framebuffer it paints is the same tagged buffer whose
 * pixels were summed to produce the model-dome and empty-dome figures. Orange
 * is what you can hit, yellow is where he can go instead. Figure 10, live.
 */

import { C, rgb, alpha, fitCanvas, MONO } from './palette.js';
import {
  ID_SKY, ID_OBSTACLE, ID_DOME, ID_MODEL, ID_HEAD, ID_GROUND,
  ID_SELF, ID_SELF_B, ID_MODEL_B, ID_HEAD_B, toCam,
} from '../core/solver.js';

const TINT = {
  [ID_OBSTACLE]: rgb('#4a565e'),
  [ID_GROUND]: rgb('#232e34'),
  [ID_DOME]: rgb(C.yellowLit),
  [ID_MODEL]: rgb(C.orangeLit),
  [ID_HEAD]: rgb('#ffb066'),
  // Your own body sits in the corner of your own screen, so it is drawn a
  // shade down from the player you are aiming at, in your own colour.
  [ID_SELF]: rgb('#a8453a'),
  [ID_SELF_B]: rgb('#4d7fd6'),
  [ID_MODEL_B]: rgb(C.blueLit),
  [ID_HEAD_B]: rgb('#9dc0ff'),
};
const SKY_TOP = rgb('#0c1215');
const SKY_BOT = rgb('#1b262c');

/**
 * Paint a framebuffer into a canvas, then add the vector overlays that make it
 * readable: horizon grid, crosshair, and the aim point.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} fb   framebuffer from look()
 * @param {Object} cam  camera from look()
 * @param {Object} opts { crosshair, label, marks, fogFar }
 */
export function drawScope(canvas, fb, cam, opts = {}) {
  const aspect = fb.H / fb.W;
  const cssW = canvas.parentElement.clientWidth || 360;
  const { ctx, w, h } = fitCanvas(canvas, cssW, Math.round(cssW * aspect));

  // ── the tagged buffer, upscaled ─────────────────────────────────────────
  const img = ctx.createImageData(fb.W, fb.H);
  const px = img.data;
  const fogFar = opts.fogFar ?? 42;
  for (let y = 0; y < fb.H; y++) {
    const skyT = y / fb.H;
    for (let x = 0; x < fb.W; x++) {
      const k = y * fb.W + x;
      const id = fb.id[k];
      const o = k * 4;
      if (id === ID_SKY) {
        px[o] = SKY_TOP[0] + (SKY_BOT[0] - SKY_TOP[0]) * skyT;
        px[o + 1] = SKY_TOP[1] + (SKY_BOT[1] - SKY_TOP[1]) * skyT;
        px[o + 2] = SKY_TOP[2] + (SKY_BOT[2] - SKY_TOP[2]) * skyT;
        px[o + 3] = 255;
        continue;
      }
      const t = TINT[id] || [128, 128, 128];
      let s = fb.shade[k];
      // distance fog, so depth reads without a second cue
      const lit = id === ID_DOME || id === ID_MODEL || id === ID_HEAD
        || id === ID_MODEL_B || id === ID_HEAD_B
        || id === ID_SELF || id === ID_SELF_B;
      const fog = lit ? 0 : Math.min(0.72, fb.depth[k] / fogFar);
      const bg = 22;
      px[o] = (t[0] * s) * (1 - fog) + bg * fog;
      px[o + 1] = (t[1] * s) * (1 - fog) + bg * fog;
      px[o + 2] = (t[2] * s) * (1 - fog) + bg * fog;
      px[o + 3] = 255;
    }
  }
  const off = document.createElement('canvas');
  off.width = fb.W; off.height = fb.H;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, w, h);

  const proj = (P) => {
    const c = toCam(cam, P);
    if (c.Z < 0.05) return null;
    return {
      x: ((c.X / c.Z + cam.tanH) / (2 * cam.tanH)) * w,
      y: ((cam.tanV - c.Y / c.Z) / (2 * cam.tanV)) * h,
      z: c.Z,
    };
  };

  // ── world-space marks (openings, edges, the corner being played) ────────
  if (opts.marks) {
    ctx.lineWidth = 1.5;
    for (const m of opts.marks) {
      const a = proj(m.a), b = proj(m.b);
      if (!a || !b) continue;
      ctx.strokeStyle = m.color || alpha(C.greenLit, 0.9);
      ctx.setLineDash(m.dash || []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ── crosshair ───────────────────────────────────────────────────────────
  // Outlined, because it sits on top of the movement region more often than
  // not, and a yellow crosshair on a yellow region is invisible exactly where
  // you most need to see it.
  if (opts.crosshair !== false) {
    const cx = Math.round(w / 2) + 0.5, cy = Math.round(h / 2) + 0.5;
    const gap = 3, len = 7;
    const arms = new Path2D();
    arms.moveTo(cx - gap - len, cy); arms.lineTo(cx - gap, cy);
    arms.moveTo(cx + gap, cy); arms.lineTo(cx + gap + len, cy);
    arms.moveTo(cx, cy - gap - len); arms.lineTo(cx, cy - gap);
    arms.moveTo(cx, cy + gap); arms.lineTo(cx, cy + gap + len);

    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(6,10,12,0.9)'; ctx.lineWidth = 3.4; ctx.stroke(arms);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3; ctx.stroke(arms);

    ctx.beginPath(); ctx.arc(cx, cy, 1.9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6,10,12,0.9)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineCap = 'butt';
  }

  // ── aim point: the "geometric point" of §4.5-3 ──────────────────────────
  if (opts.aimPoint) {
    const p = proj(opts.aimPoint);
    if (p) {
      const mark = new Path2D();
      mark.arc(p.x, p.y, 6, 0, Math.PI * 2);
      mark.moveTo(p.x - 9, p.y); mark.lineTo(p.x + 9, p.y);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(6,10,12,0.85)'; ctx.lineWidth = 3.2; ctx.stroke(mark);
      ctx.strokeStyle = C.greenLit; ctx.lineWidth = 1.4; ctx.stroke(mark);
      ctx.lineCap = 'butt';
    }
  }

  if (opts.note) {
    ctx.font = MONO(10.5, 500);
    ctx.fillStyle = alpha(C.scopeInk2, 0.9);
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(opts.note, w - 7, h - 6);
    ctx.textAlign = 'left';
  }
  return { w, h, proj };
}

/**
 * A compact readout strip for a scope: model-dome, empty-dome, range.
 * Values arrive in steradians and leave in millisteradians, which is the unit
 * that makes fight-range numbers land between 1 and 100.
 */
export function scopeStats(seen, extra = {}) {
  const msr = (x) => (x * 1000);
  return {
    model: msr(seen.model),
    empty: msr(seen.empty),
    dome: msr(seen.dome),
    head: msr(seen.head),
    screen: seen.screen * 100,
    distance: seen.distance,
    ...extra,
  };
}
