import * as THREE from 'three/webgpu';
import { Field, neonMaterial } from './fields.js';
import { PrismHalo } from './prism.js';

const UP = new THREE.Vector3(0, 1, 0);
const ALT = new THREE.Vector3(1, 0, 0);
const WHITE = new THREE.Color(0xffffff);

/**
 * How the travelling particles behave. Each style is the same machinery —
 * a head running the path with a trail of followers behind it — tuned into a
 * different substance.
 *
 *  trail   followers behind each head
 *  gap     spacing between them, as a fraction of the path
 *  taper   how fast the trail shrinks and dims toward its end
 *  flicker depth of the per-particle brightness noise
 *  wobble  lateral sway, perpendicular to the path
 *  swell   slow size pulsing along the run
 *  hot     how far the head is pushed toward white
 */
export const PULSE_STYLES = [
  { id: 'bead', name: 'Beads', trail: 1, gap: 0, taper: 0, flicker: 0, wobble: 0, swell: 0, size: 1, speed: 1, hot: 0.15 },
  { id: 'fluoro', name: 'Fluoro beams', trail: 4, gap: 0.006, taper: 0.55, flicker: 1, wobble: 0.12, swell: 0, size: 0.8, speed: 1.9, hot: 0.75 },
  { id: 'flame', name: 'Licking flames', trail: 7, gap: 0.009, taper: 0.85, flicker: 0.7, wobble: 0.55, swell: 0.15, size: 1.15, speed: 1.35, hot: 0.6 },
  { id: 'honey', name: 'Liquid honey', trail: 5, gap: 0.005, taper: 0.25, flicker: 0.06, wobble: 0, swell: 0.4, size: 1.7, speed: 0.4, hot: 0.05 },
];

/**
 * BEAM — lines drawn by movement rather than fixed in space.
 *
 * Shared by every line layer, so one setting governs the whole piece. Rather
 * than scattering thousands of small particles along a path and hoping they read
 * as a line, this lights only a travelling *window* of the line's own geometry.
 * The comet therefore follows the path exactly — every curve, every spiral —
 * because it *is* the path.
 *
 *   tail 0   a two-segment dash: one particle racing the track
 *   tail 1   window covers the whole path and the falloff exponent reaches
 *            zero, so every segment is fully lit — a beam end to end, pixel
 *            for pixel what a solid line was before
 *
 * One slider spans both, and 1 is the default, so this changes nothing until
 * it is turned down.
 */
export const BEAM = { time: 0, tail: 1, count: 1, speed: 0.16 };

/** Cheap deterministic hash — flicker that is random-looking but reproducible. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A glowing line as three coincident instanced layers:
 *
 *   core  — a thin, bright tube
 *   halo  — the same tube several times wider and very faint
 *   pulse — small spheres travelling along the path
 *
 * Additive blending means the halo accumulates into a soft 3D bloom around the
 * core from every viewing angle, which a screen-space blur cannot do — the glow
 * has real depth and occludes correctly against the rest of the scene.
 *
 * Input is *paths*, not edges: a path is a polyline (optionally closed), which
 * is what lets a pulse travel along a whole circle or chain rather than
 * flickering between disconnected segments.
 */
export class EnergyLines extends THREE.Group {
  constructor(maxSegments, maxPulses, opts = {}) {
    super();
    this.radius = opts.radius ?? 0.011;
    this.haloScale = opts.haloScale ?? 4.5;
    this.pulseSize = opts.pulseSize ?? 0.05;
    // Matches whatever speed multiplier this layer's pulses are given, so the
    // comet head and the particle sitting on it travel together.
    this.beamSpeed = 1;

    // Open-ended cylinders: the caps are never visible inside a continuous run
    // and they are half the triangles.
    const tube = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);

    this.core = new SegmentLayer(tube, neonMaterial(opts.coreOpacity ?? 0.9), maxSegments);
    this.halo = new SegmentLayer(tube, neonMaterial(opts.haloOpacity ?? 0.1), maxSegments);
    this.pulses = new PulseLayer(maxPulses);
    // Dispersion around every travelling particle. Same positions as the
    // pulses, so it costs one extra instanced quad each and nothing more.
    this.prism = new PrismHalo(maxPulses);
    this.add(this.halo, this.core, this.prism, this.pulses);

