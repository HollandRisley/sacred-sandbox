import * as THREE from 'three/webgpu';
import { PHI } from './fibonacci.js';
import { toMetatronFrame } from './metatron.js';
import { CUBOCT_VERTS } from './solidsFromMetatron.js';

/**
 * SPIRALS THAT FIT METATRON
 *
 * Metatron's three-dimensional form has exactly four hexagonal great circles —
 * the vector equilibrium's four hexagons — each holding six of the twelve
 * vertices at exactly 60° spacing, all at the same radius.
 *
 * That last part is the constraint. A logarithmic spiral r = a·b^θ can only
 * return to the same radius if b = 1, which is a circle. **No growing spiral
 * passes through two vertices of the same hexagon.** Worth stating plainly
 * before building the thing that does work.
 *
 * What works exactly: choose the growth so the spiral crosses a vertex *ray*
 * every 60°, multiplying its radius by φ each time.
 *
 *      r(θ) = a · φ^(3θ/π)
 *
 *      θ =   0°   60°   120°   180°   240°
 *      r/a =  1     φ     φ²     φ³     φ⁴
 *
 * It passes through one vertex where a is the hexagon's radius, and thereafter
 * through those same six directions at golden-ratio-spaced radii — inward to
 * the centre, outward without limit. Growth over a full turn is φ⁶ ≈ 17.94,
 * which is why it leaves the figure fast and reads as heading into deep space.
 *
 * This is the hexagonal sibling of the familiar golden spiral: that one is φ per
 * quarter turn (r = a·φ^(2θ/π)) because it is built on a square; this is φ per
 * sixth of a turn because it is built on a hexagon.
 */

/** Growth exponent: φ per 60°. */
const K = 3 / Math.PI;

/** The four 3-fold axes, each normal to one of the four hexagons. */
const AXES = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]];

function buildHexagons() {
  const out = [];
  for (const a of AXES) {
    const n = toMetatronFrame(a[0], a[1], a[2]).normalize();
    const inPlane = CUBOCT_VERTS
      .map((v) => toMetatronFrame(v[0], v[1], v[2]))
      .filter((v) => Math.abs(v.dot(n)) < 1e-9);
    if (inPlane.length !== 6) continue;      // not a hexagon; skip rather than fudge
    const e1 = inPlane[0].clone().normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    out.push({ n, e1, e2, radius: inPlane[0].length() });
  }
  return out;
}

export const HEXAGONS = buildHexagons();

/**
 * One spiral. Steps are counted in 60° units, so each is a factor of φ in
 * radius either side of the vertex it starts from.
 */
export function metatronSpiral(hexIndex, startVertex, stepsIn, stepsOut, perStep, scale, pool, cursor) {
  const hex = HEXAGONS[hexIndex % HEXAGONS.length];
  if (!hex) return [];
  const pts = [];
  const total = (stepsIn + stepsOut) * perStep;
  const phase = (startVertex * Math.PI) / 3;

  for (let i = 0; i <= total; i++) {
    if (cursor.i >= pool.length) break;
    const step = -stepsIn + (i / perStep);
    const theta = (step * Math.PI) / 3;
    const r = hex.radius * scale * Math.pow(PHI, K * theta);
    const p = pool[cursor.i++];
    p.copy(hex.e1)
      .multiplyScalar(Math.cos(theta + phase) * r)
      .addScaledVector(hex.e2, Math.sin(theta + phase) * r);
    p.step = step;
    pts.push(p);
  }
  return pts;
}
