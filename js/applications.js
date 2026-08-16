/**
 * applications.js — the teaching layer over the ten situations.
 *
 * `scenarios.js` holds geometry and the original exercise text. This holds the
 * part that makes a situation teach something: what to predict before looking,
 * what to change, what changed as a result, and the one sentence worth
 * carrying to a different map.
 *
 * There are only six primitive geometries in the whole set. Grouping them that
 * way is the point: a reader who recognises "this is a visibility boundary"
 * has already done most of the work.
 */

export const FAMILIES = [
  {
    id: 'one-surface',
    n: 'One surface',
    title: 'A single wall behind the enemy',
    note: 'The simplest constraint there is. One flat surface removes half of somewhere he could have been, and everything else in the set is a variation on what that does.',
    members: ['infinite-wall'],
  },
  {
    id: 'two-surfaces',
    n: 'Two surfaces',
    title: 'A corner he is standing inside',
    note: 'Two walls meeting remove three quarters of his reachable space. The constraint is stronger, and it also becomes easier for him to make the situation symmetric again.',
    members: ['corner-case'],
  },
  {
    id: 'visibility',
    n: 'Visibility boundary',
    title: 'An edge that cuts sight rather than movement',
    note: 'Here the obstacle does not stop him moving at all. It stops you seeing where he moves. These situations behave differently from walls, and confusing the two is the most common way to misread a position.',
    members: ['behind-the-corner', 'the-opening'],
  },
  {
    id: 'finite',
    n: 'Finite obstacle',
    title: 'Cover you can walk all the way around',
    note: 'An obstacle with a far side is two edges at once, and how it plays depends entirely on whether it is large or small compared with how far he can move.',
    members: ['the-rock'],
  },
  {
    id: 'vertical',
    n: 'Vertical boundary',
    title: 'Ledges, drops and slopes',
    note: 'A ledge constrains movement without being a wall, because falling off is worse than stopping. Verticality also breaks the assumption that only sideways aim correction matters, and it is where the rule about distance from cover inverts.',
    members: ['high-ground-low', 'high-ground-high', 'high-ground-corner', 'the-slope'],
  },
  {
    id: 'combined',
    n: 'Combined geometry',
    title: 'More than one of the above at once',
    note: 'Real maps stack these. Nothing new appears, but the analysis stops being solvable in your head, which is what the lab is for.',
    members: ['symmetrization'],
  },
];

/**
 * Per-situation teaching material, keyed by scenario id.
 *   predicts     commitments to make. The first is asked before the figure is
 *                touched, the rest after the explanation, where they test
 *                whether the idea transferred rather than whether it was read.
 *   manipulate   what to change in the figure
 *   explain      what changed, and why it matters
 *   rule         the transferable conclusion
 *   complications game-specific modifiers, kept visually separate
 */