    this._paths = [];
    this._segA = [];
    this._segB = [];
    this._segTint = [];
    this._segFade = [];
    this._scratch = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._perp = new THREE.Vector3();
    // Pulses are rebuilt every frame, so their output list and per-particle
    // colours are pooled at capacity rather than allocated per frame.
    this._pulseOut = [];
    this._lastPulses = null;
    this._prismHosts = [];
    this._prismPool = [];
    this._colorPool = Array.from({ length: maxPulses }, () => new THREE.Color());
  }

  /**
   * @param {Array<{pts: THREE.Vector3[], closed?: boolean, tint?: THREE.Color,
   *                fade?: number, pulses?: number, phase?: number}>} paths
   */
  setPaths(paths) {
    this._paths = paths;
    const A = this._segA;
    const B = this._segB;
    const T = this._segTint;
    const F = this._segFade;
    A.length = 0; B.length = 0; T.length = 0; F.length = 0;

    // The beam window is folded in here rather than applied in a second pass:
    // every layer rebuilds its paths each frame anyway, so this costs nothing.
    const beam = BEAM.tail < 0.999;
    const w = 0.02 + BEAM.tail * 0.98;
    const falloff = 2.5 * (1 - BEAM.tail);
    const heads = Math.max(1, Math.round(BEAM.count));

    for (let pi = 0; pi < paths.length; pi++) {
      const path = paths[pi];
      const pts = path.pts;
      const last = path.closed ? pts.length : pts.length - 1;
      const base = path.fade ?? 1;
      const phase = path.phase ?? (pi * 0.6180339887);
      const head = BEAM.time * BEAM.speed * this.beamSpeed + phase;

      for (let i = 0; i < last; i++) {
        // A path may carry its own per-point fades — the spirals use them to
        // dissolve with radius — and the beam multiplies into that.
        let f = base;
        if (path.fades) {
          f *= (path.fades[i] + path.fades[(i + 1) % pts.length]) * 0.5;
        }
        // Per *segment* rather than per point, for chained trails whose every
        // edge carries its own weight — Metatron's short skeleton against its
        // long diagonals, say.
        if (path.segFades) f *= path.segFades[i];
        if (beam) f *= cometFade(head, (i + 0.5) / last, w, falloff, heads);

        A.push(pts[i]);
        B.push(pts[(i + 1) % pts.length]);
        // A path may colour each segment separately. Chaining edges into one
        // travelling trail would otherwise flatten a figure's internal gradient
        // — the hypercube's depth, for one — to a single colour.
        T.push(path.tints ? path.tints[i] : path.tint);
        F.push(f);
      }
    }

    this.core.write(A, B, T, F, this.radius);
    this.halo.write(A, B, T, F, this.radius * this.haloScale, 0.55);
  }

  /**
   * Advance the travelling pulses. `t` is elapsed seconds.
   * @param {object} style one of PULSE_STYLES
   */
  updatePulses(t, speed, perPath, style = PULSE_STYLES[0], sizeMul = 1) {
    const out = this._pulseOut;
    out.length = 0;
    const cap = this.pulses.instanceMatrix.count;

    if (perPath > 0 && speed !== 0) {
      const trail = Math.max(1, Math.round(style.trail));
      for (let p = 0; p < this._paths.length && out.length < cap; p++) {
        const path = this._paths[p];
        const pts = path.pts;
        const n = path.closed ? pts.length : pts.length - 1;
        if (n < 1) continue;
        const count = path.pulses ?? perPath;
        const phase = path.phase ?? (p * 0.6180339887); // golden ratio: even spread, no clumping

        for (let k = 0; k < count && out.length < cap; k++) {
          const head = t * speed * style.speed + phase + k / count;

          for (let j = 0; j < trail && out.length < cap; j++) {
            let u = (head - j * style.gap) % 1;
            if (u < 0) u += 1;
            const f = u * n;
            const i = Math.min(Math.floor(f), n - 1);
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const pos = this._scratch.copy(a).lerp(b, f - i);

            // Flames lick: sway the trail sideways, perpendicular to the run.
            if (style.wobble > 0 && j > 0) {
              this._dir.subVectors(b, a);
              const len = this._dir.length() || 1e-6;
              this._dir.divideScalar(len);
              this._perp.crossVectors(this._dir, Math.abs(this._dir.y) > 0.9 ? ALT : UP).normalize();
              const sway = Math.sin(t * 5.5 + j * 1.4 + p * 2.3 + k) * style.wobble
                * this.pulseSize * sizeMul * (j / trail) * 3;
              pos.addScaledVector(this._perp, sway);
            }

            // A closed path has no start or end, so the mid-flight brightness
            // curve would only put a dark notch at the seam.
            const along = path.closed ? 1 : 0.45 + 0.55 * Math.sin(u * Math.PI);
            const back = j / trail;
            const decay = 1 - style.taper * back;
            const flick = style.flicker > 0
              ? 1 - style.flicker * 0.85 * hash(Math.floor(t * 17) + p * 13.1 + k * 7.3 + j * 3.7)
              : 1;
            const swell = style.swell > 0 ? 1 + style.swell * Math.sin(u * Math.PI * 4 + t * 1.7) : 1;

            const c = this._colorPool[out.length];
            c.copy(path.tint || this.pulses.baseColor);
            if (style.hot > 0) c.lerp(WHITE, style.hot * (1 - back));

            out.push({
              x: pos.x, y: pos.y, z: pos.z,
              r: this.pulseSize * sizeMul * style.size * decay * swell * (0.7 + 0.6 * along),
              fade: (path.fade ?? 1) * along * decay * flick,
              tint: c,
            });
          }
        }
      }
    }
    this.pulses.write(out);
    this._lastPulses = out;
  }

  /** Draw the prism corona on whatever the pulses last produced. */
  updatePrism(camera, strength, scale) {
    if (strength <= 0.004 || !this._lastPulses || !this._lastPulses.length) {
      this.prism.count = 0;
      return;
    }
    this.prism.faceCamera(camera);
    const src = this._lastPulses;
    const hosts = this._prismHosts;
    hosts.length = 0;
    for (let i = 0; i < src.length; i++) {
      // Host slots are pooled alongside the pulses: this runs every frame for
      // every particle, so cloning a vector each time would be thousands of
      // allocations a second.
      let slot = this._prismPool[i];
      if (!slot) { slot = { pos: new THREE.Vector3(), radius: 0, fade: 0 }; this._prismPool[i] = slot; }
      slot.pos.set(src[i].x, src[i].y, src[i].z);
      slot.radius = src[i].r;
      slot.fade = src[i].fade;
      hosts.push(slot);
    }
    this.prism.set(hosts, scale, strength);
  }

  setRadius(r) { this.radius = r; }

  /** The paths currently drawn. */
  get paths() { return this._paths; }

  applyTint(color) {
    this.core.baseColor.copy(color);
    this.halo.baseColor.copy(color);
    this.pulses.baseColor.copy(color);
  }

  setOpacity(core, halo, pulse) {
    this.core.material.opacity = core;
    this.halo.material.opacity = halo;
    this.pulses.material.opacity = pulse;
  }
}

