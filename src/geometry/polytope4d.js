import * as THREE from 'three/webgpu';

/**
 * Regular 4-polytopes as raw vertex lists. A 4D point is a plain
 * [x, y, z, w] array — small enough that objects would only be noise.
 */

function tesseract() {
  const v = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) for (const w of [-1, 1]) {
    v.push([x, y, z, w]);
  }
  return v;
}

function sixteenCell() {
  const v = [];
  for (let axis = 0; axis < 4; axis++) {
    for (const s of [-1, 1]) {
      const p = [0, 0, 0, 0];
      p[axis] = s * Math.SQRT2;
      v.push(p);
    }
  }
  return v;
}

function twentyFourCell() {
  const v = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (const si of [-1, 1]) for (const sj of [-1, 1]) {
        const p = [0, 0, 0, 0];
        p[i] = si;
        p[j] = sj;
        v.push(p);
      }
    }
  }
  return v;
}

function fiveCell() {
  const s = 1 / Math.sqrt(5);
  return [
    [1, 1, 1, -s],
    [1, -1, -1, -s],
    [-1, 1, -1, -s],
    [-1, -1, 1, -s],
    [0, 0, 0, 4 * s],
  ];
}

/**
 * Edges of a regular polytope are exactly the vertex pairs at minimum
 * separation, so one routine covers every shape here.
 */
function minimalEdges(verts) {
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2;
  let min = Infinity;
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) min = Math.min(min, d2(verts[i], verts[j]));
  }
  const edges = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      if (Math.abs(d2(verts[i], verts[j]) - min) < 1e-6) edges.push([i, j]);
    }
  }
  return edges;
}

export const POLYTOPES = [
  { id: 'none', name: 'None', build: () => [] },
  { id: '5cell', name: '5-cell (simplex)', build: fiveCell, note: '5 vertices, 10 edges — the 4D tetrahedron.' },
  { id: 'tesseract', name: 'Tesseract (8-cell)', build: tesseract, note: '16 vertices, 32 edges — the 4D cube.' },
  { id: '16cell', name: '16-cell', build: sixteenCell, note: '8 vertices, 24 edges — the 4D octahedron.' },
  { id: '24cell', name: '24-cell', build: twentyFourCell, note: '24 vertices, 96 edges — no 3D analogue exists.' },
].map((p) => {
  const verts = p.build();
  return { ...p, verts, edges: minimalEdges(verts) };
});

/**
 * Rotate a 4D point in one coordinate plane. In 4D, rotation happens in a
 * plane rather than around an axis — there are six of them, and the three
 * involving w are the ones with no 3D intuition to fall back on.
 */
export function rotatePlane(p, [i, j], angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const a = p[i];
  const b = p[j];
  p[i] = a * c - b * s;
  p[j] = a * s + b * c;
}

export const PLANES = { xy: [0, 1], xz: [0, 2], xw: [0, 3], yz: [1, 2], yw: [1, 3], zw: [2, 3] };

/**
 * Project 4D → 3D by perspective divide along w: the shadow a 4D object casts
 * into our space. `eyeW` is how far "above" 4-space the light sits — as it
 * grows, the projection flattens toward a parallel (isometric) cast.
 */
export function project4to3(p, eyeW, out) {
  // Clamped: as a vertex approaches the 4D viewpoint the divide runs away, and
  // an edge shooting off to infinity reads as a glitch rather than as geometry.
  const k = Math.min(eyeW / Math.max(eyeW - p[3], 0.15), 6);
  return out.set(p[0] * k, p[1] * k, p[2] * k);
}

/** Transient scratch so per-frame projection allocates nothing. */
export const scratch = { a: new THREE.Vector3(), b: new THREE.Vector3() };
