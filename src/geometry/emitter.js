import * as THREE from 'three/webgpu';
import { GOLDEN_ANGLE } from './fibonacci.js';

/**
 * PURE GEOMETRY
 *
 * Radial emission from the centre: rays out, cones riding them, and rows of
 * spheres released one after another along each arm.
 *
 * Arm directions blend between two distributions:
 *
 *   spread 0 — an even ring in the mandala's own plane, the classic flat
 *              radiance of a rose window.
 *   spread 1 — the Fibonacci sphere: latitudes spaced so every point owns an
 *              equal band of area, longitudes turned by the golden angle. It is
 *              the same 137.507° that packs the sunflower, used here to pack a
 *              sphere, so the emission stays evenly spread at any arm count
 *              instead of clumping at the poles the way a naive lat/long grid does.
 */
export function armDirection(i, n, spread, out) {
  const ringA = (i / n) * Math.PI * 2;
  const rx = Math.cos(ringA);
  const ry = Math.sin(ringA);

  // Fibonacci sphere
  const z = 1 - ((2 * i + 1) / n);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const sa = i * GOLDEN_ANGLE;
  const sx = Math.cos(sa) * r;
  const sy = Math.sin(sa) * r;

  return out.set(
    rx + (sx - rx) * spread,
    ry + (sy - ry) * spread,
    z * spread,
  ).normalize();
}
