import * as THREE from 'three/webgpu';

/**
 * METATRON'S CUBE, THROUGH THREE DIMENSIONS
 *
 * The flat thirteen-circle figure is only the two-dimensional case of a family.
 * In each dimension there is exactly one arrangement where the distance from
 * the centre to a neighbour equals the distance between neighbours — every
 * vertex the same remove from the centre and from each other. It is the
 * "vector equilibrium" of that dimension:
 *
 *      2D   6 around 1     hexagon          the Fruit of Life, drawn flat
 *      3D  12 around 1     cuboctahedron    thirteen spheres, twelve kissing one
 *      4D  24 around 1     24-cell          the only regular 4-polytope
 *                                           with no 3D analogue
 *
 * The chain is exact where it matters: the 24-cell's vertices are every
 * permutation of (±1, ±1, 0, 0), and the twelve of those with w = 0 are every
 * permutation of (±1, ±1, 0) — which is precisely a cuboctahedron. So the 3D
 * figure is a genuine cross-section of the 4D one, not an analogy.
 *
 * The step from the cuboctahedron down to the flat Fruit of Life is a *morph*,
 * not a projection, and is the one place this is a designed transition rather
 * than a derivation: the cuboctahedron's shadow along its three-fold axis gives
 * two hexagons whose radii are in the ratio √3, while the Fruit of Life's are
 * in the ratio 2. The figure therefore twists by 30° as it lifts, which is the
 * honest difference between the two showing itself rather than being hidden.
 */

/**
 * The frame every Metatron-derived object must share: the rotation that puts
 * the body diagonal on +Z, and the scale that sets the circumradius to 2.
 * Anything built axis-aligned and pushed through this lands exactly on the
 * figure's own points.
 */
export const METATRON_Q = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(1, 1, 1).normalize(),
  new THREE.Vector3(0, 0, 1),
);
export const METATRON_SCALE = Math.SQRT2;

export function toMetatronFrame(x, y, z, out) {
  return (out || new THREE.Vector3())
    .set(x, y, z)
    .applyQuaternion(METATRON_Q)
    .multiplyScalar(METATRON_SCALE);
}

/** All 24 vertices of the 24-cell: every permutation of (±1, ±1, 0, 0). */
function cell24Vertices() {
  const v = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (const si of [-1, 1]) {
        for (const sj of [-1, 1]) {
          const p = [0, 0, 0, 0];
          p[i] = si;
          p[j] = sj;
          v.push(p);
        }
      }
    }
  }
  return v;
}

/**
 * Build the point set once. Each entry carries where it sits in the flat
 * figure, where it sits in the solid, and where it sits in 4-space, so the
 * Dimension control is a straight interpolation at draw time.
 */
function buildPoints() {
  const raw = cell24Vertices();

  const pts = raw.map((p) => {
    const xyz = toMetatronFrame(p[0], p[1], p[2]);
    return { solid: [xyz.x, xyz.y, xyz.z, p[3] * METATRON_SCALE], hasW: p[3] !== 0 };
  });

  // The twelve with w = 0 are the cuboctahedron, and they are the only ones the
  // flat figure has anywhere to put. Sort them into the near-axis six and the
  // equatorial six, then match each ring to the Fruit ring of the same size.
  const flatable = pts.filter((p) => !p.hasW);
  const radius = (p) => Math.hypot(p.solid[0], p.solid[1]);
  const angle = (p) => Math.atan2(p.solid[1], p.solid[0]);
  const sorted = [...flatable].sort((a, b) => radius(a) - radius(b));
  const inner = sorted.slice(0, 6).sort((a, b) => angle(a) - angle(b));
  const outer = sorted.slice(6).sort((a, b) => angle(a) - angle(b));

  // Fruit of Life rings: six at radius 1, six at radius 2, on the lattice axes.
  const ring = (r, offset) => Array.from({ length: 6 }, (_, i) => {
    const a = ((i + offset) / 6) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r, 0, 0];
  });
  const fruitInner = ring(1, 0);
  const fruitOuter = ring(2, 0);

  inner.forEach((p, i) => { p.flat = fruitInner[i]; });
  outer.forEach((p, i) => { p.flat = fruitOuter[i]; });
  for (const p of pts) if (!p.flat) p.flat = p.solid;   // the w-bearing twelve never flatten

  // The centre sphere completes the thirteen.
  return [{ solid: [0, 0, 0, 0], flat: [0, 0, 0, 0], hasW: false, centre: true }, ...pts];
}

export const METATRON_POINTS = buildPoints();

/**
 * Position and visibility of every point at a given Dimension.
 *  dim 2 → the flat thirteen
 *  dim 3 → the cuboctahedron
 *  dim 4 → the full 24-cell
 * The w-bearing twelve fade in across 3→4, so the count runs 13 → 13 → 25.
 */
export function metatronAt(dim, out) {
  const lift = Math.min(Math.max(dim - 2, 0), 1);
  const open = Math.min(Math.max(dim - 3, 0), 1);

  for (let i = 0; i < METATRON_POINTS.length; i++) {
    const src = METATRON_POINTS[i];
    const o = out[i];
    for (let k = 0; k < 4; k++) {
      o.p[k] = src.flat[k] + (src.solid[k] - src.flat[k]) * lift;
    }
    // Only the fourth coordinate waits for the fourth dimension to open.
    o.p[3] *= open;
    o.weight = src.hasW ? open : 1;
  }
  return out;
}

export function makeSlots() {
  return METATRON_POINTS.map(() => ({ p: [0, 0, 0, 0], weight: 0 }));
}
