# Player-Dome

**A numerical solver and visualiser for AIMER7's *Heuristic about geometric positioning and applications* (8 March 2019).**

Built by Philip L (Clocktock). The ideas are AIMER7's, the arithmetic is mine.

The guide is a short, unusually careful piece of writing about why some positions in a
shooter are better than others. It defines its terms precisely enough to be computed, and
then argues in prose and hand drawn figures, which is the right choice for a guide. This
project computes them instead.

Everything on the page is measured. The first-person viewports are not illustrations of a
number produced elsewhere; they *are* the measurement, rendered from the same tagged
framebuffer whose pixels were summed.

---

## What it computes

| The guide says | Player-Dome measures |
| --- | --- |
| **Player-dome**, where he can be in 300 ms | a height field over the reachable cells, clipped by every obstacle |
| **Apparent surface**, how much of your monitor it occupies | solid angle, in millisteradians, from a software rasteriser |
| **Model-dome** / **empty-dome** | the two tags that partition the visible dome, exactly |
| **Normal**, the direction maximising apparent surface | an argmax over a 360° sweep; a set of arcs, not always one ray |
| **Free direction** | the eight keys marched against the actual geometry |
| **The heuristic** | two inequalities on four numbers, from both chairs at once |
| **Revealed surface** (Figure 23) | the ground cells a single step exposes, and the 1/d law they obey |

Plus an **advantage field** that sweeps every legal standing position on the map, runs the
whole duel from both sides at each one, and colours the map by the result.

## What it reproduces

These are the guide's own checkable claims. All of them are pinned down by
`node --test test/`:

- an enemy against a wall is **exactly half** as wide from the side as head-on, and
  `r(1 + cos θ)` in between (Figures 6 and 7)
- a wall gives **one** normal, perpendicular to it (§4.1-1)
- a corner gives **one** normal, on the angle bisector (§4.2-1)
- an enemy in the open has **no** distinguished direction, the curve is flat (Figure 9)
- against a wall he keeps **5** free directions at every multiple of 45° and **4** in
  between; this is the whole of "why 45° is not an optimal angle" (§4.1-6)
- in a corner he keeps **3** on the bisector and **2** at ±20° (§4.2-4/5)
- a high-ground edge clips the dome, because he will not step off it (§4.6-2)
- revealed surface falls off as **1/d**, so the player further from cover controls it
  (§4.3-3)
- the guide's aimbot example, 157 hp and 100 dps against 100 hp and 50 hp, is a fight
  you lose (§1)

## Where it disagrees

Stated on the page rather than smoothed over, because the guide asks for exactly that:
if you disagree with a solution, say so, you might be right.

- **§4.8-2 names two normals** for an enemy on the corner of a high ground. By the guide's
  own definition a normal is an argmax of apparent surface, and a dome clipped by two
  perpendicular edges is a quarter-disc, whose argmax is a single direction on the
  bisector, exactly as §4.2-1 concludes for The Corner Case. The solver finds one.
- **"Normal" is doing two jobs.** An obstacle can shrink a dome's apparent surface by
  blocking movement or by blocking sight. A wall behind him does the first; a doorway in
  front of him does only the second. The rose plots both curves.
- **`r(1 + cos θ)` is a far-field law.** At nine metres, perspective leaves him about six
  per cent more apparent surface than the orthographic formula predicts.

## Running it

No dependencies and no build step.

```sh
npm run dev     # static server on http://localhost:5173
npm test        # node --test test/
```

ES modules and web workers both need a real origin, so open it through the server rather
than off the filesystem. Deploying is `git push`, the whole thing is static.

## Layout

```
index.html          the argument; readable without any JavaScript
css/                tokens, then layout and components
js/core/            the solver, no DOM anywhere in here
  geom.js           vectors, convex solids, rays
  dome.js           the player-dome, and free directions
  solver.js         software rasteriser; apparent surfaces in steradians
  normals.js        the 360° sweep and the argmax that finds normals
  duel.js           the heuristic, and the damage model behind it
  visibility.js     visibility polygons and the revealed-surface law
  field.js          the advantage field
  worker.js         the two slow solves, off the main thread
js/ui/              canvas widgets and the small DOM helpers
js/widgets/         one module per section of the page
js/scenarios.js     the ten exercises, with the guide's questions and answers
test/               the claims above, as assertions
```

The solver has no DOM dependency, so `js/core/` runs unchanged under Node, which is how
the tests reach it.

## Credit

The ideas, the terminology, the figures and all ten exercises are **AIMER7's**, from a
guide released for free:

> it's a lot of work, but as a former scientist too, I know how important free access to
> knowledge is.

- [twitch.tv/AIMER7](https://www.twitch.tv/AIMER7)
- [youtube.com/user/1212testmicro](https://www.youtube.com/user/1212testmicro)
- Discord: AIMER7#9589

This repository is an independent reading of that guide. Any error in the modelling is
mine rather than his.

Philip L (Clocktock). Discord: clocktock.

## Licence

MIT, for the code in this repository. The guide itself belongs to its author.
