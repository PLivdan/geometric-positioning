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
/** Distance from the nearest whole number, which is where a grid line sits. */
const frac = (v) => Math.abs(v - Math.round(v));

const SKY_TOP = rgb('#0c1215');
const SKY_BOT = rgb('#1b262c');

/**
 * Soften the silhouettes, in the picture only.
 *
 * The rasteriser samples one point per pixel, so every edge comes out as a
 * staircase, and the reachable space is the worst of it because it is built
 * from columns. Scaling up to the display interpolates those steps but does
 * not remove them: the picture is already wrong before it is enlarged.
 *
 * The id buffer says where the real edges are, which is more than a
 * colour-based filter can know. Two dome columns at different depths are one
 * surface and must not be blended, while a one-pixel sliver of body against
 * the sky is a genuine edge and must be. So the test is what a neighbour
 * belongs to, not how different it looks.
 *
 * This runs after measure() has already counted the id buffer, and it never
 * writes to that buffer, so no quantity on the page moves because of it.
 */
let aaScratch = null;
function softenEdges(px, idBuf, W, H) {
  const n = W * H * 4;
  if (!aaScratch || aaScratch.length < n) aaScratch = new Uint8ClampedArray(n);
  const src = aaScratch;
  src.set(px);

  for (let y = 1; y < H - 1; y++) {
    const row = y * W;
    // Walking the row keeps the left and right ids in hand from the previous
    // step, so each pixel costs two id loads instead of four.
    let idL = idBuf[row];
    let id = idBuf[row + 1];
    for (let x = 1; x < W - 1; x++) {
      const k = row + x;
      const idR = idBuf[k + 1];
      const idU = idBuf[k - W], idD = idBuf[k + W];
      if (idL === id && idR === id && idU === id && idD === id) {
        idL = id; id = idR;
        continue;
      }
      let cnt = 0, r = 0, g = 0, b = 0;
      if (idL !== id) { const o = (k - 1) * 4; r += src[o]; g += src[o + 1]; b += src[o + 2]; cnt++; }
      if (idR !== id) { const o = (k + 1) * 4; r += src[o]; g += src[o + 1]; b += src[o + 2]; cnt++; }
      if (idU !== id) { const o = (k - W) * 4; r += src[o]; g += src[o + 1]; b += src[o + 2]; cnt++; }
      if (idD !== id) { const o = (k + W) * 4; r += src[o]; g += src[o + 1]; b += src[o + 2]; cnt++; }
      idL = id; id = idR;

      // A pixel with one foreign neighbour sits on a straight edge and needs
      // a light touch. One surrounded on several sides is a corner or a
      // sliver, where the single sample covered much less than the whole
      // pixel, so it should read closer to what is behind it.
      const wgt = cnt === 1 ? 0.28 : cnt === 2 ? 0.4 : 0.48;
      const o = k * 4;
      const inv = 1 / cnt;
      px[o] = src[o] + (r * inv - src[o]) * wgt;
      px[o + 1] = src[o + 1] + (g * inv - src[o + 1]) * wgt;
      px[o + 2] = src[o + 2] + (b * inv - src[o + 2]) * wgt;
    }
  }
}