class SegmentLayer extends Field {
  constructor(geometry, material, max) {
    super(geometry, material, max);
    this._d = new THREE.Vector3();
  }

  write(A, B, tints, fades, radius, fadeScale = 1) {
    const n = Math.min(A.length, this.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const a = A[i];
      const b = B[i];
      this._d.subVectors(b, a);
      const len = this._d.length() || 1e-6;
      this._q.setFromUnitVectors(UP, this._d.divideScalar(len));
      this._p.addVectors(a, b).multiplyScalar(0.5);
      // Slight overlap on length so consecutive segments meet without a seam.
      this._s.set(radius, len * 1.02, radius);
      this._m.compose(this._p, this._q, this._s);
      this.setMatrixAt(i, this._m);
      this._writeColor(i, fades[i] * fadeScale, tints[i]);
    }
    this._commit(n);
  }
}

class PulseLayer extends Field {
  constructor(max) {
    // Modest, not minimal: most particles are a few pixels across and would be
    // fine at 6×4, but the honey style makes them large enough that the facets
    // read as hexagons.
    super(new THREE.SphereGeometry(1, 10, 7), neonMaterial(1), max);
  }

  write(list) {
    const n = Math.min(list.length, this.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      this._p.set(p.x, p.y, p.z);
      this._s.setScalar(p.r);
      this._m.compose(this._p, this._q.identity(), this._s);
      this.setMatrixAt(i, this._m);
      this._writeColor(i, p.fade, p.tint);
    }
    this._commit(n);
  }
}

/**
 * Brightness of a segment at `u` given a head at `h`. Distance is measured
 * backwards from the head and wrapped, so the window runs off the end of a
 * closed path and back onto its start without a seam.
 */
function cometFade(h, u, w, falloff, heads) {
  let best = 0;
  for (let k = 0; k < heads; k++) {
    let d = (h + k / heads - u) % 1;
    if (d < 0) d += 1;
    if (d >= w) continue;
    const f = 1 - d / w;
    // falloff 0 means no gradient at all: the window is uniformly lit, which is
    // what makes a full-length tail identical to a solid line.
    best = Math.max(best, falloff <= 0.001 ? 1 : f ** falloff);
  }
  return best;
}
