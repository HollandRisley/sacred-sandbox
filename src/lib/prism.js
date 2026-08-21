import * as THREE from 'three/webgpu';

/**
 * PRISM GLOW
 *
 * Not a rainbow-shaped object — a rainbow *of light*. What a prism or a crystal
 * actually does is disperse: it splits one point of white light into a corona
 * whose colour runs by wavelength from the centre outward.
 *
 * So the halo is a camera-facing billboard carrying a radial spectrum: white at
 * the core, then violet through red as the radius grows, alpha falling to
 * nothing at the rim. Drawn additively, overlapping halos sum to white where
 * they are dense and fan into spectrum at their edges, which is exactly how
 * dispersed light behaves.
 *
 * One instanced quad per host point, one draw call. Far cheaper than geometry,
 * and unlike a modelled arc it reads as light rather than as an object.
 */
function spectrumTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const c = new THREE.Color();
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const t = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (t > 1) { img.data[i + 3] = 0; continue; }

      // Core: white, the undispersed light.
      // A wide achromatic core is what makes this read as light rather than as
      // a coloured disc: white-hot at the middle, the spectrum only a fringe.
      // Narrower and every halo carries a muddy tint all the way in.
      const core = Math.max(0, 1 - t / 0.44);
      const spectral = Math.min(Math.max((t - 0.32) / 0.68, 0), 1);

      // HUE IS NOT LINEAR IN RADIUS, AND FOR TWO REASONS.
      //
      // Physically: short wavelengths are bent hardest, so violet crowds into a
      // tight inner band and red rides the outer rim. A linear sweep spreads
      // them evenly in radius instead, which is not what dispersion does.
      //
      // Perceptually: the area of a ring grows with its radius, so a linear
      // sweep puts the middle of the spectrum — green — exactly where most of
      // the pixels are. Integrated over the disc the old profile emitted
      // R 0.18 : G 0.36 : B 0.46. Every halo was a blue-green blob, and once
      // bloom smeared a field of them together the whole piece went sickly.
      //
      // Raising the sweep to a power pulls violet and green into a narrow inner
      // fringe and gives the wide outer rings to orange and red, which is both
      // the true bending order and the thing that balances the disc.
      const hue = 0.72 * (1 - spectral) ** 2.2;
      c.setHSL(hue, 1, 0.55);

      // A saturated hue at full chroma is not equally bright to the eye at
      // every wavelength — green carries ~0.72 of the luminance where blue
      // carries ~0.07 — so an equal-energy spectrum still reads green. Dividing
      // each band by its own relative luminance flattens the perceived weight.
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const k = 0.45 / Math.max(lum, 1e-3);

      // Falloff decoupled from the hue axis. At 2.2 the whole red half of the
      // spectrum was extinguished before it could be seen, which is what left
      // only the cool bands standing.
      const falloff = (1 - t) ** 1.45;

      const r = Math.min(c.r * k, 1) * (1 - core) + core;
      const g = Math.min(c.g * k, 1) * (1 - core) + core;
      const b = Math.min(c.b * k, 1) * (1 - core) + core;

      // Additive blending already multiplies by alpha, so the falloff belongs
      // in the alpha channel only — applying it to the colour too would square
      // it and choke the fringe the balance depends on.
      img.data[i] = Math.round(r * 255);
      img.data[i + 1] = Math.round(g * 255);
      img.data[i + 2] = Math.round(b * 255);
      img.data[i + 3] = Math.round(falloff * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A plain soft corona — no spectrum, just a core falling smoothly to nothing.
 *
 * This is what a point of light actually looks like: no silhouette anywhere. A
 * sphere mesh, however translucent, always has a hard edge where its outline
 * meets the void, and a specular highlight sitting on it — which is why it reads
 * as a bubble rather than as energy. A billboard has no edge to give away.
 */
function softTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.hypot((x - half) / half, (y - half) / half);
      const i = (y * size + x) * 4;
      if (t > 1) { img.data[i + 3] = 0; continue; }
      // Two falloffs summed: a tight core for presence, a wide skirt for the
      // haze. A single curve gives either a hard dot or a formless smudge.
      const core = Math.exp(-(t * t) * 26);
      const skirt = (1 - t) ** 2.6;
      const a = Math.min(core + skirt * 0.55, 1);
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const shared = { prism: null, soft: null };

export class PrismHalo extends THREE.InstancedMesh {
  constructor(max, kind = 'prism') {
    if (!shared[kind]) shared[kind] = kind === 'soft' ? softTexture() : spectrumTexture();
    const material = new THREE.MeshBasicMaterial({
      map: shared[kind],
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 1,
    });
    super(new THREE.PlaneGeometry(1, 1), material, max);
    this.frustumCulled = false;
    this.count = 0;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._parentQ = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.setColorAt(0, new THREE.Color(0xffffff));
  }

  /**
   * Billboards face the camera, but they live inside groups that are themselves
   * turning. Undoing the parent's world rotation once per frame keeps every
   * instance square to the viewer without touching them individually.
   */
  faceCamera(camera) {
    this.getWorldQuaternion(this._parentQ);
    this._q.copy(this._parentQ).invert().multiply(camera.quaternion);
  }

  /** @param {Array<{pos: THREE.Vector3, radius: number, fade?: number}>} hosts */
  set(hosts, scale, strength) {
    const n = Math.min(hosts.length, this.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const h = hosts[i];
      this._s.setScalar(h.radius * scale);
      this._m.compose(h.pos, this._q, this._s);
      this.setMatrixAt(i, this._m);
      const f = (h.fade ?? 1) * strength;
      this._c.setScalar(Math.max(f, 0));
      this.setColorAt(i, this._c);
    }
    this.count = n;
    this.instanceMatrix.needsUpdate = true;
    if (this.instanceColor) this.instanceColor.needsUpdate = true;
  }
}
