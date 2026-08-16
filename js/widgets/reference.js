/**
 * reference.js, the exercises, the glossary, and the honest caveats.
 */

import { el, onVisible, readout, fmt, clear } from '../ui/dom.js';
import { C, alpha } from '../ui/palette.js';
import { drawScope } from '../ui/scope.js';
import { createTopDown } from '../ui/topdown.js';
import { makePair, evaluateInto } from '../ui/engine.js';
import { DEFAULT_PARAMS } from '../core/params.js';
import { bearing, angleOffNormal } from '../core/normals.js';
import { requestRose } from '../ui/solverClient.js';
import { SCENARIOS, loadScenario } from '../scenarios.js';
import { openInLab } from './lab.js';

// Very small inline markdown: **bold** and *italic* only.
const md = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

// ══════════════════════════════════════════════════════════ exercises ════
export function exercises(mount) {
  for (const s of SCENARIOS) mount.appendChild(exerciseBlock(s));
}

const previewQueue = [];
let previewDraining = false;
function queuePreview(fn) {
  previewQueue.push(fn);
  if (previewDraining) return;
  previewDraining = true;
  const step = () => {
    const next = previewQueue.shift();
    if (!next) { previewDraining = false; return; }
    next();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function exerciseBlock(s) {
  const preview = el('div.stack');
  const block = el('article.ex', { id: `ex-${s.id}` },
    el('div.plate',
      el('div.plate-text',
        el('div.ex-head',
          el('span.ex-num', s.num),
          el('h3.ex-title', s.title),
          el('span.ex-fig', s.figure),
        ),
        el('p.ex-tag', s.tagline),
        el('p', { style: { marginTop: '0.9rem' } }, s.brief),

        el('p.eyebrow', { style: { marginTop: '1.6rem' } }, 'Questions'),
        el('ol.qs', s.questions.map((q) => el('li', q))),

        el('details.sol',
          el('summary', "The guide's solutions"),
          el('div.sol-body',
            el('ol.sols', s.solution.map((a) => el('li', { html: md(a) }))),
          ),
        ),

        el('p.eyebrow', { style: { marginTop: '1.6rem' } }, 'What the solver finds'),
        el('ul.notelist.checks', s.checks.map((c) => el('li', { html: md(c) }))),

        el('div', { style: { marginTop: '1.2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } },
          el('button.btn', {
            type: 'button',
            onclick: () => {
              openInLab(s.id);
              document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
          }, 'Open in the lab'),
          ...(s.variants ?? []).map((v) => el('button.btn.ghost', {
            type: 'button',
            onclick: () => {
              openInLab(s.id, v.id);
              document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
          }, v.label)),
        ),
      ),
      preview,
    ),
  );

  // Build the preview only when it comes into view, and never two in the same
  // frame, ten solvers at once is a lot of arithmetic for a page that may
  // never be scrolled this far.
  onVisible(block, () => queuePreview(() => buildPreview(preview, s)));
  return block;
}

function buildPreview(mount, def) {
  const p = { ...DEFAULT_PARAMS, bufW: 150, bufH: 104, domeGrid: 35 };
  const sc = loadScenario(def.id);
  const pair = makePair(p.bufW, p.bufH);
  const mapCanvas = el('canvas'), scopeCanvas = el('canvas');
  const rNormals = readout('Normals', { swatch: 'green' });
  const rOff = readout('Angle off the normal', { swatch: 'blue' });
  const rModel = readout('His model-dome / yours', { swatch: 'orange' });
  const rEmpty = readout('His empty-dome / yours', { swatch: 'yellow' });
  const rFree = readout('His free directions', { swatch: 'red' });
  const badge = el('span.tag', 'idle');

  mount.appendChild(el('div.stack',
    el('div.map-wrap',
      el('div.scope',
        el('div.scope-head', el('span', `Exercise ${def.num}`), badge),
        el('div', mapCanvas),
      ),
      el('div.map-hint', 'drag to move yourself'),
    ),
    el('div.scope',
      el('div.scope-head', el('span', 'Your view'), el('b', 'from here')),
      el('div', scopeCanvas),
    ),
    el('div.readouts', rNormals, rOff, rModel, rEmpty, rFree),
  ));

  let viewer = { ...sc.viewer };
  const enemy = { ...sc.enemy };
  let rose = null;
  requestRose(sc, enemy, p, { radius: 9 }).then((r) => { rose = r; draw(); });

  const map = createTopDown(mapCanvas, {
    maxHeight: 330, dragAnywhere: true, dragEnemy: false,
    onDrag: (who, x, y) => {
      const b = sc.bounds;
      viewer = {
        x: Math.min(Math.max(x, b.x[0] + 0.4), b.x[1] - 0.4),
        y: Math.min(Math.max(y, b.y[0] + 0.4), b.y[1] - 0.4),
      };
      draw();
    },
  });

  function draw() {
    const r = evaluateInto(pair, sc, viewer, enemy, p);
    drawScope(scopeCanvas, r.mine.fb, r.mine.cam, { note: `${r.range.toFixed(1)} m` });
    badge.className = `tag ${r.ev.verdict}`;
    badge.textContent = r.ev.engaged ? r.ev.verdict : 'no sight';
    rNormals.set(!rose ? 'solving…' : rose.flat ? 'every direction' : rose.normals.map((n) => `${n.toFixed(0)}°`).join(' · '));
    const off = rose ? angleOffNormal(bearing(enemy, viewer), rose.normals) : null;
    rOff.set(!rose ? 'solving…' : rose.flat ? 'no normal' : fmt.deg(off.off));
    rModel.set(`${(r.mine.model * 1000).toFixed(2)} / ${(r.theirs.model * 1000).toFixed(2)}`, 'msr');
    rEmpty.set(`${(r.mine.empty * 1000).toFixed(2)} / ${(r.theirs.empty * 1000).toFixed(2)}`, 'msr');
    rFree.set(`${r.enemyFree.nFree}`, 'of 8');

    map.render({
      scene: sc, scenario: sc, bounds: sc.bounds, enemy, viewer,
      enemyYaw: r.foe.yaw, viewerYaw: r.me.yaw,
      enemyDome: r.enemyDome, viewerDome: r.viewerDome,
      rose, showShapeRose: true, probes: sc.probes,
      layers: { rose: !!rose, normals: !!rose, enemyDome: true, viewerDome: true, sight: true, probes: true, zones: true },
    });
  }
  draw();
  window.addEventListener('resize', draw);
}

// ══════════════════════════════════════════════════════════ glossary ═════
const TERMS = [
  ['Player-disk', '§2.2', 'Every ground position he can reach inside the fight time-scale. A disk of radius 300 ms times v, or an ellipse if the game gives him a slower strafe. It is where he can be, not where he is.'],
  ['Player-dome', '§2.2', 'The player-disk with jumping and crouching added, so a volume rather than a surface. Stored here as a height field over the reachable cells, which lets obstacles clip it exactly.'],
  ['Self-dome', '§2.2', 'Your own player-dome. It gets its own name because forgetting it is the single most common mistake in the exercises. Almost everything that shrinks his space shrinks yours too.'],
  ['Free dome', '§2.2', 'A player-dome nothing intersects. Its apparent surface is the same from every direction, which is the formal way of saying a player in the open has no normal for you to angle off.'],
  ['Apparent surface', '§2.2', 'How much of your monitor something occupies. Solid angle, measured here in millisteradians. The key move in the whole guide is that the volume of a dome is irrelevant and only its apparent surface matters, because your screen is flat.'],
  ['Normal', '§2.2', 'A direction, at fixed distance, that maximises the apparent surface of a player-dome. Not necessarily unique. A rock has several, a free dome has all of them. Found here by sweeping the bearing and reading off the maxima.'],
  ['Taking an angle', '§2.3', 'Standing away from a normal. It shrinks his empty-dome, and past a point it shrinks yours as well, which is exactly why the extremes are never the answer.'],
  ['Model-dome', '§2.2', 'The part of the apparent player-dome his model is currently covering. It is what you aim at and you want it big. Orange in every viewport here.'],
  ['Empty-dome', '§2.2', 'Everything left over. Space he can move into but is not occupying. You want it small, because it is what your crosshair has to chase. Yellow.'],
  ['Free direction', '§2.2', 'One of the eight movement directions that does not run into an obstacle when he holds it. Sliding along a wall still counts as free, which is the entire reason 45° leaves him five free directions and 65° leaves him four.'],
  ['Mirror-symmetry', '§2.2', 'In a horizontal fight at short time-scales, forward-dominant and backward-dominant motion look identical from your side, so only horizontal aim correction matters. It breaks the moment there is verticality, which is what The Slope is about.'],
  ['2d aim', '§2.1', 'Aiming at a point in screen space rather than at a model in a world. Unnatural, expensive in attention, and the only mode in which any of this geometry is legible.'],
  ['Game sense positioning', '§1', 'Objective driven positioning. Rotations, routes, hot spots. Slow, global, specific to the game, and it always takes precedence over anything on this page.'],
  ['Mechanical positioning', '§1', 'Combat driven positioning. Crosshair placement, target selection, dodging, and geometric positioning. Local, fast, universal.'],
  ['Aimbot criterion', '§1', 'A fight you cannot win even with perfect aim is a fight you should not take. A fight you cannot lose even against perfect aim is a fight your enemy should not avoid. It gates everything else.'],
  ['Revealed surface', '§4.3', 'The ground that becomes visible when you take one step around an obstacle. It falls off as one over your distance to that obstacle, which is why distance from cover is control over cover.'],
];

export function glossary(mount) {
  for (const [term, ref, body] of TERMS) {
    mount.appendChild(el('div',
      el('dt', term, el('small', ref)),
      el('dd', body),
    ));
  }
}

// ══════════════════════════════════════════════════════════ caveats ══════
const CAVEATS = [
  ['The solver finds one normal where §4.8 names two.',
   'On the corner of a high ground the guide inherits a normal from each edge. But a normal is defined as an argmax of apparent surface, and a dome clipped by two perpendicular edges is a quarter disc, whose argmax is a single direction on the bisector. That is exactly what the guide itself concludes for The Corner Case. Move him off the corner and the single normal swings round to the perpendicular of whichever edge he is nearest, which is the behaviour §4.8 goes on to describe anyway.'],
  ['The word "normal" is doing two jobs.',
   'An obstacle can shrink a dome\'s apparent surface by blocking movement or by blocking sight. A wall behind him does the first. A doorway in front of him does only the second. The guide uses one word for both, which is why its answers for The Opening and for The High Ground end up appealing to different things. This page plots both curves and labels which is which.'],
  ['r(1 + cos θ) is a far field law.',
   'Figures 6 and 7 are orthographic. At a real engagement range the near half of a player-disk subtends more angle than the far half, so a wall costs him slightly less apparent surface than the flat formula predicts. About six per cent at nine metres, converging to the formula as range grows. The solver measures true solid angle, so it shows the excess instead of the idealisation.'],
  ['The damage model is not in the guide.',
   'The heuristic is stated without a derivation and does not need one. The expected damage model used on this page, a Gaussian aim error whose width grows with the empty-dome, exists for one purpose: to show that the heuristic\'s two clauses are the two partial derivatives of a single quantity. Its absolute numbers mean nothing. Only the signs do.'],
  ['The dome is a shape from a figure, not from physics.',
   'Vertical extent tapers toward the rim of the disk because that is what Figure 3 draws. A real player can jump and strafe at full speed at once, which would make the dome a prism instead. Both are in the lab and the difference barely moves a single conclusion.'],
  ['Movement is straight line, not swept.',
   'Reachability is tested along straight paths out from the player, so a dome does not wrap around a corner the way a real player sliding along a wall could. That understates the dome slightly in tight geometry, and it has never once changed which direction is a normal.'],
  ['One model, one hitbox, no abilities.',
   'The guide is explicit that it works in the simplest case, a spreadless weapon, a simple hitbox, an isotropic game, and adds the game-specific detail case by case. Spread, head-shot multipliers, projectile size, anisotropic movement and a third-person camera are all here as parameters. Everything else is not.'],
  ['The field only scores fights.',
   'A cell where neither of you can see any part of the other is left out of the advantage field rather than scored. Standing behind a wall is not a good position, it is an absence of one, and the heuristic has no opinion about places where nobody can shoot anybody.'],
];

export function caveats(mount) {
  mount.appendChild(el('ul.notelist', { style: { marginTop: '1.4rem' } },
    CAVEATS.map(([head, body]) => el('li',
      el('div',
        el('strong', head),
        el('div', { class: 'dim', style: { marginTop: '0.25rem', fontSize: 'var(--step--1)' } }, body),
      ),
    )),
  ));
}
