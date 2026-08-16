/**
 * reference.js — the applications, the glossary and the disagreements.
 *
 * Every situation is rendered with the same template, deliberately. The
 * consistency matters more than variety here: a reader who has been through
 * two of them knows where to look in the other eight.
 *
 *   Situation → Predict → Try it → What changed → Rule → Modifiers → Original exercise
 */

import { el, onVisible, clear, fmt } from '../ui/dom.js';
import { chip, rulebox, predict, gauge, advanced, describe } from '../ui/teach.js';
import { figure } from './figure.js';
import { requestRose } from '../ui/solverClient.js';
import { bearing, angleOffNormal } from '../core/normals.js';
import { SCENARIOS, loadScenario } from '../scenarios.js';
import { FAMILIES, APPLICATIONS } from '../applications.js';
import { openInLab } from './lab.js';

const md = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

const byId = (id) => SCENARIOS.find((s) => s.id === id);

// ══════════════════════════════════════════════════════ applications ═════
export function applications(mount) {
  for (const fam of FAMILIES) {
    const block = el('section.family',
      el('div.family-head',
        el('span.n', fam.n),
        el('h3', fam.title),
      ),
      el('p.family-note', fam.note),
    );
    for (const id of fam.members) {
      const def = byId(id);
      if (def) block.appendChild(situationBlock(def));
    }
    mount.appendChild(block);
  }
}

