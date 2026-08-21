/**
 * THE TOROID
 *
 * The shape a field makes when it feeds itself: flow rises through the centre,
 * turns over at the top, falls around the outside and returns through the
 * middle again. It is the only closed form where every streamline passes
 * through the same central point, which is why it keeps turning up wherever
 * something is drawn as self-sustaining.
 *
 * Each streamline here is a curve on the torus that advances `windings` times
 * around the small circle for every one turn around the large one. At integer
 * windings the lines close after a single lap; at non-integer they precess and
 * take several laps to close, which is what makes the surface read as flowing
 * rather than as a wireframe.
 *
 * The axis is Z — the same axis the mandala turns on — so the flow goes out
 * through the face of the pattern and back around behind it.
 */
export function toroidStreamline(major, minor, windings, phase, laps, segments, pool) {
  const pts = [];
  const total = Math.PI * 2 * laps;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * total;
    const theta = t;                        // around the ring
    const phi = t * windings + phase;       // around the tube
    const rad = major + minor * Math.cos(phi);
    const p = pool();
    p.set(Math.cos(theta) * rad, Math.sin(theta) * rad, minor * Math.sin(phi));
    pts.push(p);
  }
  return pts;
}

/**
 * A streamline closes only when `windings · laps` is a whole number. Snapping to
 * the nearest whole turn keeps the curve a closed loop, so pulses travelling it
 * never hit a discontinuity.
 */
export function lapsFor(windings, maxLaps = 5) {
  for (let l = 1; l <= maxLaps; l++) {
    if (Math.abs(windings * l - Math.round(windings * l)) < 1e-3) return l;
  }
  return maxLaps;
}

/**
 * How many points a streamline needs.
 *
 * The tube winding is the demanding part, not the ring: a streamline making
 * `windings · laps` poloidal turns has to sample every one of them, and a
 * circle drawn with fewer than about twenty points reads as a polygon. A fixed
 * count therefore aliases into a zigzag as soon as the winding count climbs —
 * at 7.5 windings over 2 laps, 128 points gives only 8.5 per turn, which is
 * what turned the torus into a mangled figure rather than a donut.
 *
 * `budget` caps it so a strand carrying many streamlines cannot overrun the
 * instance buffer it was allocated.
 */
export function toroidPoints(windings, laps, budget, min = 96, max = 384) {
  const turns = Math.abs(windings) * laps;
  const wanted = Math.ceil(Math.max(turns * 28, laps * 72));
  return Math.max(min, Math.min(wanted, max, budget));
}
