import * as THREE from 'three/webgpu';

/**
 * Colour schemes. Each palette carries:
 *  - ink:  four line/geometry colours, in the order rings, joins, solid, polytope
 *  - lamp: two point-light colours that put speculars on the pearlescent surfaces
 *  - sky:  the blobs painted into the environment map, which is what the
 *          iridescent materials actually reflect — so this is where most of the
 *          perceived colour of the piece comes from
 */
export const PALETTES = [
  {
    id: 'spore',
    name: 'Spore',
    ink: ['#a855f7', '#22e08a', '#e879f9', '#7cf03d'],
    lamp: ['#9d4edd', '#2bf59a'],
    sky: ['#1b0b3a', '#7b1fd6', '#0d5c3a', '#3fe38a', '#c026d3'],
  },
  {
    id: 'ayahuasca',
    name: 'Ayahuasca',
    ink: ['#c084fc', '#ffd166', '#22d3a7', '#f0508a'],
    lamp: ['#7c3aed', '#f59e0b'],
    sky: ['#12042a', '#4c1d95', '#065f46', '#b45309', '#be185d'],
  },
  {
    id: 'amanita',
    name: 'Amanita',
    ink: ['#ff5a5f', '#fff2d8', '#ffc94d', '#7fd36b'],
    lamp: ['#ff4d4d', '#ffe0a3'],
    sky: ['#1d0508', '#9f1239', '#c2410c', '#f5deb3', '#3f6212'],
  },
  {
    id: 'dmt',
    name: 'Breakthrough',
    ink: ['#ff2fd0', '#c6ff00', '#00e5ff', '#ffb300'],
    lamp: ['#ff00c8', '#aeff00'],
    sky: ['#12001f', '#ff00aa', '#00d4ff', '#b6ff00', '#ff7a00'],
  },
  {
    id: 'void',
    name: 'Void',
    ink: ['#7fd8ff', '#a5b4fc', '#93c5fd', '#c4b5fd'],
    lamp: ['#3b82f6', '#a78bfa'],
    sky: ['#04060d', '#1e3a8a', '#312e81', '#0e7490', '#1e1b4b'],
  },
];

/** Palette colour → THREE.Color, with the global hue shift folded in. */
export function inkColor(palette, index, hueShift) {
  const c = new THREE.Color(palette.ink[index % palette.ink.length]);
  if (hueShift) c.offsetHSL(hueShift, 0, 0);
  return c;
}

/**
 * Paint an equirectangular environment as soft blobs of palette colour on near
 * black. Used both as the backdrop and as the reflection source — the
 * pearlescent sheen is literally this image bent around the geometry, so it
 * matters more than any material parameter.
 */
export function skyTexture(palette, hueShift) {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const shifted = palette.sky.map((hex) => {
    const c = new THREE.Color(hex);
    if (hueShift) c.offsetHSL(hueShift, 0, 0);
    return `#${c.getHexString()}`;
  });

  ctx.fillStyle = shifted[0];
  ctx.fillRect(0, 0, W, H);

  // Deterministic placement: a fixed spiral of blobs, so the same palette always
  // produces the same sky and nothing flickers between rebuilds.
  // Dense, bright and overlapping. This image is the reflection source for the
  // pearlescent surfaces, so it needs enough colour variation across it that a
  // sphere picks up several hues at once — a sparse dark sky reflects as a
  // sparse dark sphere and the sheen disappears.
  ctx.filter = 'blur(38px)';
  ctx.globalCompositeOperation = 'lighter';
  const blobs = 26;
  for (let i = 0; i < blobs; i++) {
    const t = i / blobs;
    const x = ((t * 5.3) % 1) * W;
    const y = H * (0.12 + 0.76 * ((i * 0.37) % 1));
    const r = H * (0.18 + 0.26 * ((i * 0.61) % 1));
    const hex = shifted[1 + (i % (shifted.length - 1))];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hex);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
