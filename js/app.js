/**
 * app.js — mount the instruments into the page and light the nav.
 *
 * The prose in index.html stands on its own without any of this; everything
 * below is measurement bolted into the margins of it.
 */

import { $, $$, el } from './ui/dom.js';
import { hero, recognition, reach, cover, screenspace, split, tension, reference } from './widgets/concepts.js';
import { aimbot, compare, angleSweep } from './widgets/heuristic.js';
import { revealControl } from './widgets/perspective.js';
import { lab } from './widgets/lab.js';
import { applications, glossary, disagreements, assumptions } from './widgets/reference.js';
import { wireTerms } from './ui/teach.js';

const WIDGETS = {
  hero, recognition, aimbot, reach, cover, screenspace, split, tension,
  reference, compare, angleSweep, revealControl, lab,
  applications, glossary, disagreements, assumptions,
};

/** Widgets that must exist immediately; everything else waits to be scrolled to. */
const EAGER = new Set(['hero']);

function start(node, name) {
  const fn = WIDGETS[name];
  if (!fn || node.dataset.started) return;
  node.dataset.started = '1';
  try {
    fn(node);
  } catch (err) {
    console.error(`widget "${name}" failed`, err);
    node.appendChild(el('div.panel', el('div.panel-body',
      el('p', { class: 'dim', style: { margin: 0, fontFamily: 'var(--mono)', fontSize: 'var(--step--2)' } },
        `This instrument failed to start: ${err.message}`),
    )));
  }
}

/**
 * Building every instrument at load means several seconds of solver on the
 * main thread before the page will scroll. They come up as they are reached
 * instead, one per frame so a fast scroll never lands two in the same tick.
 */
function mountAll() {
  const queue = [];
  let draining = false;
  const drain = () => {
    if (!queue.length) { draining = false; return; }
    draining = true;
    const [node, name] = queue.shift();
    start(node, name);
    requestAnimationFrame(drain);
  };
  const enqueue = (node, name) => {
    queue.push([node, name]);
    if (!draining) requestAnimationFrame(drain);
  };

  const nodes = $$('[data-widget]');
  const lazy = [];
  for (const node of nodes) {
    const name = node.dataset.widget;
    if (!WIDGETS[name]) continue;
    if (EAGER.has(name)) start(node, name);
    else lazy.push([node, name]);
  }
  if (!('IntersectionObserver' in window)) {
    lazy.forEach(([n, name]) => enqueue(n, name));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      enqueue(e.target, e.target.dataset.widget);
    }
  }, { rootMargin: '300px 0px' });
  lazy.forEach(([n]) => io.observe(n));
}

/** Highlight the section the reader is actually looking at. */
function wireNav() {
  const links = $$('.tocbar a');
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const sections = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length || !('IntersectionObserver' in window)) return;

  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) seen.add(e.target.id); else seen.delete(e.target.id);
    }
    let active = null;
    for (const s of sections) if (seen.has(s.id)) { active = s.id; break; }
    for (const [id, a] of byId) a.classList.toggle('active', id === active);
    // Keep the active link in view by scrolling the bar itself — never the
    // page, which scrollIntoView would happily do on our behalf.
    const a = active && byId.get(active);
    const bar = a?.parentElement;
    if (a && bar) {
      const want = a.offsetLeft - bar.clientWidth / 2 + a.offsetWidth / 2;
      bar.scrollTo({ left: Math.max(0, want), behavior: 'smooth' });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));
}

/** One quiet entrance per block, once. */
function wireReveal() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const targets = $$('.band .plate-text, .band > .wrap > .h-sec, .masthead .plate-text');
  targets.forEach((t) => t.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (!e.isIntersecting) return;
      setTimeout(() => e.target.classList.add('in'), i * 60);
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  targets.forEach((t) => io.observe(t));
}

function boot() {
  wireTerms();
  mountAll();
  wireNav();
  wireReveal();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