function situationBlock(def) {
  const app = APPLICATIONS[def.id] || {};
  const preview = el('div.stack');

  const body = el('div.plate-text',
    el('div.ex-head',
      el('span.ex-num', def.num),
      el('h4.ex-title', def.title),
    ),
    el('p', { style: { marginTop: '0.8rem' } }, def.brief),

    // The first question is asked cold, before the figure has been touched.
    app.predicts?.[0] ? predict(app.predicts[0]) : null,

    app.manipulate ? el('p.tryit', el('b', 'Try it. '), app.manipulate) : null,
    app.explain ? el('p.sofar', app.explain) : null,

    // The rest come after the explanation, where they test whether the idea
    // transferred rather than whether the paragraph was read.
    ...(app.predicts?.slice(1) ?? []).map((q) => predict(q)),

    app.rule ? rulebox(app.rule.text, app.rule.why) : null,

    app.complications?.length
      ? el('div', { style: { marginTop: '1.2rem' } },
          chip('modifier'),
          el('ul.notelist', app.complications.map((c) => el('li',
            el('div', el('strong', `${c.label}. `), c.text),
          ))),
        )
      : null,

    el('div', { style: { marginTop: '1.2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } },
      el('button.btn', {
        type: 'button',
        onclick: () => {
          openInLab(def.id);
          document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, 'Open in the lab'),
      ...(def.variants ?? []).map((v) => el('button.btn.ghost', {
        type: 'button',
        onclick: () => {
          openInLab(def.id, v.id);
          document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, v.label)),
    ),
  );

  const block = el('article.ex', { id: `ex-${def.id}` }, el('div.plate', body, preview));
  onVisible(block, () => queuePreview(() => buildPreview(preview, def)));
  return block;
}

// One figure per frame: ten solvers in one tick is a lot of arithmetic.
const previewQueue = [];
let draining = false;
function queuePreview(fn) {
  previewQueue.push(fn);
  if (draining) return;
  draining = true;
  const step = () => {
    const next = previewQueue.shift();
    if (!next) { draining = false; return; }
    next();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function buildPreview(mount, def) {
  const sc = loadScenario(def.id);
  const normalRead = el('span.val', 'solving…');
  const offRead = el('span.val', '…');

  const fig = figure({
    scene: sc, scenario: sc, you: sc.viewer, enemy: sc.enemy,
    params: { bufW: 158, bufH: 110, domeGrid: 35 },
    mapHeight: 320, showShapeRose: true, probes: sc.probes,
    layers: { enemyDome: true, viewerDome: true, probes: true, zones: true, rose: true, normals: true },
    onChange: (r, { rose }) => {
      if (!rose) return;
      normalRead.textContent = rose.flat ? 'every direction' : rose.normals.map((n) => `${n.toFixed(0)}°`).join(' · ');
      const off = angleOffNormal(bearing(fig.enemy, fig.you), rose.normals);
      offRead.textContent = rose.flat ? 'no reference' : `${fmt.deg(off.off)} away`;
    },
  });

  mount.appendChild(el('div.stack',
    fig.node,
    el('div.readouts',
      el('div.readout', el('span.lbl', el('i.swatch.sw-green'), 'Reference direction'), normalRead),
      el('div.readout', el('span.lbl', el('i.swatch.sw-blue'), 'Blue, relative to it'), offRead),
    ),
  ));
  fig.render();
  requestRose(sc, sc.enemy, fig.params, { radius: 9 }).then((r) => fig.setRose(r));
}

// ══════════════════════════════════════════════════════════ glossary ═════
const TERMS = [
  ['Player-dome', 'reachable space', 'Everywhere a player could be a short moment from now. Not where he is: where he can be.', 'Where can he be in the next moment?'],
  ['Self-dome', 'your reachable space', 'Your own. Every quantity computed for the enemy exists for you, and an advantage only counts if it survives computing both.', 'What does he see when I ask all of this about me?'],
  ['Apparent surface', 'screen-space size', 'How large something is on a monitor rather than in the map. Measured in steradians, which is why two things the same size in the world can be very different problems.', 'How much of that movement appears on my screen?'],
  ['Model-dome', 'hittable area', 'The part of a reachable space the player is filling right now. What you can actually hit. Drawn in that player\'s own colour.', 'How much target do I get?'],
  ['Empty-dome', 'movement room', 'The rest of it. Where he can move instead, and therefore what your crosshair has to be able to cover. Yellow throughout.', 'How much room can he move into?'],
  ['Normal', 'reference direction', 'A direction from which a reachable space appears widest. A measurement, not an instruction: whether moving off it helps depends on what happens to your own geometry.', 'From which side does his movement look widest?'],
  ['Taking an angle', '', 'Using an obstacle against an opponent\'s movement without giving the same obstacle equal leverage over yours.', 'Is this obstacle costing him more than it costs me?'],
  ['Free direction', 'unblocked movement input', 'One of the movement keys that does not run into anything if it is held. Sliding along a wall still counts.', 'Which of his keys still work?'],
  ['Current exposure', '', 'What can be hit at this instant. Roughly the hittable area.', 'What is available to shoot right now?'],
  ['Movement potential', '', 'How that exposure can change in the immediate future. Roughly the movement room.', 'How fast can that change?'],
  ['Mirror-symmetry', '', 'On flat ground, moving toward and away from an opponent look alike from his camera, so only sideways aim correction matters. Any verticality breaks it.', 'Am I correcting in one axis or two?'],
  ['Reveal control', '', 'How gradually you can uncover hidden ground by moving. Finer the further you stand from the obstacle doing the hiding.', 'Who reveals less per step, him or me?'],
];

export function glossary(mount) {
  for (const [term, plain, body, ask] of TERMS) {
    mount.appendChild(el('div',
      el('dt', term, plain ? el('small', plain) : null),
      el('dd', body,
        ask ? el('span', {
          style: { display: 'block', marginTop: '0.35rem', fontFamily: 'var(--ui)', fontWeight: '600', color: 'var(--ink)' },
        }, ask) : null),
    ));
  }
}

// ═══════════════════════════════════════════════════════ disagreements ═══
/**
 * Consistently structured, and never framed as catching anyone out. Some of
 * these are genuine differences of definition rather than errors.
 */
const DIFFS = [
  {
    topic: 'The number of reference directions on a raised corner',
    original: 'A player on the corner of a high ground has two reference directions, one inherited from each edge.',
    numeric: 'The sweep finds one, on the diagonal between the two edges.',
    why: 'A reference direction is defined as the direction maximising apparent reachable space. Two perpendicular edges leave a quarter-disc, and the widest view of a quarter-disc is along its bisector, exactly as it is for a player wedged in a corner. Inheriting one direction per edge treats the two constraints separately when they apply at the same time.',
    consequence: 'Very little. Standing on the corner is a bad idea for the player up there anyway, and once he moves off it the single reference direction swings to the perpendicular of whichever edge he is nearest, which is the behaviour the original description goes on to recommend playing against.',
  },
  {
    topic: 'One word covering two different obstacles',
    original: 'A single term, normal, is used for the direction maximising apparent reachable space in every situation.',
    numeric: 'Measuring separately shows two different curves. One tracks what the player can reach, the other tracks what you can see of it.',
    why: 'A wall behind someone removes places he can stand. A doorway in front of him removes places you can watch. Both reduce the apparent surface, so both fit the definition, but they respond to completely different things: the first is fixed by the map, the second changes as you move.',
    consequence: 'It explains why the answers for a doorway appeal to visibility while the answers for a ledge appeal to movement. The figures on this site plot both curves and label which is which, and the two coincide whenever the obstacle is doing both jobs at once.',
  },
  {
    topic: 'The width of a wall-clipped reachable space',
    original: 'Head on it is twice as wide as from the side, with the intermediate angles following r(1 + cos θ).',
    numeric: 'True in the far field. At nine metres the measured value sits about six per cent above the formula, converging as range grows.',
    why: 'The formula is orthographic: it assumes the reachable space is small compared with the distance to it. At real engagement ranges the near half subtends a larger angle than the far half, so a wall removes slightly less apparent surface than a flat projection predicts.',
    consequence: 'None for play. It matters only if you are comparing a measured number against the closed form and expecting them to agree exactly.',
  },
];

export function disagreements(mount) {
  for (const d of DIFFS) {
    mount.appendChild(el('div.panel', { style: { marginBottom: 'var(--gap)' } },
      el('div.panel-head', el('span', d.topic)),
      el('div.panel-body',
        el('div.maps-to',
          el('div', el('span.plain', 'Original'), el('span.arrow', '·'), el('span', d.original)),
          el('div', el('span.plain', 'Measured'), el('span.arrow', '·'), el('span', d.numeric)),
          el('div', el('span.plain', 'Why they differ'), el('span.arrow', '·'), el('span', d.why)),
          el('div', el('span.plain', 'What it changes in play'), el('span.arrow', '·'), el('span', d.consequence)),
        ),
      ),
    ));
  }
}

// ═══════════════════════════════════════════════════════ assumptions ═════
const LAYERS = [
  ['Measured from the geometry', 'observation', [
    'What is hidden and what is visible from a given eye position.',
    'The area each region covers on screen, as a solid angle.',
    'Which movement inputs run into something.',
    'How much new ground a step uncovers.',
  ]],
  ['Chosen by the model', 'assumption', [
    'The length of the movement window, about 300 ms by default.',
    'Movement speed, jump height, and whether strafing is slower than running.',
    'Player dimensions and eye height.',
    'That a player treats the edge of a drop as solid, because falling is worse than stopping.',
    'That the reachable region tapers toward its rim, which follows the original figure rather than any physics.',
  ]],
  ['Assumed about behaviour', 'assumption', [
    'That aim error grows with the room a target has to move into.',
    'That shot dispersion is Gaussian and independent between shots.',
    'That targets are taken in the order that minimises damage received.',
    'None of these are measured. They exist only to turn geometry into an illustrative damage figure, and no conclusion on the player-facing part of this site depends on them.',
  ]],
];

export function assumptions(mount) {
  for (const [title, kind, items] of LAYERS) {
    mount.appendChild(el('div', { style: { marginBottom: 'var(--gap)' } },
      chip(kind, title),
      el('ul.notelist', items.map((t) => el('li', t))),
    ));
  }
}
