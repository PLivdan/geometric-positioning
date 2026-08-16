/**
 * teach.js — the pieces every explanatory figure is built from.
 *
 * Three editorial rules are enforced here rather than left to each widget:
 *
 *   1. Plain language first. A teaching figure shows "movement room: small"
 *      with a bar. The millisteradians are behind a disclosure, because a
 *      reader learning what an empty-dome is does not need 14.7 msr.
 *   2. Both cameras, always. Every figure can be swapped, because the whole
 *      framework is a comparison and half of it is about your own geometry.
 *   3. Predict, then look. A reader who has committed to an answer learns
 *      more from the figure than one who is only watching it.
 */

import { el } from './dom.js';

// ── vocabulary ────────────────────────────────────────────────────────────
/**
 * Canonical term, plain-language translation, and the one diagnostic question
 * that makes the term usable in a game. The tooltips on the page come from
 * here, so a reader never has to remember a definition from twenty screens ago.
 */
export const TERMS = {
  dome: {
    name: 'player-dome', plain: 'reachable space',
    tip: 'Everywhere the player could be a moment from now.',
    ask: 'Where can he be in the next moment?',
  },
  self: {
    name: 'self-dome', plain: 'your reachable space',
    tip: 'Your own reachable space. Everything computed for him exists for you.',
    ask: 'What does he see when I do the same to myself?',
  },
  apparent: {
    name: 'apparent surface', plain: 'screen-space size',
    tip: 'How large something is on your monitor, not how large it is in the map.',
    ask: 'How much of that movement appears on my screen?',
  },
  model: {
    name: 'model-dome', plain: 'hittable area',
    tip: 'The part of his reachable space his body is filling right now. What you can hit.',
    ask: 'How much target do I get?',
  },
  empty: {
    name: 'empty-dome', plain: 'movement room',
    tip: 'The rest of his reachable space on your screen. Where he can move instead.',
    ask: 'How much room can he move into?',
  },
  normal: {
    name: 'normal', plain: 'reference direction',
    tip: 'A direction from which his reachable space appears widest. A reference, not an instruction.',
    ask: 'From which direction does his movement look widest?',
  },
  free: {
    name: 'free direction', plain: 'unblocked movement input',
    tip: 'A movement key that does not run into anything if he holds it.',
    ask: 'Which of his keys still work?',
  },
};

/** Attach tooltips to every <span class="t" data-t="..."> already in the page. */
export function wireTerms(root = document) {
  for (const node of root.querySelectorAll('.t[data-t]')) {
    const term = TERMS[node.dataset.t];
    if (!term || node.querySelector('.tip')) continue;
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'note');
    node.setAttribute('aria-label', `${term.name}: ${term.tip}`);
    node.appendChild(el('span.tip', term.tip));
  }
}

// ── epistemic labels ──────────────────────────────────────────────────────
/**
 * A reader should always know which kind of claim they are looking at:
 * something true by definition, something visible, something transferable,
 * something the solver produced, or something supplied rather than found.
 */
export const chip = (kind, text) => el(`span.chip.${kind}`, text ?? {
  definition: 'Definition', observation: 'Observation', rule: 'Rule',
  model: 'Model result', assumption: 'Assumption',
  approximation: 'Approximation', modifier: 'Game-specific modifier',
}[kind]);

/** The transferable conclusion at the end of a scenario. */
export const rulebox = (text, why) => el('div.rulebox',
  chip('rule', 'Transferable rule'),
  el('p', text),
  why ? el('p.why', why) : null,
);

// ── plain-language magnitude ──────────────────────────────────────────────
const WORDS = ['none', 'tiny', 'small', 'moderate', 'large', 'very large'];

/** Turn a measurement into a word, relative to a reference value. */
export function describe(value, reference) {
  if (!(reference > 0)) return WORDS[0];
  const r = value / reference;
  if (r <= 0.002) return WORDS[0];
  if (r < 0.15) return WORDS[1];
  if (r < 0.4) return WORDS[2];
  if (r < 0.7) return WORDS[3];
  if (r < 1.15) return WORDS[4];
  return WORDS[5];
}

/**
 * A labelled bar that reads in words by default and in millisteradians only
 * when the reader asks for them.
 */
export function gauge(label, opts = {}) {
  const word = el('span.gauge-word', '—');
  const num = el('span.gauge-num');
  const fill = el('i');
  const row = el('div.gauge-row',
    el('span.gauge-lbl', opts.swatch ? el('i', { class: `swatch sw-${opts.swatch}` }) : null, label),
    el('span', word, num),
    el('span.gauge-track', fill),
  );
  fill.style.background = opts.color ?? 'var(--ink-2)';
  row.set = (value, reference, showNumbers) => {
    const frac = reference > 0 ? Math.min(1, value / reference) : 0;
    fill.style.width = `${frac * 100}%`;
    word.textContent = describe(value, reference);
    num.textContent = showNumbers ? `  ${value.toFixed(value < 10 ? 2 : 1)} msr` : '';
  };
  return row;
}

/** A disclosure for exact figures, solver settings, and other machinery. */
export function advanced(summary, ...body) {
  return el('details.adv',
    el('summary', summary ?? 'Exact figures'),
    el('div.adv-body', body),
  );
}

// ── predict, then look ────────────────────────────────────────────────────
/**
 * Options are shuffled on every load. Written in source order the correct
 * answer tends to land in the same slot, and a reader who notices that can
 * score full marks without reading a single question.
 */
function shuffled(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {Object} spec { question, options:[{label, correct, why}] }
 */
export function predict({ question, options }) {
  const verdict = el('p.verdict');
  options = shuffled(options);
  const buttons = options.map((o) => el('button', {
    type: 'button', 'aria-pressed': 'false',
    onclick: () => {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i] === o)));
      box.classList.add('answered');
      verdict.className = `verdict ${o.correct ? 'right' : 'wrong'}`;
      verdict.textContent = (o.correct ? 'Yes. ' : 'Not quite. ') + o.why;
    },
  }, o.label));
  const box = el('div.predict',
    el('span.q', question),
    el('div.opts', buttons),
    verdict,
  );
  return box;
}

// ── both cameras ──────────────────────────────────────────────────────────
/**
 * The swap control that belongs on every figure. `onchange` receives 'you'
 * or 'enemy'; the caller re-renders from the other eye.
 */
export function povSwap(initial, onchange) {
  let pov = initial ?? 'you';
  const label = el('span', pov === 'you' ? 'Your camera' : "Enemy's camera");
  const btn = el('button.swap', {
    type: 'button',
    title: 'See the same moment from the other player',
    onclick: () => {
      pov = pov === 'you' ? 'enemy' : 'you';
      label.textContent = pov === 'you' ? 'Your camera' : "Enemy's camera";
      btn.className = `swap ${pov === 'you' ? 'pov-you' : 'pov-enemy'}`;
      onchange(pov);
    },
  }, 'Swap camera');
  const head = el('span', label);
  return { button: btn, label: head, get pov() { return pov; } };
}

/** Instruction before an interaction. */
export const tryit = (...kids) => el('p.tryit', el('b', 'Try it. '), ...kids);
/** Conclusion after one. */
export const sofar = (...kids) => el('p.sofar', ...kids);
