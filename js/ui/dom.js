/** dom.js — a hundred lines of hyperscript, so the widgets can stay readable. */

export function el(tag, props = null, ...kids) {
  const [name, ...classes] = String(tag).split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (props && (props.nodeType || Array.isArray(props) || typeof props === 'string')) {
    kids.unshift(props);
  } else if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  add(node, kids);
  return node;
}

function add(node, kids) {
  for (const k of kids.flat(4)) {
    if (k === null || k === undefined || k === false) continue;
    node.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

/** A labelled slider that reports its own value. */
export function slider({ label, min, max, step, value, format, hint, oninput }) {
  const out = el('output', format ? format(value) : String(value));
  const input = el('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      out.textContent = format ? format(v) : String(v);
      oninput(v);
    },
  });
  return el('div.ctl',
    el('div.ctl-top', el('label', label), out),
    input,
    hint ? el('span.hint', hint) : null,
  );
}

/** A segmented control. `options` = [{value, label, title}] */
export function segmented({ value, options, onchange, label }) {
  const buttons = options.map((o) => el('button', {
    type: 'button',
    title: o.title || '',
    'aria-pressed': String(o.value === value),
    onclick: () => {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === o.value)));
      onchange(o.value);
    },
  }, o.label));
  const seg = el('div.seg', buttons);
  return label ? el('div.ctl', el('div.ctl-top', el('label', label)), seg) : seg;
}

/** A row in a readouts block. */
export function readout(label, opts = {}) {
  const val = el('span.val', opts.value ?? '…');
  const row = el(`div.readout${opts.big ? '.big' : ''}`,
    el('span.lbl', opts.swatch ? el('i', { class: `swatch sw-${opts.swatch}` }) : null, label),
    val,
  );
  row.set = (v, unit) => {
    val.textContent = '';
    val.appendChild(document.createTextNode(v));
    if (unit) val.appendChild(el('small', unit));
  };
  row.setHTML = (h) => { val.innerHTML = h; };
  if (opts.value !== undefined) row.set(opts.value, opts.unit);
  return row;
}

/** Left/right comparison bar: mine vs theirs. */
export function versus(label, opts = {}) {
  const lv = el('span.mine', '…'), rv = el('span', '…');
  const lb = el('i', { class: 'l' }), rb = el('i');
  const row = el('div',
    el('div.vs-label', label),
    el('div.vs-row',
      lv,
      el('div.vs-bar', el('div', { style: { display: 'grid', justifyItems: 'end' } }, lb), el('i.sep'), el('div', rb)),
      rv,
    ),
  );
  row.set = (mine, theirs, fmt = (v) => v.toFixed(2), goodIsHigh = true) => {
    const m = Math.max(1e-9, mine), t = Math.max(1e-9, theirs);
    const cap = Math.max(m, t);
    lb.style.width = `${(m / cap) * 100}%`;
    rb.style.width = `${(t / cap) * 100}%`;
    lb.style.height = rb.style.height = '100%';
    const win = goodIsHigh ? m > t : m < t;
    lb.style.background = win ? 'var(--green)' : 'var(--red)';
    rb.style.background = win ? 'var(--red)' : 'var(--green)';
    lv.textContent = fmt(mine);
    rv.textContent = fmt(theirs);
  };
  return row;
}

/** Run a callback the first time an element scrolls into view. */
export function onVisible(node, fn, opts = {}) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { io.disconnect(); fn(); }
    }
  }, { rootMargin: opts.margin ?? '120px' });
  io.observe(node);
}

/** requestAnimationFrame loop that pauses when the element is off-screen. */
export function rafLoop(node, tick) {
  let live = false, raf = 0, t0 = performance.now();
  const step = (t) => {
    if (!live) return;
    tick((t - t0) / 1000);
    raf = requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    const vis = entries.some((e) => e.isIntersecting);
    if (vis && !live) { live = true; t0 = performance.now() - 1; raf = requestAnimationFrame(step); }
    else if (!vis && live) { live = false; cancelAnimationFrame(raf); }
  }, { rootMargin: '80px' });
  io.observe(node);
  return { stop: () => { live = false; cancelAnimationFrame(raf); io.disconnect(); } };
}

export const fmt = {
  msr: (v) => v.toFixed(v < 10 ? 2 : 1),
  /** Seconds, where a target you cannot damage takes forever to kill. */
  secs: (v) => (Number.isFinite(v) ? v.toFixed(2) : '∞'),
  m: (v) => `${v.toFixed(1)} m`,
  deg: (v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}°`,
  pct: (v) => `${(v * 100).toFixed(0)}%`,
  x: (v) => `${v.toFixed(2)}×`,
};
