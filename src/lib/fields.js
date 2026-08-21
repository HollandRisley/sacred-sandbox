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
    metalness: 0.42,
    // Rougher than a mirror on purpose: at 0.14 the specular collapsed to a hard
    // glint on a glassy shell, which is most of what made these read as bubbles.
    roughness: 0.34,
    iridescence: 1,
    iridescenceIOR: 1.85,
    iridescenceThicknessRange: [180, 860],
    envMapIntensity: 1.7,
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

/**
 * MATTER — an opaque, lit surface.
 *
 * Everything else here is transparent, which is why the emitted particles were
 * layering wrongly: an InstancedMesh cannot sort its own instances, so with
 * `depthWrite: false` the draw order decides what covers what and a distant
 * particle painted over a near one.
 *
 * This writes depth and is not transparent at all, so it renders in the opaque
 * pass and the depth buffer sorts it exactly. It also reads as solid rather than
 * glassy, which is the point — iridescence and a bright environment keep it
 * looking like energy that has become matter rather than like plastic.
 */
export function matterMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.45,
    roughness: 0.18,
    iridescence: 1,
    iridescenceIOR: 1.9,
    iridescenceThicknessRange: [140, 900],
    envMapIntensity: 2.4,
    emissive: 0x000000,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

/**
 * EMBER — pure light, no surface. Additive, so it never occludes and never
 * needs sorting; the trade is that it has no solidity at all.
 */
export function emberMaterial(opacity = 0.9) {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
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
