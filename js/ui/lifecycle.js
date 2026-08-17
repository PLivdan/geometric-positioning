/**
 * lifecycle.js — when a figure should be built, sharpened, and let go of.
 *
 * There are seventeen instruments on this page and several of them contain
 * ten more. Built once and kept forever, they came to about two hundred
 * megabytes of canvas backing store and a hundred and fifty of solver
 * buffers, and a fast scroll to the bottom blocked the main thread for
 * around four seconds in total.
 *
 * Three rules fix that, and they are all about distance from the reader:
 *
 *   · near        render sharply, once the browser is idle
 *   · on screen   keep whatever has been rendered
 *   · far away    give the memory back, and rebuild on return
 *
 * The sharp pass is the expensive one, so it never runs during a scroll. It
 * waits for an idle moment, and if the reader has already moved on it does
 * not run at all.
 */

const NEAR = '350px 0px';    // close enough to be worth a sharp render
const FAR = '1600px 0px';    // beyond this, hand the memory back

const items = new Set();
const idle = window.requestIdleCallback
  ? (fn) => window.requestIdleCallback(fn, { timeout: 400 })
  : (fn) => setTimeout(fn, 60);
const unidle = window.cancelIdleCallback ? (h) => window.cancelIdleCallback(h) : (h) => clearTimeout(h);

const nearIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const rec = e.target.__life;
    if (!rec) continue;
    rec.near = e.isIntersecting;
    if (e.isIntersecting) schedule(rec);
    else if (rec.idleHandle) { unidle(rec.idleHandle); rec.idleHandle = 0; }
  }
}, { rootMargin: NEAR });

const farIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const rec = e.target.__life;
    if (!rec || e.isIntersecting || !rec.live) continue;
    rec.live = false;
    rec.dirty = true;
    rec.release();
  }
}, { rootMargin: FAR });

/** Queue the sharp pass for an idle moment, and drop it if the reader leaves. */
function schedule(rec) {
  if (!rec.dirty || rec.idleHandle) return;
  rec.idleHandle = idle(() => {
    rec.idleHandle = 0;
    if (!rec.near) return;          // moved on, so it was never worth doing
    rec.dirty = false;
    rec.live = true;
    rec.sharpen();
  });
}

/**
 * @param {Element} node    the widget's root, used for the distance tests
 * @param {Object} hooks    { sharpen, release }
 */
export function manage(node, hooks) {
  const rec = {
    node, sharpen: hooks.sharpen, release: hooks.release,
    near: false, live: true, dirty: true, idleHandle: 0,
  };
  node.__life = rec;
  items.add(rec);
  nearIO.observe(node);
  farIO.observe(node);
  return {
    /** True when a sharp render is worth doing right now. */
    get near() { return rec.near; },
    /** Ask for a sharp pass at the next idle moment. */
    invalidate() { rec.dirty = true; if (rec.near) schedule(rec); },
    stop() { nearIO.unobserve(node); farIO.unobserve(node); items.delete(rec); },
  };
}

/**
 * Resizing used to redraw every mounted instrument synchronously, on every
 * one of the many events a single drag emits. Now it settles first, and only
 * the ones the reader can see are redrawn. The rest are marked and catch up
 * when they are next approached.
 */
const resizers = [];
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    for (const rec of items) {
      rec.dirty = true;
      if (rec.near) schedule(rec);
    }
    for (const r of resizers) {
      // Only what the reader can see. The rest redraw when approached.
      const box = r.node.getBoundingClientRect();
      if (box.bottom > -400 && box.top < window.innerHeight + 400) r.fn();
    }
  }, 180);
});

/**
 * For the widgets that own their drawing rather than going through figure().
 * Same contract: settle first, and skip anything off screen.
 */
export function onResize(fn, node) {
  resizers.push({ fn, node: node || document.documentElement });
}

/**
 * Free a canvas's backing store without disturbing the layout it occupies.
 *
 * The box has to be pinned first. A canvas with no backing store has no
 * intrinsic size, so releasing one collapses its height, which shortens the
 * page, which moves the scroll position, which brings other figures into
 * view, which rebuilds them and grows the page again. That loop locks the
 * main thread solid.
 */
export function dropCanvas(canvas) {
  if (!canvas || !canvas.width) return;
  // Height only. It is the vertical collapse that moves the scroll position,
  // and fitCanvas rewrites style.height on the next draw anyway. Pinning the
  // width would go stale the first time the window changed size.
  const box = canvas.getBoundingClientRect();
  if (box.height) canvas.style.height = `${Math.round(box.height)}px`;
  canvas.width = 0;
  canvas.height = 0;
}
