import * as THREE from 'three/webgpu';

/**
 * THE SINGULARITY
 * ===============
 *
 * The Flower of Life is made of circles. The Hopf fibration turns points into
 * circles. Composing them gives a single continuous map that carries the flat
 * figure into four dimensions and back, and it is the mathematical spine of
 * this whole piece:
 *
 *      plane R²  ──σ⁻¹──▸  S²  ──h⁻¹──▸  S³ ⊂ R⁴  ──R(θ)──▸  R⁴  ──σ──▸  R³
 *      a lattice          a point        a circle      rotated      a knot
 *       node             on the           in 4-space   in 6 planes   in space
 *                        sphere
 *
 * Read left to right:
 *
 * 1. σ⁻¹ — inverse stereographic projection lifts each lattice node from the
 *    plane onto the unit 2-sphere. Stereographic projection is conformal and
 *    circle-preserving, so the Flower's circles arrive on the sphere still
 *    circles. Nothing is distorted; the figure is only wrapped.
 *
 * 2. h⁻¹ — the Hopf fibration h: S³ → S² is the map whose *preimage of a single
 *    point is an entire great circle* of S³. So every lattice node — a
 *    zero-dimensional thing — becomes a one-dimensional circle living in four
 *    dimensions. Nearby nodes give circles that are linked, every pair with
 *    linking number exactly 1. The Flower's centres become a chain mail.
 *
 * 3. R(θ) — the same six-plane rotation the polytopes use. Turning the XW, YW
 *    and ZW dials moves the fibres through 4-space, so the core writhes under
 *    the identical controls that drive the hypercube. They are not two effects
 *    that happen to sit near each other; they are one 4D rotation seen through
 *    two different lifts.
 *
 * 4. σ — stereographic projection back down to R³, where the fibres appear as
 *    Villarceau circles: perfect round circles lying on nested tori, each one
 *    threaded through every other.
 *
 * The centre of the flower maps to the north pole of S², whose fibre is the
 * unit circle in the first complex coordinate — that is the still point the
 * whole structure turns around.
 */

/**
 * σ⁻¹ : R² → S². Origin goes to the north pole; the plane's point at infinity
 * goes to the south pole. `spread` sets how much of the sphere the lattice
 * covers — small values crowd everything near the pole, large values wrap it
 * right around.
 */
export function planeToSphere(u, v, spread, out) {
  const x = u * spread;
  const y = v * spread;
  const r2 = x * x + y * y;
  const d = 1 + r2;
  return out.set((2 * x) / d, (2 * y) / d, (1 - r2) / d);
}

/**
 * THE MANDALA IS NOT A PLANE
 *
 * The Flower of Life is normally drawn flat, which is a limitation of paper
 * rather than of the figure. Step 1 of the chain above already knows how to fix
 * that: σ⁻¹ carries the plane onto a sphere, and because it is *conformal* it
 * preserves circles and preserves tangency — every circle stays a circle, and
 * every pair that touched still touches. The pattern is not projected onto a
 * dome, it is genuinely wrapped, and nothing about it is distorted.
 *
 * Returns the local length scale of the map at that point, so a circle's radius
 * can be carried across with its centre. `amount` blends flat → wrapped.
 */
export function wrapToSphere(p, amount, sphereR, k, normal) {
  const u = p.x * k;
  const v = p.y * k;
  const r2 = u * u + v * v;
  const d = 1 + r2;
  const sx = (2 * u) / d;
  const sy = (2 * v) / d;
  const sz = (1 - r2) / d;
  if (normal) normal.set(sx, sy, sz);

  // Depth in the flat figure becomes height along the *normal*, not along world
  // z. Adding it to z instead slid the entire shell sideways — at three layers
  // that was an offset of 96% of the sphere's own radius, which is why the
  // wrapped figure sat off to one side of everything else instead of sharing
  // its centre. Radially, the stacked layers become concentric shells.
  _target.set(sx, sy, sz).multiplyScalar(sphereR + p.z);
  p.lerp(_target, amount);

  const conformal = (k * sphereR * 2) / d;
  return 1 + amount * (conformal - 1);
}

const _target = new THREE.Vector3();

/**
 * h⁻¹ : one point of the Hopf fibre over (sx, sy, sz) ∈ S², at angle θ.
 *
 * Writing R⁴ as C² and a fibre as { (α·e^{iθ}, β·e^{iθ}) }, the standard
 * section over a point of S² is
 *
 *      α = √((1+z)/2),      β = (x − i·y) / √(2(1+z))
 *
 * which satisfies |α|² + |β|² = 1 identically, so the fibre lands on S³ exactly
 * rather than approximately. The denominator vanishes only at the south pole,
 * z = −1, which `spread` keeps the lattice clear of.
 */
export function fibrePoint(sx, sy, sz, theta, out4) {
  const s = Math.sqrt(Math.max(2 * (1 + sz), 1e-9));
  const alpha = s / 2;          // √((1+z)/2)
  const br = sx / s;
  const bi = -sy / s;
  const c = Math.cos(theta);
  const sn = Math.sin(theta);

  out4[0] = alpha * c;
  out4[1] = alpha * sn;
  out4[2] = br * c - bi * sn;
  out4[3] = br * sn + bi * c;
  return out4;
}

/**
 * σ : S³ → R³, projecting from the pole (0,0,0,1). This is the step that turns
 * the fibres into the visible linked circles; the pole is the point that gets
 * sent to infinity, so fibres passing near it swing out wide.
 */
export function stereo4to3(p4, out) {
  const d = 1 - p4[3];
  const k = 1 / (Math.abs(d) < 1e-4 ? 1e-4 : d);
  return out.set(p4[0] * k, p4[1] * k, p4[2] * k);
}

/**
 * A fibre swinging near the projection pole runs off to infinity. Hard-clamping
 * the divide makes points snap; compressing the *radius* through tanh instead
 * is smooth, monotonic, and agrees with the true projection near the origin, so
 * the core stays bounded without visibly bending the geometry you can see.
 *
 *      r' = R·tanh(r/R)      r' ≈ r for r ≪ R,   r' → R as r → ∞
 */
export function softRadius(v, R) {
  const r = v.length();
  if (r < 1e-6) return v;
  return v.multiplyScalar((R * Math.tanh(r / R)) / r);
}

/**
 * Build the full fibre over a lattice node as a closed polyline in R³.
 * `rotate` receives the 4D point and may turn it before projection.
 */
export function buildFibre(u, v, spread, segments, rotate, pool, maxRadius = 4.5) {
  const s = _sphere;
  planeToSphere(u, v, spread, s);
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    fibrePoint(s.x, s.y, s.z, theta, _p4);
    if (rotate) rotate(_p4);
    const out = pool();
    stereo4to3(_p4, out);
    softRadius(out, maxRadius);
    pts.push(out);
  }
  return pts;
}

const _sphere = new THREE.Vector3();
const _p4 = [0, 0, 0, 0];
