/**
 * params.js — the numbers that turn "a fight" into geometry.
 *
 * Defaults are Overwatch-flavoured because that is the game AIMER7 was
 * writing about: 5.5 m/s base run speed, ~0.98 m jump apex, 103° horizontal
 * FOV. The 300 ms time-scale is the paper's own (§2.2): "the time-scale of
 * fights is considered to be of the order of 300 milliseconds".
 */

export const DEFAULT_PARAMS = {
  // --- movement ---------------------------------------------------------
  speed: 5.5,          // m/s, ground speed
  dt: 0.30,            // s, the fight time-scale — the paper's 300 ms
  strafeRatio: 1.0,    // sideways speed / forward speed (1 = isotropic game)
  backRatio: 1.0,      // backward speed / forward speed
  jump: 0.98,          // m, jump apex
  domeShape: 'cap',    // 'cap' = the dome of Figure 3 | 'cylinder' = strict

  // --- the model --------------------------------------------------------
  bodyRadius: 0.30,    // m
  bodyHeight: 1.80,    // m, standing
  crouchHeight: 1.05,  // m
  headRadius: 0.14,    // m
  eyeHeight: 1.62,     // m

  // --- the camera -------------------------------------------------------
  // Horizontal field of view. A competitive player runs wide, but a wide
  // frame also shrinks the thing the figure is about: at 103 the enemy and
  // their movement room came to about 2% of the picture.
  fov: 90,             // degrees, horizontal
  camera: 'fps',       // 'fps' | 'tps'
  tpsBack: 2.2,        // m, chase-camera distance
  tpsUp: 0.55,         // m
  tpsShoulder: 0.78,   // m, lateral offset. Wide enough that the camera sits
                       // clear of the body rather than half behind it.
  tpsSide: 1,          // +1 right shoulder, -1 left

  // --- the weapon (only used by the damage overlay, not by the paper) ----
  spread: 0.0,         // degrees, half-angle of the shot cone
  dps: 120,
  headshotMult: 2.0,
  hp: 200,
  projectileRadius: 0.0, // m — > 0 turns the weapon into a rocket

  // --- solver -----------------------------------------------------------
  domeGrid: 41,        // cells across the player-disk
  bufW: 132,           // solver framebuffer
  bufH: 92,
  samplesAngle: 180,   // rose resolution
  noFall: true,        // "any good player knows it is very easy to get hit
                       //  while falling" — §4.6(2)
};

/** Radius of the player-disk: 300 ms × v. */
export const diskRadius = (p) => p.speed * p.dt;

/** Forward/backward and lateral semi-axes of the (possibly elliptic) disk. */
export function diskAxes(p) {
  const r = diskRadius(p);
  return { fwd: r, back: r * p.backRatio, side: r * p.strafeRatio };
}

