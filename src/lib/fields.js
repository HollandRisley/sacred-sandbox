import * as THREE from 'three/webgpu';

/**
 * Base for instanced "fields" of identical primitives.
 *
 * Instance colour doubles as per-instance opacity throughout: every material
 * here is additive over a dark void, so scaling a colour toward black fades the
 * instance out. That holds for the pearlescent materials too — at metalness 1
 * the diffuse term is black and the reflection is tinted by the instance
 * colour, so the same trick dims the sheen.
 */
export class Field extends THREE.InstancedMesh {
  constructor(geometry, material, max, { color = 0xffffff } = {}) {
    super(geometry, material, max);
    this.frustumCulled = false;
    this.count = 0;
    this.baseColor = new THREE.Color(color);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();

    this.setColorAt(0, this.baseColor);
    this.instanceColor.needsUpdate = true;
  }

  _writeColor(i, fade, tint) {
    this._c.copy(tint || this.baseColor).multiplyScalar(Math.max(fade, 0));
    this.setColorAt(i, this._c);
  }

  _commit(count) {
    this.count = count;
    this.instanceMatrix.needsUpdate = true;
    if (this.instanceColor) this.instanceColor.needsUpdate = true;
  }
}

/** Additive emissive material — the "neon" look, for linework and pulses. */
export function neonMaterial(opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Thin-film iridescent metal. It carries almost no colour of its own: what you
 * see is the environment map bent through a fresnel, which is what makes it
 * read as pearl or oil-slick rather than as painted plastic.
 */
export function pearlMaterial(opacity = 0.5) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    // Part-metal, not full metal: at metalness 1 the instance colour tints the
    // reflection completely and every surface comes out one flat hue. Holding
    // it near half lets the environment's own colours through, which is what
    // makes the thin-film shift visible as the surface turns.
    metalness: 0.5,
    roughness: 0.14,
    iridescence: 1,
    iridescenceIOR: 1.85,
    iridescenceThicknessRange: [180, 860],
    envMapIntensity: 2.2,
    transparent: true,
    opacity,
    // Normal blending, unlike the linework: a translucent solid has twenty
    // overlapping faces and additive would drive the middle of every shape to
    // white. Occluding reads as glass; adding reads as a blown highlight.
    // depthWrite stays off so the surfaces do not clip the energy behind them.
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Rings drawn as instanced tori — already tubes, so already glowing volume. */
export class RingField extends Field {
  constructor(max, opts = {}) {
    const tube = opts.tube ?? 0.014;
    super(new THREE.TorusGeometry(1, tube, 5, opts.segments ?? 72), opts.material || neonMaterial(opts.opacity ?? 1), max, opts);
  }

  /** @param {Array<{pos, radius, quat?, fade?, tint?}>} rings */
  set(rings) {
    const n = Math.min(rings.length, this.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const r = rings[i];
      this._s.setScalar(r.radius);
      this._m.compose(r.pos, r.quat || this._q.identity(), this._s);
      this.setMatrixAt(i, this._m);
      this._writeColor(i, r.fade ?? 1, r.tint);
    }
    this._commit(n);
  }
}

/**
 * Cones, each aimed along a direction rather than positioned by a matrix the
 * caller has to build. three.js builds cones pointing +Y, so the quaternion
 * turns that onto the requested axis.
 */
export class ConeField extends Field {
  constructor(max, opts = {}) {
    super(
      new THREE.ConeGeometry(0.5, 1, opts.radialSegments ?? 14, 1, true),
      opts.material || neonMaterial(opts.opacity ?? 1),
      max,
      opts,
    );
    this._axis = new THREE.Vector3();
  }

  /** @param {Array<{pos, dir, length, width, fade?, tint?}>} cones */
  set(cones) {
    const n = Math.min(cones.length, this.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const c = cones[i];
      this._axis.copy(c.dir).normalize();
      this._q.setFromUnitVectors(CONE_UP, this._axis);
      this._s.set(c.width, c.length, c.width);
      this._m.compose(c.pos, this._q, this._s);
      this.setMatrixAt(i, this._m);
      this._writeColor(i, c.fade ?? 1, c.tint);
    }
    this._commit(n);
  }
}

const CONE_UP = new THREE.Vector3(0, 1, 0);

/** Spheres — lattice nodes, polytope vertices, pulses. */
export class SphereField extends Field {
  constructor(max, opts = {}) {
    const seg = opts.segments ?? [20, 14];
    super(
      new THREE.SphereGeometry(1, seg[0], seg[1]),
      opts.material || neonMaterial(opts.opacity ?? 1),
      max,
      opts,
    );
    this.material.wireframe = opts.wireframe ?? false;
  }

  /** @param {Array<{pos, radius, fade?, tint?}>} spheres */
  set(spheres) {
    const n = Math.min(spheres.length, this.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const s = spheres[i];
      this._s.setScalar(s.radius);
      this._m.compose(s.pos, this._q.identity(), this._s);
      this.setMatrixAt(i, this._m);
      this._writeColor(i, s.fade ?? 1, s.tint);
    }
    this._commit(n);
  }
}
