/**
 * scenarios.js, the ten exercises of §3, as geometry the solver can chew on.
 *
 * Every scene carries the guide's own questions and the guide's own answers.
 * Nothing here is paraphrased into agreement with the solver: where the
 * numbers and the prose part company, the `check` notes say so.
 *
 * Convention used throughout: an **angle** is the bearing from the target to
 * the viewer, measured anticlockwise from the target's nearest normal, in
 * degrees. That matches §4.3-1: "the positive angles with respect to the
 * normal are the ones in the anti-clockwise direction".
 */

import { box, ramp } from './core/geom.js';

const WALL_H = 3.2;
const FAR = 40;

/** Ring of preset viewer positions at a fixed range and a list of angles. */
function ring(cx, cy, range, normalDeg, angles) {
  return angles.map((a) => {
    const t = ((normalDeg + a) * Math.PI) / 180;
    return {
      label: `${a > 0 ? '+' : ''}${a}°`,
      angle: a,
      x: cx + Math.cos(t) * range,
      y: cy + Math.sin(t) * range,
    };
  });
}

export const SCENARIOS = [

// ─────────────────────────────────────────────────────────── 3.1 ──────────
{
  id: 'infinite-wall',
  num: '3.1',
  title: 'The Infinite Wall',
  figure: 'Figures 11 & 20',
  tagline: 'One wall, one normal, and the factor of two that starts everything.',
  brief:
    'Your enemy has his back against a wall long enough to count as infinite. ' +
    'Half his player-disk is already gone. The half still standing is the entire problem.',
  bounds: { x: [-16, 16], y: [-3, 18] },
  solids: [box([-FAR, -2.4, 0], [FAR, 0, WALL_H], { label: 'infinite wall', role: 'wall' })],
  enemy: { x: 0, y: 0.32 },
  viewer: { x: 0, y: 9 },
  normalHint: 90,
  probes: ring(0, 0.32, 9, 90, [0, 45, 65, 90]),
  questions: [
    'Draw the normal in both figures. Is it unique?',
    'Is it more important to minimize the empty-dome or to maximize the model-dome here? Why?',
    'What are the angles from the normal that minimize the empty-dome?',
    'Would you gain any advantage by taking such an angle on your enemy? Why?',
    'Give at least two optimal angles with respect to the normal that would favor you in a fight against this target.',
    'Why is 45° not an optimal angle?',
  ],
  solution: [
    'Unique. It is the perpendicular to the wall.',
    'Maximising his model-dome here just means closing the distance, because there is nothing in the way. The heuristic works badly at close range, which is where dodging decides things instead, so **minimising his empty-dome** is what matters.',
    '+90° and −90°.',
    'None at all. At plus or minus 90° you are touching the wall yourself, which means he has taken an angle on you as well. Your self-dome now equals his player-dome and the fight is perfectly symmetric again.',
    'Something like plus or minus 65°. Stay far enough from the wall that your own self-dome survives, but get well past 45°, because that is where the advantage actually lives.',
    '**Free directions.** At exactly 45° he still has 5 of his 8 movement directions free, the same as at 0° and at 90°. At 65° only 4 are free and the other 4 run into the wall, so if he holds one of those keys he collides, loses ground speed, and becomes easier to hit.',
  ],
  checks: [
    'The rose has a single maximum, on the perpendicular to the wall.',
    'Apparent width follows r(1 + cos θ): 2r head-on, exactly r from the side, the factor of two of Figures 6 and 7.',
    'The free-direction sweep spikes to 5 at every multiple of 45° and sits at 4 in between. That is the whole of answer (6), and you can read it off the staircase.',
    'The score is exactly **zero** at 0° and again at ±90°, pinning down both of the guide\'s "no advantage" answers. The maximum between them is broad, and the advantage field puts it around 73 to 85° at ranges of 8 to 16 metres, a little wider than the guide\'s ±65°, because the score compares apparent surfaces and does not know about free directions.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.2 ──────────
{
  id: 'corner-case',
  num: '3.2',
  title: 'The Corner Case',
  figure: 'Figures 12 & 21',
  tagline: 'Two walls. Three free directions, and they are the slow ones.',
  brief:
    'Somebody camped in the corner of a building. It happens whenever people hole ' +
    'up indoors, and it costs them three quarters of their disk.',
  bounds: { x: [-4, 18], y: [-4, 18] },
  solids: [
    box([-2.4, -FAR, 0], [0, FAR, WALL_H], { label: 'wall (west)', role: 'wall' }),
    box([-FAR, -2.4, 0], [FAR, 0, WALL_H], { label: 'wall (south)', role: 'wall' }),
  ],
  enemy: { x: 0.34, y: 0.34 },
  viewer: { x: 6.5, y: 6.5 },
  normalHint: 45,
  probes: ring(0.34, 0.34, 8.8, 45, [0, 20, 35, 45]),
  questions: [
    'Draw the normal. Is it unique?',
    'What are the angles from the normal that minimize the empty-dome?',
    'Would you gain any advantage by taking such an angle on your enemy? Why?',
    'Give two optimal angles.',
    'Is the normal direction (the 0°) good in this case? Why?',
    'What about 35°?',
  ],
  solution: [
    'Unique. It is the angle bisector of the corner.',
    '+45° and −45°.',
    'No. At plus or minus 45° you are hugging one of the two walls yourself, and mirror-symmetry evens the fight out all over again.',
    'Plus or minus 20°. They shave his player-dome and leave him only **2** free directions.',
    'Yes, 0° is genuinely good here. It leaves him 3 free directions rather than 2, but those three are forward and the two forward diagonals, which are the ones with the smallest relative speed difference and therefore the easiest to track.',
    'Bad. At 35° you are already close to one wall, so your own self-dome is shrinking, and he needs barely any movement to make the situation symmetric again.',
  ],
  checks: [
    'The rose has one maximum, on the bisector at 45° from either wall.',
    'Free directions: 3 at the bisector, 2 at ±20°, back to 3 at ±45°. The paper\'s counts, reproduced by marching the eight keys against the geometry.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.3 ──────────
{
  id: 'behind-the-corner',
  num: '3.3',
  title: 'Behind The Corner',
  figure: 'Figures 13, 22 & 23',
  tagline: 'His model-dome is zero. You still have something to aim at.',
  brief:
    'He is hiding behind a corner and can peek whenever he likes. You cannot see ' +
    'his model at all. His player-dome still has a shape, though, and the corner ' +
    'still has a distance, and both of those are yours to work with.',
  bounds: { x: [-14, 14], y: [-10, 14] },
  solids: [box([-FAR, -0.7, 0], [0, 0.7, WALL_H], { label: 'wall with a corner', role: 'wall' })],
  enemy: { x: -1.9, y: -1.9 },
  viewer: { x: 6.2, y: 5.6 },
  corner: { x: 0, y: -0.7 },
  approach: { x: 0.62, y: 0.78 },
  probes: [
    { label: 'hugging the wall', angle: -180, x: -3.2, y: 2.0 },
    { label: 'close standoff', angle: -135, x: 2.2, y: 2.0 },
    { label: 'far standoff', angle: -135, x: 7.0, y: 6.4 },
    { label: 'very far standoff', angle: -135, x: 10.5, y: 9.8 },
  ],
  questions: [
    'If the enemy is standing close enough to the corner so that his player-dome extends around it, is the normal unique? Draw one.',
    'If the enemy is standing behind the corner so that his model-dome is zero from your perspective, at what angle would you engage a fight around the corner? Where are you positioning your crosshair?',
    'Did you minimize or maximize something in the previous question? What exactly? How to do that even more efficiently by playing with the distance to the corner?',
    'If the guy is now peek-shooting, how are you reacting? What should you avoid to do?',
    'Now suppose that you are the guy behind the corner and someone is trying to engage you. Can you think of a way to defend yourself? Why does it work?',
    'Suppose now that you are not the guy behind the corner. What should you take care of if your weapon has spread? What should you therefore try to maximize?',
    'What if the game is third person?',
  ],
  solution: [
    'Not unique. Positive angles run anticlockwise, so the horizontal direction going right sits at minus 90° from the normal drawn in the guide.',
    'Hugging the wall at minus 180° is bad, because it minimises your own player-dome while he keeps the freedom to peek on his own schedule. Coming back toward minus 90° is not bad, but it turns the fight into two infinite walls, and if he is close to the corner he can simply rotate around it and face you, at which point mirror-symmetry evens everything out. **About minus 135° is the angle.** Your crosshair rides just past the corner as you move.',
    'You are maximising your own empty-dome and minimising his. Neither model-dome is yours to control, because he decides when to peek. Do it better by **increasing your distance from the corner**. A small step near an obstacle reveals a lot of what is behind it, and the same step taken from far away reveals almost nothing, so distance is control.',
    'As he peeks he will struggle to control his own model-dome and will show far too much of it. You are the one pre-aiming the correct angle, and you can move freely while he is hidden between shots, so you have less aiming to do than he does. Play passively. Drag him around the corner and make him be the one peeking. Above all do not panic-fire before he shows. You waste the magazine and end up reloading first, which is the one way to lose this from ahead.',
    'Increase your distance from the corner before you show yourself. It buys you control over exactly how much you reveal, and it tends to surprise him. Even if he is already standing well back, getting further out than he is flips the advantage. If there is no time for any of that, hug the wall and force an Infinite Wall situation instead.',
    'From too far out every bullet misses the model. You need to grow the model-dome, which means coming closer to the corner and reducing the angle back toward the normal. That costs you positional advantage, so spend it carefully.',
    'In third person the man behind the corner gets vision without exposure, so he peek-shoots far more accurately and your edge evaporates. Reduce the angle as much as you can or you will be peek-killed. Many third-person games are also biased to one shoulder, which makes one side of a corner genuinely harder to take than the other.',
  ],
  checks: [
    'Exposure rate against standoff distance traces 1/d, matching the closed form L²/2d.',
    'Corner control flips sign exactly when your distance to the corner passes his, the numerical statement of "the guy further from the obstacle has the advantage".',
    'Switch the camera to third person and the same position loses its edge: the solver sees the enemy\'s eye leave his body.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.4 ──────────
{
  id: 'the-rock',
  num: '3.4',
  title: 'Engaging The Rock',
  figure: 'Figures 14 & 24',
  tagline: 'A corner you can walk the whole way around.',
  brief:
    'He is behind a rock he cannot climb. He can circle it and peek-shot, and that is all. A big rock is two Behind The Corner problems sitting back to back. A small one is a different animal.',
  bounds: { x: [-13, 13], y: [-10, 15] },
  solids: [box([-1.5, -1.5, 0], [1.5, 1.5, 2.3], { label: 'rock', role: 'rock' })],
  enemy: { x: 1.55, y: -2.0 },
  viewer: { x: 1.5, y: 8.5 },
  corner: { x: 1.5, y: -1.5 },
  approach: { x: 0.1, y: 0.99 },
  probes: [
    { label: 'straight on', angle: 0, x: 1.55, y: 8.5 },
    { label: 'right side, small angle', angle: 25, x: 5.6, y: 7.2 },
    { label: 'right side, wide', angle: 55, x: 8.8, y: 3.8 },
    { label: 'wrong side', angle: -40, x: -3.4, y: 7.6 },
  ],
  variants: [
    {
      id: 'big-rock', label: 'Make the rock big',
      solids: [box([-3.6, -3.6, 0], [3.6, 3.6, 2.6], { label: 'big rock', role: 'rock' })],
      enemy: { x: 3.7, y: -3.2 },
    },
  ],
  questions: [
    'Suppose that the rock is significantly bigger than the player-dome of your enemy. To what situation is this one approximately equivalent to?',
    'How to engage the rock then?',
    'Suppose now and in what follows that the rock is not that big. Draw one normal. Is it unique?',
    'If the enemy is hiding behind the rock and you do not see him yet, how do you engage?',
    'Is there any advantage to close the distance to the rock?',
    'If your weapon has spread, and you want to engage the rock from far away, how would you proceed?',
    'If the game is third person, is rushing straight first then taking an angle a good engagement?',
    'Suppose now that the enemy is peeking on the right and you got surprised. What do you do?',
  ],
  solution: [
    'If the rock is much bigger than the player-dome it takes real time to peek from one side to the other, so it is **two Behind The Corner situations** side by side.',
    'Apply Behind The Corner. Pick a side, take an angle on that side, and increase your distance from that corner. The size of the rock protects you from the other one.',
    'No. There is more than one normal here.',
    'Engage as in Behind The Corner, but with a **smaller** angle in absolute value. The smaller angle is what denies him the other side, and it buys you distance from the rock, so you can pre-aim the good side and win the peek. You can also rush the rock straight to close distance fast and take your angle afterwards, but that is dangerous from far out, because you will not reach cover in time if he peeks on the way in.',
    'Yes. Closing distance lets you hide your own model-dome faster if he peeks. What you want is to close some of it and still stay further from the rock than he is, which keeps you the bigger empty-dome and the slower, more controlled orbit. Bait him by circling, always at a wider radius than his.',
    'You are forced to close some distance. Depending on how bad the spread is, rushing straight and only then taking an angle beats engaging from far out on one side.',
    'Definitely not from far out. Third person lets him see round the rock, so you cannot predict which side he takes, and guessing is not a plan.',
    'If you already closed the distance, move forward and left to get protected first. Then take an angle, take distance, and bait the peek as before. If you engaged from far out on the same side as the peek, reduce the angle even further, going wider right to grow his model-dome as much as you can. You may simply be beaten here.',
  ],
  checks: [
    'The rose shows several maxima: a freestanding rock has a normal on each side it can hide behind.',
    'Grow the rock and the rose collapses toward two isolated maxima, the "two corners" answer to question (1), visible rather than argued.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.5 ──────────
{
  id: 'the-opening',
  num: '3.5',
  title: 'The Opening',
  figure: 'Figures 15, 25 & 26',
  tagline: 'Aim at a geometric point and let him walk into it.',
  brief:
    'A door, a tunnel mouth, a window. He is behind it. At 45° you stop aiming at a player and start aiming at a place.',
  bounds: { x: [-14, 14], y: [-11, 14] },
  solids: [
    box([-FAR, -0.6, 0], [-1.25, 0.6, WALL_H], { label: 'wall (left of opening)', role: 'wall' }),
    box([1.25, -0.6, 0], [FAR, 0.6, WALL_H], { label: 'wall (right of opening)', role: 'wall' }),
  ],
  enemy: { x: 0.55, y: -2.4 },
  viewer: { x: 5.0, y: 5.0 },
  normalHint: 90,
  opening: { x: 0, y: 0, halfWidth: 1.25, height: WALL_H },
  probes: [
    { label: 'straight on (0°)', angle: 0, x: 0.55, y: 7.6 },
    { label: '+45°', angle: 45, x: 5.6, y: 5.6 },
    { label: '−45°', angle: -45, x: -4.6, y: 5.6 },
    { label: '+90°', angle: 90, x: 8.2, y: -0.1 },
  ],
  questions: [
    'Draw a normal. Is it unique?',
    'What are the angles from the normal that minimize the empty-dome of your enemy? Are they optimal? Is there a game-specific detail that can make them optimal?',
    'Draw the enemy and its player-dome from an angle of 45°. Where do you position your crosshair? For this angle, what happens if the enemy pushes? If the enemy is disengaging and is going backward? At what point would you consider that the enemy has a positional advantage over you?',
    'Suppose that there is an infinite wall on your right, what is the optimal angle?',
    'If the enemy is camping far behind the opening on the right, explain how to kill him without pushing through the opening and while pushing through.',
    'What if you add spread?',
    'Suppose that your weapon is now a projectile, like a rocket launcher. Is taking an angle good in this case?',
  ],
  solution: [
    'Strictly it is not unique, but it is fair to ignore the one at 180° from the one drawn in the guide.',
    'As usual, plus and minus 90°. They are not optimal, because you are stuck against a wall and probably cannot even see him from there. **In third person they become optimal**, since you minimise your own player-dome and can still see his.',
    'At 45° you aim at the very middle of the opening, a geometric point on your screen rather than a player. If he pushes, you do not need to aim at all, and the hits are free. Increasing the angle as he pushes is fine even if you end up against the wall, because you get more free hits out of it. If he disengages, reduce the angle, but carefully, because this is exactly where you get baited. **Whoever is further from the opening has the advantage**, because he manages the revealed surface more easily. If he is further out than you are, consider yourself in the worse position.',
    'The optimal angle becomes minus 45°, the same position mirrored to the left. If you insist on playing the right, keep distance from that wall. Otherwise he is automatically taking an angle on you in an Infinite Wall situation, with part of his model covered by the opening, and his model-dome is smaller than yours. That is his fight, not yours.',
    'If he camps far to the right, start on the right too and increase your distance until it beats his. Then take an angle to the left to see him and hit him. The only way to push is to push without showing yourself to the right wall of the opening, then enter as fast as you can with a rectangle move.',
    'Nothing new. You are forced to grow the apparent model-dome, which means closing distance, but not so much that you hand back the positional advantage.',
    'Projectiles have a real hitbox of their own, so taking an angle makes your projectile cover more of the opening for longer, which makes it much harder to dodge. At 45°, aiming at the centre of the opening, you may cover all of it, at which point pushing without being hit is impossible. Taking an angle is even stronger with projectiles than with hitscan.',
  ],
  checks: [
    'At 45° the enemy\'s empty-dome collapses: what is left of his dome barely exceeds his model, which is what "free hits" means numerically.',
    'Turn the weapon into a projectile and the coverage readout reports the fraction of the opening the rocket sweeps, over 1.0 means answer (7) holds in this geometry.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.6 ──────────
{
  id: 'high-ground-low',
  num: '3.6',
  title: 'The High Ground of Low Height',
  figure: 'Figures 16, 27 & 28',
  tagline: 'The first case where the low-ground player wants to be closer to the wall.',
  brief:
    'He stands on a ledge low enough that from the floor, at mid range, you can ' +
    'still see more than half of him. Wall A is what blocks you. The edge of ' +
    'floor B is what blocks him. Those are different obstacles and they do ' +
    'different work.',
  bounds: { x: [-13, 13], y: [-14, 10] },
  solids: [box([-FAR, 0, 0], [FAR, FAR, 1.15], { label: 'high ground (low)', role: 'platform' })],
  enemy: { x: 0, y: 0.75 },
  viewer: { x: 0, y: -5.5 },
  normalHint: 270,
  highGround: { edgeY: 0, height: 1.15 },
  probes: [
    { label: 'long range, straight', angle: 0, x: 0, y: -11.5 },
    { label: 'mid range, straight', angle: 0, x: 0, y: -6.0 },
    { label: 'close to wall A', angle: 0, x: 0, y: -1.4 },
    { label: 'close + angled', angle: 62, x: -6.0, y: -1.4 },
  ],
  matrix: true,
  questions: [
    'From your perspective, what plays the role of an obstacle? Same question from the perspective of the enemy.',
    'Suppose now that the enemy is very close to the edge of the high ground. Why can you assume that the enemy cannot fall? Draw the player-dome of the enemy in this situation and a normal. Is the latter unique?',
    'Is taking an angle with respect to the normal good here? Why?',
    'What happens if you play on the distance to the wall from your perspective and from the perspective of the enemy? Draw the 9 cases and conclude.',
    'What is the optimal strategy then?',
    'What happens if there is spread?',
    'What if the game is third person?',
  ],
  solution: [
    'Wall A is the obstacle from your side. The ground B is the obstacle from his.',
    'Because any decent player knows how easy it is to get hit while falling, so he simply does not do it. His player-dome is therefore cut by the edge of the high ground, and the normal is unique.',
    'Yes. You shrink his empty-dome while keeping a useful amount of his model-dome. The bigger the angle, the smaller his empty-dome, until aiming at a geometric point gives you free hits exactly as in The Opening. Push the angle too far, say to 90°, and you shrink your own empty-dome as well, so it is not yet obvious that large angles win.',
    'Five things come out of the nine cases. His sight grows as he nears the edge of B. Your sight grows as you move away from wall A. At mid distance for both of you, **your** model-dome is the bigger one, so without an angle you are already losing. He can shrink his model-dome a great deal, by backing off the edge, without shrinking your apparent size at all. And getting closer to the wall costs you sight but shrinks your model-dome faster than it shrinks his. Closing the distance to A is good even without a big angle.',
    'Take an angle **and** close the distance to A. Then if he still takes the fight he has to come to the edge, where his model-dome exceeds yours and your angle turns it into a geometric-point shot, and near the edge he can fall, which favours you further. He defends by backing off the edge (baiting you to back off the wall) or by mirroring your lateral movement to deny the angle. Beware: at long and mid range **your** model-dome is bigger, so he needs less precision than you do. Played perfectly he reduces his model-dome to the size of his head. Note this is the first case in the guide where the better position is the one closer to the obstacle, that is general for low-ground positions. Work on large vertical angles.',
    'Position yourself so his model-dome is big enough for your spread to land on. Aiming at the centre of a tiny model is punishing. Long range can work if the spread is small, since both model-domes are then comparable. Close range with a big angle is better, and harder.',
    'Third person gives him much better visibility, so he can play the edge perfectly with far less risk. Close and mid range become bad even with an angle. Long range evens out the visibility, try that, and still take an angle.',
  ],
  checks: [
    'The nine-case matrix is computed, not sketched: every cell reports both model-domes so you can see the crossover where the advantage flips.',
    'Backing off the edge shrinks his model-dome toward head-only while your apparent size barely moves, the asymmetry answer (4) turns on.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.7 ──────────
{
  id: 'high-ground-high',
  num: '3.7',
  title: 'The High Ground of High Height',
  figure: 'Figures 17 & 29',
  tagline: 'The same picture, further out along every axis.',
  brief:
    'Raise wall A until, standing at mid range on the floor, you can barely see ' +
    'half of him. Everything from the low-height case still holds. It simply ' +
    'holds harder.',
  bounds: { x: [-13, 13], y: [-16, 10] },
  solids: [box([-FAR, 0, 0], [FAR, FAR, 2.95], { label: 'high ground (high)', role: 'platform' })],
  enemy: { x: 0, y: 0.75 },
  viewer: { x: 0, y: -6.5 },
  normalHint: 270,
  highGround: { edgeY: 0, height: 2.95 },
  probes: [
    { label: 'long range', angle: 0, x: 0, y: -13.5 },
    { label: 'mid range', angle: 0, x: 0, y: -7.0 },
    { label: 'hugging wall A', angle: 0, x: 0, y: -1.1 },
    { label: 'hugging + angled', angle: 62, x: -5.4, y: -1.1 },
  ],
  matrix: true,
  questions: [
    'What happens if you play on the distance to the wall from your perspective and from the perspective of the enemy? Draw the 9 cases and compare them with the High Ground of Low Height.',
    'What is the optimal strategy then?',
    'What should you take care of if you and the enemy are close to your respective obstacle and the game has head-shot multiplier?',
  ],
  solution: [
    'The situation is very similar (Figure 29). The difference is that you must be **closer** to the wall to gain an advantage, and **further** from it to even out the apparent model-domes. Everything is the same, but more extreme.',
    'The same as before, except that you have to come even closer to the wall, or take even more distance if you would rather fight this at long range.',
    'When you are both close, he only sees your head. With a head-shot multiplier of two that means you need to land at least twice as many shots as he does. You want a good instinct for whether you can really out-damage him from there, because the geometry is not going to save you if you cannot.',
  ],
  checks: [
    'At the "both close" cell the solver reports your visible model as essentially head-only, and the head-shot arithmetic of answer (3) becomes a number you can read.',
    'Comparing the two matrices side by side shows the crossover moving outward, "the same but more extreme", measured.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.8 ──────────
{
  id: 'high-ground-corner',
  num: '3.8',
  title: 'The High Ground With Corner',
  figure: 'Figure 18',
  tagline: 'Two normals, and they swap while you are shooting.',
  brief:
    'The high ground has a corner now. An edge A and an edge B meet at a right ' +
    'angle, with low ground zones C and D sitting in front of each of them.',
  bounds: { x: [-14, 12], y: [-14, 12] },
  solids: [box([0, 0, 0], [FAR, FAR, 2.4], { label: 'high ground with corner', role: 'platform' })],
  enemy: { x: 1.1, y: 1.1 },
  viewer: { x: -4.5, y: -4.5 },
  zones: [
    { id: 'C', label: 'zone C', x: [1.5, 11], y: [-12, -1.2] },
    { id: 'D', label: 'zone D', x: [-12, -1.2], y: [1.5, 11] },
  ],
  probes: [
    { label: 'from the corner diagonal', angle: 0, x: -5.0, y: -5.0 },
    { label: 'from zone C', angle: 0, x: 5.5, y: -6.5 },
    { label: 'from zone D', angle: 0, x: -6.5, y: 5.5 },
    { label: 'close under the corner', angle: 0, x: -1.1, y: -1.1 },
  ],
  questions: [
    'If the enemy stands closer to the edge of A (respectively of B), to what situation is this equivalent?',
    'Suppose now that the enemy stands close to the corner joining the edge of A and B. How many normals are there? Draw them.',
    'Should the enemy stand close to the corner to defend himself?',
    'How are you handling his defense?',
  ],
  solution: [
    'It is exactly The High Ground, with a normal orthogonal to the edge of A, or of B. You can ignore the corner entirely.',
    'Standing exactly on the corner there are **two** normals, one inherited from The High Ground with edge A and one with edge B. The solver disagrees with this answer, and the note underneath says why.',
    'No. The corner is the single place that constrains his player-dome most. He should play *around* the corner and both edges, to gain space and to deny you an angle, without ever actually standing on it.',
    'Picture the normals updating in real time as he swaps from the edge of A to the edge of B. If he starts near edge A, take an angle from zone D. As he swaps to edge B, swap with him and take your angle from zone C instead. The closer you stand to the walls the faster you can change zones, so play this one close. At mid or long range he denies your angle easily and the whole thing degenerates into a pure aim duel.',
  ],
  checks: [
    'Standing the enemy on the corner produces exactly two maxima in the rose, at 90° to one another. Slide him toward one edge and one maximum grows while the other dies.',
    'The advantage field shows two separate green lobes, zone C and zone D, with a dead diagonal between them.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.9 ──────────
{
  id: 'the-slope',
  num: '3.9',
  title: 'The Slope',
  figure: 'Figures 19, 30 & 31',
  tagline: 'Where the mirror-symmetry breaks, and the one distance where it comes back.',
  brief:
    'He is standing on a slope with half his model hidden. Move him up or down ' +
    'it and his pitch changes a great deal, which is precisely the thing ' +
    'mirror-symmetry assumed would not happen.',
  bounds: { x: [-13, 13], y: [-14, 12] },
  solids: [ramp([-FAR, 0, 0], [FAR, 6.5, 0], '+y', 0, 3.1, { label: 'slope', role: 'slope' })],
  enemy: { x: 0, y: 3.1 },
  viewer: { x: 0, y: -7.5 },
  slope: { fromY: 0, toY: 6.5, rise: 3.1 },
  probes: [
    { label: '0°, on the ground in front', angle: 0, x: 0, y: -7.5 },
    { label: '±90°, from the side', angle: 90, x: -7.5, y: 3.1 },
    { label: '−135°', angle: -135, x: -5.6, y: 8.4 },
    { label: 'close, from the side', angle: 90, x: -3.2, y: 3.1 },
  ],
  variants: [
    {
      id: 'roof', label: 'Make it a roof',
      solids: [
        box([-FAR, 0, 0], [FAR, 6.5, 0.001], { label: 'house body', role: 'wall', walkable: true }),
        ramp([-FAR, 0, 0], [FAR, 6.5, 2.2], '+y', 2.2, 5.0, { label: 'roof', role: 'slope' }),
      ],
      enemy: { x: 0, y: 3.1 },
      note: 'A roof stops at a wall rather than at the ground, so there is a standoff where the vertical extents match again, question (3).',
    },
  ],
  questions: [
    'Draw the normal. Is it unique?',
    'Suppose that you are positioned far from the slope on the ground and at 0° from the normal. Does the mirror-symmetry hold true in this case? Who has the advantage in this fight?',
    'Can you find a distance from the slope at which the mirror-symmetry holds true? What if the slope is one side of the roof of a house? Conclude.',
    'Suppose now that you are positioned at 180° with respect to the normal. What can you say about the empty-dome and the model-dome of your enemy for this angle?',
    'Is the previous angle optimal?',
    'Give some optimal angles depending on the distance to the slope, and explain why they are so.',
  ],
  solution: [
    'The normal is unique, and it points along the direction you are looking, which means it continues on behind him.',
    'No. If he moves forward or backward his pitch changes considerably, so the **height** of his apparent model-dome is bigger than yours. He is also standing mid-slope, so the width of his player-dome matches yours. You are simply at a disadvantage here.',
    'If the slope runs into the ground, no. If it is one side of the roof of a house, yes. At that one precise distance your empty-dome is vertically bigger than his, and the better position is finally yours.',
    'The empty-dome is not minimised. The model-dome might be maximised from that side, but rarely by enough to pay for the apparent space you are handing him. Worse, his player-dome is left-right symmetric from there, so you can predict nothing at all about his horizontal motion, and your aim gets harder than it has any need to be.',
    'Surely not.',
    'At mid and long range, think of minus 135°. It minimises his empty-dome, though his model-dome gets small enough that spread may stop you landing anything. A smaller angle in absolute value, but still beyond 90°, grows both his model-dome and his empty-dome together. The best value depends on how steep the slope is, so go and test it. **At close range** the slope doubles as a high ground, so closing from the side wins: your lower body is hidden by the slope and his cannot be.',
  ],
  checks: [
    'The vertical extent of the enemy\'s apparent dome exceeds yours at 0°, confirming answer (2) with a number rather than an argument.',
    'On the roof variant the solver searches the standoff distance for the point where the vertical extents cross, the distance of Figure 31, solved rather than sketched.',
  ],
},

// ─────────────────────────────────────────────────────────── 3.10 ─────────
{
  id: 'symmetrization',
  num: '3.10',
  title: 'Symmetrization',
  figure: '§3.10',
  tagline: 'Every exercise, read from the other chair.',
  brief:
    'Every exercise so far argued from one side of the fight. This one asks you ' +
    'to turn them around, and then to mix them: a high ground of high height ' +
    'behind an opening, while you are behind a rock.',
  bounds: { x: [-16, 16], y: [-16, 14] },
  solids: [
    box([-FAR, 6, 0], [-1.6, FAR, 2.9], { label: 'high ground, left of opening', role: 'platform' }),
    box([1.6, 6, 0], [FAR, FAR, 2.9], { label: 'high ground, right of opening', role: 'platform' }),
    box([-1.6, 8.4, 0], [1.6, FAR, 2.9], { label: 'high ground behind opening', role: 'platform' }),
    box([-1.4, -4.6, 0], [1.4, -1.8, 2.2], { label: 'your rock', role: 'rock' }),
  ],
  enemy: { x: 0.4, y: 8.6 },
  viewer: { x: 0.2, y: -5.6 },
  probes: [
    { label: 'behind your rock', angle: 0, x: 0.2, y: -5.6 },
    { label: 'angled off the rock', angle: 40, x: 6.4, y: -3.4 },
    { label: 'pushed to the opening', angle: 0, x: 0.4, y: 2.2 },
    { label: 'wide left', angle: -55, x: -8.2, y: -1.0 },
  ],
  questions: [
    'Symmetrize the previous exercises: think about them from the point of view of the enemy. Try to see how to maximize damage output and how to minimize damage taken in every situation.',
    'What if you mix different scenarios? Say, an enemy on a high ground of high height behind an opening while you are behind a rock. Think about all of these combinations.',
  ],
  solution: [
    'Every readout on this page is already computed from both chairs at once, because the guide insists on it: you have a player-dome too, and mirror-symmetry holds for your opponent about you just as it does for you about him. The heuristic is a comparison, so there is no such thing as evaluating your position without evaluating his at the same time.',
    'Mixing is what the advantage field is for. A composite map has no closed form answer, but the field still resolves into lobes, and the ones it finds here are the same shapes the individual exercises predict: an angle off your own cover, held at a range where the opening still cuts his empty-dome.',
  ],
  checks: [
    'No single normal dominates a composite map: the rose develops several comparable maxima, and the field picks between them on the strength of the *other* player\'s geometry.',
  ],
},

];

export const byId = (id) => SCENARIOS.find((s) => s.id === id);

/** Materialise a scenario (optionally with one of its variants applied). */
export function loadScenario(id, variantId) {
  const base = byId(id);
  if (!base) throw new Error(`no scenario ${id}`);
  const v = variantId ? (base.variants ?? []).find((x) => x.id === variantId) : null;
  return {
    ...base,
    solids: v?.solids ?? base.solids,
    enemy: { ...(v?.enemy ?? base.enemy) },
    viewer: { ...(v?.viewer ?? base.viewer) },
    variantId: v?.id ?? null,
  };
}
