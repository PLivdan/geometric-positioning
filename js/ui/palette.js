/**
 * palette.js — the paper's legend, in numbers the canvas can use.
 * Kept in step with css/tokens.css by hand; there are eight of them.
 */

export const C = {
  stock: '#e3e7e3', stock2: '#f1f4f0', stock3: '#d4dad5',
  ink: '#14181a', ink2: '#556066', ink3: '#7d878b',
  rule: '#bcc5bf', ruleHard: '#97a29a',

  scope: '#0c1215', scope2: '#151d22', scope3: '#1f2a30',
  scopeInk: '#d8e2e4', scopeInk2: '#7f8f96',

  blue: '#2c63d2', blueLit: '#6398f2',
  grey: '#8a928d', greyLit: '#38434a',
  red: '#d0403a', redLit: '#f2685f',
  purple: '#8552ce', purpleLit: '#a97ef0',
  green: '#0e7a55', greenLit: '#2fc78d',
  orange: '#d5651f', orangeLit: '#f5893c',
  yellow: '#9a7c12', yellowLit: '#ecc93a',
};

export const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const alpha = (hex, a) => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/**
 * Diverging ramp for the advantage field: the paper's red for "he is winning
 * this geometry", its green for "you are". Neutral sits at the page stock so
 * a flat field disappears into the map instead of shouting at you.
 */
export function advantageColor(t) {
  const k = Math.max(-1, Math.min(1, t));
  const neg = rgb(C.red), pos = rgb(C.greenLit), mid = [46, 58, 64];
  const from = k < 0 ? neg : pos;
  const m = Math.abs(k);
  const e = m ** 0.75;
  return [
    Math.round(mid[0] + (from[0] - mid[0]) * e),
    Math.round(mid[1] + (from[1] - mid[1]) * e),
    Math.round(mid[2] + (from[2] - mid[2]) * e),
  ];
}

/** Set up a canvas for the device pixel ratio and return its 2-D context. */
export function fitCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(cssW)), h = Math.max(1, Math.round(cssH));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export const MONO = (size, weight = 400) =>
  `${weight} ${size}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
export const UI = (size, weight = 600) =>
  `${weight} ${size}px Archivo, ui-sans-serif, system-ui, sans-serif`;