// One offscreen canvas per size, rather than a fresh one every frame.
const offCache = new Map();
function offscreen(W, H) {
  const key = `${W}x${H}`;
  let c = offCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = W; c.height = H;
    offCache.set(key, c);
  }
  return c;
}

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

  // ── the tagged buffer, shaded ───────────────────────────────────────────
  //
  // The rasteriser stores what a pixel is and how far away it is. Everything
  // that makes the picture readable is applied here, from those two facts:
  //
  //   · a metre grid on the ground, so range is something you can see rather
  //     than something you have to be told
  //   · a soft contact shadow under each player, so they stand on the floor
  //     instead of floating above it
  //   · distance fog, so depth reads without a second cue
  //
  // The ground is a plane at z = 0, so a ground pixel's world position comes
  // straight back out of its depth and its ray direction. No extra buffer.
  const img = ctx.createImageData(fb.W, fb.H);
  const px = img.data;
  const fogFar = opts.fogFar ?? 42;
  const contacts = opts.contacts ?? [];
  const daPx = (2 * cam.tanH) / fb.W, dbPx = (2 * cam.tanV) / fb.H;

  for (let y = 0; y < fb.H; y++) {
    const skyT = y / fb.H;
    const b = cam.tanV - (y + 0.5) * dbPx;
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
      // The buffer holds 1/z, so this is the one division per pixel that the
      // rasteriser no longer has to do.
      const iz = fb.invZ[k];
      const depth = iz > 0 ? 1 / iz : 1e6;

      let grid = 0;
      if (id === ID_GROUND) {
        const a = -cam.tanH + (x + 0.5) * daPx;
        const wx = cam.eye.x + (cam.fwd.x + a * cam.right.x + b * cam.up.x) * depth;
        const wy = cam.eye.y + (cam.fwd.y + a * cam.right.y + b * cam.up.y) * depth;

        // One line per metre, brighter every five.
        //
        // A line of fixed width in metres shrinks below a pixel in the
        // distance and breaks into moire, so the width is tied to how much
        // ground one pixel actually covers at that depth. The lines then stay
        // about a pixel wide everywhere, and where the ground is so oblique
        // that a pixel spans a whole metre the grid fades to an even wash
        // instead of flickering.
        const across = depth * daPx;
        const away = (depth * depth * dbPx) / Math.max(0.5, cam.eye.z);
        const hw = Math.min(0.5, Math.max(across, Math.min(away, 1)) * 0.8);
        const fade = Math.max(0, 1 - depth / 46);
        const fx = frac(wx), fy = frac(wy);
        const line = fx < fy ? fx : fy;
        const major = Math.min(frac(wx / 5), frac(wy / 5)) * 5;
        if (line < hw) grid += 30 * fade * (1 - line / hw);
        const mw = hw * 1.4;
        if (major < mw) grid += 44 * fade * (1 - major / mw);

        // contact shadow
        for (let c = 0; c < contacts.length; c++) {
          const d = Math.hypot(wx - contacts[c].x, wy - contacts[c].y);
          const r = contacts[c].r ?? 0.55;
          if (d < r) { const f = 0.42 + 0.58 * (d / r) * (d / r); s *= f; grid *= f; }
        }
      }

      const lit = id === ID_DOME || id === ID_MODEL || id === ID_HEAD
        || id === ID_MODEL_B || id === ID_HEAD_B
        || id === ID_SELF || id === ID_SELF_B;
      const fog = lit ? 0 : Math.min(0.72, depth / fogFar);
      const bg = 22;
      // The grid is added after the fog rather than before it. Multiplied in
      // beforehand it was being scaled down twice, and by twenty metres almost
      // none of it reached the screen.
      px[o] = (t[0] * s) * (1 - fog) + bg * fog + grid;
      px[o + 1] = (t[1] * s) * (1 - fog) + bg * fog + grid * 1.05;
      px[o + 2] = (t[2] * s) * (1 - fog) + bg * fog + grid * 1.1;
      px[o + 3] = 255;
    }
  }
  if (opts.antialias !== false) softenEdges(px, fb.id, fb.W, fb.H);

  const off = offscreen(fb.W, fb.H);
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
  // A small plus, outlined in black. It sits on top of the movement region
  // more often than not, and an unoutlined crosshair disappears into the
  // yellow exactly where you most need to see it.
  if (opts.crosshair !== false) {
    const cx = Math.round(w / 2) + 0.5, cy = Math.round(h / 2) + 0.5;
    const arm = 5;
    const plus = new Path2D();
    plus.moveTo(cx - arm, cy); plus.lineTo(cx + arm, cy);
    plus.moveTo(cx, cy - arm); plus.lineTo(cx, cy + arm);

    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 3.6; ctx.stroke(plus);
    ctx.strokeStyle = '#44f57a'; ctx.lineWidth = 1.5; ctx.stroke(plus);
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
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke(mark);
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

