import * as THREE from 'three/webgpu';

export const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * The golden angle, 2π/φ² ≈ 137.507°. Turning by this amount between successive
 * points is the only rotation that never repeats and never leaves a gap — which
 * is why sunflowers, pinecones and pineapples all use it, and why the visible
 * spiral-arm counts in those patterns are always Fibonacci numbers.
 */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Phyllotaxis: n points on a disc, each turned by the golden angle from the
 * last and placed at radius ∝ √i so the area per point stays constant.
 */
export function phyllotaxis(n, radius, out) {
  const pts = out || [];
  pts.length = 0;
  for (let i = 0; i < n; i++) {
    const theta = i * GOLDEN_ANGLE;
    const r = radius * Math.sqrt((i + 0.5) / n);
    pts.push({ x: Math.cos(theta) * r, y: Math.sin(theta) * r, t: i / n, r });
  }
  return pts;
}

/**
 * The logarithmic spiral that grows by φ every quarter turn — the true
 * "golden spiral", not the quarter-circle approximation drawn from squares.
 *
 *      r(θ) = a · φ^(2θ/π)
 *
 * `rise` lifts it out of the plane into a helix, which is what the same growth
 * law looks like in three dimensions: a nautilus rather than a drawing of one.
 */
export function goldenSpiral(turns, segments, scale, rise, phase, pool) {
  const pts = [];
  const total = turns * Math.PI * 2;
  // The exponent runs 2θ/π, so it advances by 4 per full turn. Subtracting
  // 4·turns normalises the curve to end at exactly `scale` — without that the
  // spiral overshoots by φ^(4·turns), which at three turns is 322×.
  const norm = 4 * turns;
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * total;
    const theta = t + phase;
    const r = scale * Math.pow(PHI, (2 * t) / Math.PI - norm);
    const p = pool();
    p.set(Math.cos(theta) * r, Math.sin(theta) * r, rise * (t / total - 0.5) * scale * 2);
    pts.push(p);
  }
  return pts;
}

/**
 * THE LINK BETWEEN φ AND THE SOLIDS
 *
 * This is the part that makes Fibonacci belong here rather than sit beside the
 * rest as decoration. The twelve vertices of an icosahedron are exactly
 *
 *      (0, ±1, ±φ),  (±1, ±φ, 0),  (±φ, 0, ±1)
 *
 * — the corners of three mutually perpendicular golden rectangles. The
 * dodecahedron, its dual, is built from the same number. So the golden ratio is
 * not merely *associated* with the Platonic solids that Metatron's Cube
 * contains: two of the five are constructed out of it. Drawing the rectangles
 * inside the icosahedron shows that directly.
 */
export function goldenRectangles(scale) {
  const a = scale;
  const b = scale * PHI;
  const rect = (axis) => {
    const c = [];
    for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      if (axis === 0) c.push(new THREE.Vector3(0, s1 * a, s2 * b));
      else if (axis === 1) c.push(new THREE.Vector3(s1 * a, s2 * b, 0));
      else c.push(new THREE.Vector3(s2 * b, 0, s1 * a));
    }
    return c;
  };
  return [rect(0), rect(1), rect(2)];
}