export const APPLICATIONS = {

  'infinite-wall': {
    predicts: [{
      question: 'Blue is square to the wall, directly in front of Red. Who has the better geometry?',
      options: [
        { label: 'Blue', correct: false, why: 'The wall is behind Red, but from straight on it costs him nothing that it does not also cost Blue. Both screens show the same thing.' },
        { label: 'Neither, it is even', correct: true, why: 'Square to the wall the two screens are identical. Red has lost half his reachable space, but none of the half he lost was going to appear on Blue\'s screen anyway.' },
        { label: 'Red', correct: false, why: 'Red is the constrained one, so he is not ahead. But the constraint is invisible from directly in front, so he is not behind either.' },
      ],
    }, {
      question: 'You have walked round to about 65°. What happens if you keep going all the way to 90°?',
      options: [
        { label: 'It keeps improving', correct: false, why: 'It improves for a while and then collapses. At 90° you are flat against the wall yourself, and the two screens match again.' },
        { label: 'It peaks and then collapses', correct: true, why: 'The advantage is a hump. It rises off the square line, peaks somewhere wide, then falls back to nothing once the wall is cutting your own movement as much as his.' },
        { label: 'Nothing changes past 45°', correct: false, why: '45° is not a boundary. The curve keeps moving on either side of it.' },
      ],
    }, {
      question: 'Red steps two metres away from the wall. What happens to the advantage you had?',
      options: [
        { label: 'It shrinks', correct: true, why: 'The wall was doing the work, and it is no longer close enough to cut his movement. He has bought back most of his reachable space by taking two steps.' },
        { label: 'It is unchanged', correct: false, why: 'Your angle relative to him is the same, but the thing your angle was exploiting has gone.' },
        { label: 'It grows', correct: false, why: 'Nothing about moving him into open ground helps you.' },
      ],
    }],
    manipulate: 'Walk Blue around Red without changing the range. Watch the yellow region on Blue\'s screen, then swap the camera and watch what happens to Blue\'s own.',
    explain: 'Moving off the square line collapses the movement Blue has to cover, because the wall is now edge-on to his view. Push it all the way to 90° and Blue is against the wall too, at which point the two screens match again.',
    rule: {
      text: 'A flat surface behind someone only helps you once you stop looking straight at it.',
      why: 'The constraint exists in the map from the moment the wall is there, but it only appears on your screen when your camera is off the perpendicular. That is why walking sideways changes a fight in which nobody has moved closer.',
    },
    complications: [
      { label: 'Movement model', text: 'Counting eight fixed movement inputs makes exact multiples of 45° special, because two inputs land parallel to the wall and slide instead of colliding. That is a property of eight-direction movement, not of geometry in general. Games with analogue movement blur it.' },
      { label: 'Spread', text: 'Angling shrinks the target as well as the room. Past a point you have made him predictable and too small to hit.' },
    ],
  },

  'corner-case': {
    predicts: [{
      question: 'Red is wedged in a corner. Blue is on the diagonal, looking straight in. Is that a good place to be?',
      options: [
        { label: 'Yes, it is the strongest angle', correct: false, why: 'It is the direction from which his reachable space looks widest, which is the opposite of what you want from it.' },
        { label: 'It is reasonable but not the strongest', correct: true, why: 'It leaves him the most room, but the directions it leaves him are forward and the two forward diagonals, which move slowly relative to your crosshair and are the easiest to track.' },
        { label: 'No, it is the worst place', correct: false, why: 'It is not the strongest angle, but it is far from the worst. The movement it gives him is the movement that is easiest to follow.' },
      ],
    }, {
      question: 'You move round until you are hugging one of the two walls yourself. What have you done?',
      options: [
        { label: 'Maximised the pressure on him', correct: false, why: 'You have maximised the angle, which is not the same thing. What matters is the difference between the two screens, not how far round you walked.' },
        { label: 'Handed him the same constraint you were using', correct: true, why: 'The walls constrain whoever gets close to them. Pressed against one, your own movement is as cut as his, and the fight is even again.' },
        { label: 'Nothing, walls only restrict the cornered player', correct: false, why: 'A wall does not know who is standing next to it.' },
      ],
    }],
    manipulate: 'Move Blue off the diagonal a little. Then keep going until Blue is hugging one of the two walls.',
    explain: 'A small offset takes Red down to two working inputs. A large one puts Blue against a wall, which hands Red the same advantage over Blue that Blue was trying to take, and the fight evens out.',
    rule: {
      text: 'Against a cornered enemy the useful angles are small ones. The extremes give the corner back to him.',
      why: 'Both walls constrain whoever gets close to them. Any angle large enough to make his position much worse tends to put you somewhere with the same problem.',
    },
    complications: [
      { label: 'Which movement is easy to track', text: 'Forward and the forward diagonals produce slow apparent motion, so more room does not always mean a harder shot. Room matters in proportion to how quickly it can be crossed on your screen.' },
    ],
  },

  'behind-the-corner': {
    predicts: [{
      question: 'Red is fully hidden behind a corner and can step out whenever he likes. Where should Blue stand?',
      options: [
        { label: 'Tight against the same wall', correct: false, why: 'It hides Blue too, but it destroys his own room to move and leaves the timing entirely to Red.' },
        { label: 'Well back from the corner', correct: true, why: 'Distance makes each of Blue\'s steps reveal less, so Blue chooses how much of the hidden space to open and when. Red, standing close, cannot make the same fine adjustment.' },
        { label: 'Directly in line with the corner', correct: false, why: 'That is the widest view of the space he can appear from, which is the most screen to have to watch.' },
      ],
    }, {
      question: 'Neither of you can see any part of the other. What are the two of you actually competing for?',
      options: [
        { label: 'The first shot', correct: false, why: 'There is no shot available to either player yet. Something is still being decided, and it is not aim.' },
        { label: 'Control over how much gets revealed', correct: true, why: 'The position is settled before anyone is visible. Whoever can open the angle more gradually decides when the fight starts and how much of it they show.' },
        { label: 'Nothing, it is a stalemate until someone moves', correct: false, why: 'Someone will move, and the terms on which they move are already set by where you are both standing.' },
      ],
    }, {
      question: 'He is standing one metre from the corner. You are six metres from it. Who is forced to commit first?',
      options: [
        { label: 'He is', correct: true, why: 'Every step he takes uncovers a large slice of ground at once, so he cannot ease into the angle. You can move in increments he has no way to match.' },
        { label: 'You are', correct: false, why: 'Distance is what buys you the small increments. The player pressed up against the corner is the one with no fine control.' },
        { label: 'Neither, it is symmetric', correct: false, why: 'It is about as asymmetric as a standoff gets. The distances are six to one.' },
      ],
    }],
    manipulate: 'Move Blue further from the corner while leaving Red where he is. Compare how much new ground each player uncovers with the same sideways step.',
    explain: 'Nothing here is about hitting anyone yet. Red\'s hittable area is zero and stays zero until he chooses to appear. What Blue is competing for is control over how much gets revealed, and that is decided by distance.',
    rule: {
      text: 'When neither player can shoot yet, the one standing further from the corner controls what gets revealed.',
      why: 'Close to an obstacle a small sideways step swings your sight line a long way past it. Far from it the same step swings the sight line very little, so you can open the angle gradually instead of all at once.',
    },
    complications: [
      { label: 'Third-person camera', text: 'A chase camera lets the hidden player see round the corner without exposing his body, which removes most of the standoff advantage. Reduce the angle rather than press it. Every figure on this page is first person, so switch the camera in the lab to see it.' },
      { label: 'Spread', text: 'Standoff costs you accuracy on the model when he does appear. If the weapon cannot land at that range, some of the distance has to be given back.' },
    ],
  },

  'the-opening': {
    predicts: [{
      question: 'Red is behind a doorway. Does the doorway restrict how he can move?',
      options: [
        { label: 'Yes, it constrains his movement', correct: false, why: 'Stand him a couple of metres back and the wall is nowhere near him. His reachable space is completely unrestricted.' },
        { label: 'No, it only restricts what Blue can see', correct: true, why: 'This is a visibility boundary. His movement is untouched. What the doorway does is decide how much of that movement lands on Blue\'s screen.' },
        { label: 'Both equally', correct: false, why: 'Only if he is standing in the doorway itself. Behind it, the wall is doing nothing to his feet at all.' },
      ],
    }, {
      question: 'You are at 45° with the crosshair on the middle of the doorway. Red pushes through it. What do you have to do?',
      options: [
        { label: 'Flick onto him as he appears', correct: false, why: 'That is what you would need from straight on. From an angle the doorway has already cropped his options down to almost nothing.' },
        { label: 'Almost nothing', correct: true, why: 'He walks into the place you are already aiming. The visible part of his reachable space is barely wider than he is, so there is very little for him to appear in that is not already covered.' },
        { label: 'Back off to widen your view', correct: false, why: 'Widening the view is the opposite of what the angle bought you.' },
      ],
    }],
    manipulate: 'Set Blue at roughly 45° to the doorway and put the crosshair on the middle of the opening rather than on Red.',
    explain: 'From an angle, the doorway crops the visible part of his reachable space down to something close to the size of his body. There is very little screen left for him to appear in that is not already under the crosshair, so pushing through costs him.',
    rule: {
      text: 'An opening does not restrict movement. It restricts which movement you can see, which is why you can aim at the gap instead of at the player.',
      why: 'When the visible part of someone\'s reachable space is barely larger than the player, the distinction between aiming at a place and aiming at a person disappears.',
    },
    complications: [
      { label: 'Projectiles', text: 'A projectile with real size sweeps a wider band across the opening than a hitscan line does, so angling is worth more, not less.' },
      { label: 'Who is further out', text: 'The reveal-control rule applies to the doorway as well. If he is further from the opening than you are, he is managing the exposure and you are the one showing yourself.' },
    ],
  },

  'the-rock': {
    predicts: [{
      question: 'Red is behind a freestanding rock. How many reference directions does his reachable space have?',
      options: [
        { label: 'One, straight at the rock', correct: false, why: 'Straight on is where the rock hides the most. It is close to the worst direction, not the reference one.' },
        { label: 'More than one', correct: true, why: 'A freestanding obstacle leaves a maximum on either side of it, which is exactly why a rock plays differently from a wall. There is no single angle to take.' },
        { label: 'None, it is unconstrained', correct: false, why: 'The rock genuinely cuts into his reachable space when he is close to it. The curve is not flat.' },
      ],
    }, {
      question: 'The rock is small enough that Red can cross from one side to the other in a fraction of a second. Should you commit to a side?',
      options: [
        { label: 'Yes, always pick a side and hold it', correct: false, why: 'That works when the obstacle is large. Here he changes sides faster than you can reposition, so a commitment is just a guess.' },
        { label: 'No, he can switch faster than you can answer', correct: true, why: 'Committing only pays when crossing costs him real time. A small rock does not, so you keep the wider orbit and let him be the one to show.' },
        { label: 'Only if you close the distance first', correct: false, why: 'Closing in makes his crossing cheaper relative to yours, not more expensive.' },
      ],
    }],
    manipulate: 'Enlarge the rock using the variant button, then compare the shape of the curve with the small-rock version.',
    explain: 'A rock much larger than his reachable space stops being one obstacle and becomes two independent corners: it takes him real time to travel from one side to the other, so you can commit to a side. A small rock does not give you that, because he can switch sides faster than you can reposition.',
    rule: {
      text: 'Cover you can walk around is only one obstacle if it is small. Once it is larger than the space someone can cross, it is two separate corners and you may commit to a side.',
      why: 'What matters is not the size of the obstacle in metres but its size compared with how far the player behind it can travel in the time you need to react.',
    },
    complications: [
      { label: 'Third-person camera', text: 'From far out a chase camera sees round the rock, so committing to a side becomes a guess rather than a plan. Switch the camera in the lab to compare.' },
      { label: 'Baiting', text: 'Orbiting at a wider radius than his keeps the reveal-control advantage while still inviting the peek.' },
    ],
  },

  'high-ground-low': {
    predicts: [{
      question: 'Red is on a low ledge above Blue. Blue is on the floor at mid range. Should Blue move closer to the wall under the ledge, or further away?',
      options: [
        { label: 'Further away, for better control', correct: false, why: 'That is the corner rule, and this is not a corner. Backing off gives Blue more sight of Red but also gives Red more of Blue.' },
        { label: 'Closer to the wall', correct: true, why: 'Here the wall is hiding Blue rather than hiding what Blue wants to see. Closing in cuts how much of Blue is visible faster than it cuts how much of Red is.' },
        { label: 'Distance makes no difference', correct: false, why: 'It changes both sightlines, and it does not change them by the same amount, which is the whole content of this case.' },
      ],
    }, {
      question: 'You are pressed against the wall under the ledge. What does Red have to do to shoot you?',
      options: [
        { label: 'Nothing, he can already see you', correct: false, why: 'From back on the platform the lip of the floor is in his way, which is the whole reason being close to the wall helped.' },
        { label: 'Come forward to the edge', correct: true, why: 'And at the edge he is showing far more of himself than you are of yourself, which is the trade the position was built to force.' },
        { label: 'Back away from the edge', correct: false, why: 'Backing off hides him further. It is a good move for him, but it does not get him a shot.' },
      ],
    }],
    manipulate: 'Walk Blue in toward the wall, then swap the camera and check what Red can see of Blue at each distance.',
    explain: 'Two different surfaces are doing the work. The wall is Blue\'s obstacle and the edge of the floor is Red\'s. Moving Blue toward the wall trades away some view of Red in exchange for a larger reduction in what Red can see of Blue.',
    rule: {
      text: 'Distance from cover is not good or bad in itself. Ask whose sightline the cover is controlling.',
      why: 'When cover sits between you and the enemy, standing back gives you control of the reveal. When cover is hiding your own body, standing close is what reduces your exposure. The same wall does opposite jobs depending on which side of it you are on.',
    },
    complications: [
      { label: 'Falling', text: 'A player at the edge of a drop treats the edge as solid, because falling is worse than being stopped. That is why the ledge cuts his reachable space at all.' },
      { label: 'Head-shot multipliers', text: 'Close in, the only part of Blue that Red can see may be a head. A multiplier can hand Red the trade even though Blue is the one who is barely visible.' },
    ],
  },

  'high-ground-high': {
    predicts: [{
      question: 'The ledge is now much higher. Does the advice from the low-ledge case change?',
      options: [
        { label: 'Yes, it reverses', correct: false, why: 'Nothing reverses. The same two surfaces are doing the same two jobs.' },
        { label: 'No, but the distances move', correct: true, why: 'Same structure, further out along every axis. Blue has to get considerably closer to the wall to gain anything, and considerably further away to make the two sightlines comparable.' },
        { label: 'No, it is identical', correct: false, why: 'The shape is identical but the useful positions are not, which matters if you are pacing it by eye in a real map.' },
      ],
    }, {
      question: 'Both of you are pressed against your respective surfaces on a tall ledge. What is Red actually able to see of you?',
      options: [
        { label: 'Most of your body', correct: false, why: 'At that angle the lip of the floor is cutting almost all of you out of his view.' },
        { label: 'Not much more than your head', correct: true, why: 'Which is exactly where a head-shot multiplier stops being a detail. You are hard to hit and expensive to be hit by.' },
        { label: 'Nothing at all', correct: false, why: 'If he could see nothing there would be no fight. He can see the part of you that is worth the most to him.' },
      ],
    }],
    manipulate: 'Compare the same standoff distances against the low-ledge version, and notice how much further Blue has to commit in either direction.',
    explain: 'Raising the wall steepens the vertical angle, so a given step changes what each player can see by more. The crossover between favourable and unfavourable moves outward.',
    rule: {
      text: 'Height does not change which surface is helping whom. It changes how far you have to commit before it matters.',
      why: 'Steeper geometry amplifies the effect of every metre of standoff, so an amount of movement that was decisive at a low ledge can be negligible at a high one.',
    },
    complications: [
      { label: 'Head-shot multipliers', text: 'At close range the low player may be showing nothing but a head. With a two-times multiplier that means landing twice as many shots to break even.' },
    ],
  },

  'high-ground-corner': {
    predicts: [{
      question: 'Red stands exactly on the corner of a raised platform, where two edges meet. Is that a good place for him?',
      options: [
        { label: 'Yes, he covers both approaches', correct: false, why: 'He can see both, but both edges are cutting his reachable space at once. It is the most constrained point on the platform.' },
        { label: 'No, it is the worst point available', correct: true, why: 'Two edges constrain him simultaneously. He is better off playing around the corner, using each edge in turn, than standing on the place where both apply.' },
        { label: 'It makes no difference', correct: false, why: 'Compare the reachable space there with the same player a few metres along either edge and the difference is obvious.' },
      ],
    }, {
      question: 'Red slides from edge A across to edge B while the fight is happening. What happens to the side of the map you want to be on?',
      options: [
        { label: 'It stays where it is', correct: false, why: 'The favourable zone is defined against whichever edge he is using, so it moves when he does.' },
        { label: 'It swings through a right angle', correct: true, why: 'The two edges meet at ninety degrees, so the zone you want jumps from one side of the corner to the other. If you cannot follow it faster than he can walk, he denies you indefinitely.' },
        { label: 'It reverses completely', correct: false, why: 'A full reversal would need the edges to be opposed. They are perpendicular, so the swing is ninety degrees.' },
      ],
    }],
    manipulate: 'Slide Red along one edge, away from the corner, and watch where the reference direction goes. Then slide him to the other edge.',
    explain: 'Away from the corner it is an ordinary ledge and the reference direction is square to whichever edge he is nearest. As he crosses to the other edge, that direction swings through ninety degrees, which means the side of the map you want to be on changes while the fight is happening.',
    rule: {
      text: 'When an enemy can move between two edges, the angle you want moves with him. Play close enough that you can change sides faster than he can.',
      why: 'The favourable zone is defined relative to the edge he is currently using. If you are far away, repositioning takes longer than his walk between edges, and he denies the angle indefinitely.',
    },
    complications: [
      { label: 'Range', text: 'At long range this degenerates into a straight aim duel, because neither player can change the geometry faster than the other can react.' },
    ],
  },

  'the-slope': {
    predicts: [{
      question: 'Red is standing mid-slope. Blue is on flat ground in front of it. Who is better off?',
      options: [
        { label: 'Blue, he has a clear view', correct: false, why: 'Blue can see him, but Red\'s movement up and down the slope changes his height on Blue\'s screen far more than Blue\'s movement changes anything for Red.' },
        { label: 'Red', correct: true, why: 'Moving on a slope produces vertical movement on the opponent\'s screen as well as horizontal. Red\'s apparent movement is taller than Blue\'s, and his width is no smaller.' },
        { label: 'Even', correct: false, why: 'It would be even on flat ground. The slope is what breaks the symmetry, by adding a vertical component to one player\'s movement and not the other\'s.' },
      ],
    }, {
      question: 'Why is the same amount of movement harder to track on a slope than on flat ground?',
      options: [
        { label: 'The player moves faster downhill', correct: false, why: 'Ground speed is not what changes. Even at identical speed the shot is harder.' },
        { label: 'It moves your crosshair vertically as well as sideways', correct: true, why: 'Flat ground only asks for sideways correction. A slope adds a second axis, and aim is much better practised in one axis than in two.' },
        { label: 'The model is bigger from below', correct: false, why: 'Apparent size is not the issue. The direction the correction has to go in is.' },
      ],
    }],
    manipulate: 'Swap the camera and compare the shape of each player\'s movement region, rather than its area.',
    explain: 'On flat ground the two players\' movement looks the same shape from each other\'s cameras, so only sideways aim correction matters. A slope destroys that: one player\'s steps now move him up and down your screen as well as across it.',
    rule: {
      text: 'On flat ground you only have to correct sideways. Any slope or ledge breaks that, and the player whose movement gains a vertical component is the harder target.',
      why: 'Aim correction is much better practised in one axis than two. Geometry that forces you into the second axis costs you more than the same amount of movement in the first.',
    },
    complications: [
      { label: 'Where the slope ends', text: 'A slope running into flat ground and a slope that is the side of a roof behave differently, because only one of them has a distance at which the vertical extents match again.' },
      { label: 'Close range', text: 'Close in, a slope also acts as a ledge: approach from the side and it hides your lower body while it cannot hide his.' },
    ],
  },

  symmetrization: {
    predicts: [{
      question: 'Every situation so far was argued from one side. What happens when you run the same analysis from the other?',
      options: [
        { label: 'It gives the same answer', correct: false, why: 'If it did, no position would ever be advantageous. The whole framework is about the two answers being different.' },
        { label: 'It gives the opposing answer, and both matter', correct: true, why: 'Advantage is the gap between the two analyses. A position is only good if it survives being computed from the other camera as well.' },
        { label: 'It is not worth doing', correct: false, why: 'It is the single most useful habit here, and skipping it is the most common way to talk yourself into a bad position.' },
      ],
    }, {
      question: 'You have found a position with a clear view of Red. Is that enough to call it a good position?',
      options: [
        { label: 'Yes, seeing him is the point', correct: false, why: 'Seeing him is necessary and not sufficient. A clear view of someone who has a clearer view of you is a bad position with good visibility.' },
        { label: 'No, not until you know what he sees of you', correct: true, why: 'Advantage is the gap between the two cameras. Until you have looked at the second one, you have half the information and all of the confidence.' },
        { label: 'Only if he is behind cover', correct: false, why: 'Cover is one of the things that creates the gap, but the gap is what you are actually judging.' },
      ],
    }],
    manipulate: 'Load a composite map and solve the advantage field. Then move Red and solve it again.',
    explain: 'Stacked geometry has no closed-form answer, but the field still resolves into a few favourable pockets, and those pockets have the same shapes the individual situations predict: an angle off your own cover, held at a range where the enemy\'s edge is still cutting his movement.',
    rule: {
      text: 'Any advantage you think you have must survive swapping the cameras. If it does not, it is not an advantage.',
      why: 'Almost everything that constrains an opponent constrains you too. What makes a position good is not that his geometry is bad, but that his is worse than yours.',
    },
    complications: [],
  },
};
