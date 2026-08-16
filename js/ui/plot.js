/**
 * plot.js — one small chart engine for every curve on the page.
 *
 * Three curves carry most of the argument, and they all use this:
 *   · openness against viewing angle — the rose, unrolled, with the normals
 *     as green bands
 *   · free directions against viewing angle — the staircase whose spikes at
 *     every multiple of 45° are the whole of §4.1-6
 *   · revealed surface against standoff — measured against L²/2d
 */

import { C, alpha, fitCanvas, MONO } from './palette.js';

const PAD = { l: 46, r: 12, t: 12, b: 30 };

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Object} spec {
 *   series:[{data:[[x,y]], color, style:'line'|'step'|'dots'|'area', width, dash}],
 *   xMin,xMax,yMin,yMax, xTicks:[{v,label}], yTicks:[{v,label}],
 *   bands:[{from,to,color,label}], markers:[{x,color,label,dash}],
 *   xLabel, yLabel, height, legend:[{label,color,dash}]
 * }
 */
export function drawPlot(canvas, spec) {
  const cssW = canvas.parentElement.clientWidth || 420;
  const cssH = spec.height ?? 180;
  const { ctx, w, h } = fitCanvas(canvas, cssW, cssH);
  const pad = { ...PAD, ...(spec.pad || {}) };

  ctx.fillStyle = C.scope;
  ctx.fillRect(0, 0, w, h);

  const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
  const xMin = spec.xMin, xMax = spec.xMax, yMin = spec.yMin, yMax = spec.yMax;
  const X = (v) => pad.l + ((v - xMin) / (xMax - xMin)) * plotW;
  const Y = (v) => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // bands behind everything (the normal arcs)
  for (const b of spec.bands ?? []) {
    ctx.fillStyle = b.color;
    const x0 = X(Math.max(xMin, b.from)), x1 = X(Math.min(xMax, b.to));
    ctx.fillRect(x0, pad.t, Math.max(1.5, x1 - x0), plotH);
  }

  // grid + ticks
  ctx.font = MONO(9.5, 400);
  ctx.fillStyle = alpha(C.scopeInk2, 0.85);
  ctx.strokeStyle = alpha('#ffffff', 0.08);
  ctx.lineWidth = 1;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const t of spec.yTicks ?? []) {
    const y = Y(t.v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillText(t.label, pad.l - 6, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of spec.xTicks ?? []) {
    const x = X(t.v);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
    ctx.fillText(t.label, x, pad.t + plotH + 6);
  }

  // axes
  ctx.strokeStyle = alpha(C.scopeInk2, 0.55);
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + plotH); ctx.lineTo(w - pad.r, pad.t + plotH);
  ctx.stroke();

  // series
  ctx.save();
  ctx.beginPath(); ctx.rect(pad.l, pad.t - 2, plotW, plotH + 4); ctx.clip();
  for (const s of spec.series ?? []) {
    if (!s.data?.length) continue;
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = s.width ?? 1.6;
    ctx.setLineDash(s.dash ?? []);
    if (s.style === 'dots') {
      for (const [x, y] of s.data) {
        ctx.beginPath(); ctx.arc(X(x), Y(y), s.radius ?? 2.4, 0, Math.PI * 2); ctx.fill();
      }
    } else if (s.style === 'step') {
      ctx.beginPath();
      s.data.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(X(x), Y(y));
        else { ctx.lineTo(X(x), Y(s.data[i - 1][1])); ctx.lineTo(X(x), Y(y)); }
      });
      ctx.stroke();
    } else {
      ctx.beginPath();
      s.data.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      if (s.style === 'area') {
        ctx.lineTo(X(s.data[s.data.length - 1][0]), Y(yMin));
        ctx.lineTo(X(s.data[0][0]), Y(yMin));
        ctx.closePath();
        ctx.fillStyle = s.fill ?? alpha(s.color, 0.16);
        ctx.fill();
        ctx.beginPath();
        s.data.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // markers (your bearing, a chosen angle)
  for (const m of spec.markers ?? []) {
    const x = X(m.x);
    ctx.strokeStyle = m.color; ctx.lineWidth = m.width ?? 1.4;
    ctx.setLineDash(m.dash ?? []);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
    ctx.setLineDash([]);
    if (m.label) {
      ctx.font = MONO(9.5, 600); ctx.fillStyle = m.color;
      ctx.textAlign = x > w - pad.r - 50 ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(m.label, x + (x > w - pad.r - 50 ? -4 : 4), pad.t + 2);
    }
  }
  ctx.restore();

  // labels
  ctx.font = MONO(9.5, 500);
  ctx.fillStyle = alpha(C.scopeInk2, 0.9);
  if (spec.xLabel) {
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(spec.xLabel, w - pad.r, h - 2);
  }
  if (spec.yLabel) {
    ctx.save();
    ctx.translate(11, pad.t + 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(spec.yLabel, 0, 0);
    ctx.restore();
  }

  // legend
  if (spec.legend?.length) {
    ctx.font = MONO(9.5, 500);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let x = pad.l + 6;
    const y = pad.t + 9;
    for (const l of spec.legend) {
      ctx.strokeStyle = l.color; ctx.lineWidth = 2;
      ctx.setLineDash(l.dash ?? []);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = alpha(C.scopeInk, 0.85);
      ctx.fillText(l.label, x + 18, y);
      x += 22 + ctx.measureText(l.label).width + 12;
    }
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

/** Nicely spaced ticks for an angle axis in degrees. */
export const angleTicks = (step = 90, from = -180, to = 180) => {
  const out = [];
  for (let v = from; v <= to; v += step) out.push({ v, label: `${v}°` });
  return out;
};

export const numTicks = (from, to, n = 4, fmt = (v) => v.toFixed(1)) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const v = from + ((to - from) * i) / n;
    out.push({ v, label: fmt(v) });
  }
  return out;
};
