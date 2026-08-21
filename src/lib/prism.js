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
      // Beyond it: hue sweeps violet → red as the radius grows, the short
      // wavelengths bent hardest and so sitting innermost.
      const core = Math.max(0, 1 - t / 0.22);
      const spectral = Math.min(Math.max((t - 0.16) / 0.84, 0), 1);
      c.setHSL(0.78 - spectral * 0.78, 1, 0.55);

      const falloff = (1 - t) ** 2.2;
      const r = c.r * (1 - core) + core;
      const g = c.g * (1 - core) + core;
      const b = c.b * (1 - core) + core;

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

let sharedTexture = null;

export class PrismHalo extends THREE.InstancedMesh {
  constructor(max) {
    if (!sharedTexture) sharedTexture = spectrumTexture();
    const material = new THREE.MeshBasicMaterial({
      map: sharedTexture,
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
