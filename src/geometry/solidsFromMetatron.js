import * as THREE from 'three/webgpu';
import { toMetatronFrame } from './metatron.js';
import { PHI } from './fibonacci.js';

/**
 * THE FIVE SOLIDS, DERIVED FROM METATRON'S CUBE
 *
 * The usual claim is that the five Platonic solids are "found in" Metatron's
 * Cube. Checked against the actual point set, that is not quite what happens —
 * and the truth is better, because every one of the five comes out *exactly*,
 * just not all in the same way.
 *
 * Metatron's three-dimensional form is the cuboctahedron: twelve vertices, all
 * permutations of (±1, ±1, 0), each the same distance from the centre as from
 * its neighbours. Searching it exhaustively:
 *
 *   regular tetrahedra whose four vertices are among the twelve ...... 0
 *   regular octahedra  whose six  vertices are among the twelve ...... 0
 *
 * So **no** Platonic solid is a vertex subset of the figure. What is true:
 *
 *   OCTAHEDRON    the 6 square-face centres, exactly (±1,0,0) and permutations
 *   CUBE          the 8 triangular-face centres, exactly (±⅔,±⅔,±⅔)
 *   TETRAHEDRON   4 alternating corners of that cube — the other 4 give its
 *                 twin, which is the merkaba
 *   ICOSAHEDRON   the twelve vertices themselves, golden-stretched (below)
 *   DODECAHEDRON  the icosahedron's dual; 8 of its 20 vertices coincide with
 *                 the cube taken from the triangular face centres
 *
 * All five therefore sit inside the figure's circumsphere and share points with
 * it — three by way of its faces, one by way of its vertices, one by duality.
 *
 * THE GOLDEN STRETCH
 *
 * The cuboctahedron's twelve vertices are three mutually perpendicular *squares*
 * lying in the coordinate planes. An icosahedron's twelve vertices are three
 * mutually perpendicular *golden rectangles*. So one is the other with each
 * square stretched along one axis:
 *
 *      (±1, ±t, 0), (0, ±1, ±t), (±t, 0, ±1)
 *
 *      t = 1  →  exactly the cuboctahedron   (24 shortest edges)
 *      t = φ  →  exactly a regular icosahedron (30 shortest edges)
 *
 * Normalising by √2/√(1+t²) holds the circumradius fixed, so the icosahedron
 * opens out of Metatron's own vertices and stays inscribed in the same sphere
 * rather than growing past it. The endpoints are exact; the path between them is
 * this stretch, not Fuller's rigid-triangle jitterbug, which reaches the same
 * two shapes by a different route.
 */

const T_ICOSA = PHI;

/** Cuboctahedron: every permutation of (±1, ±1, 0). */
function cuboctahedron() {
  const v = [];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      for (const si of [-1, 1]) {
        for (const sj of [-1, 1]) {
          const p = [0, 0, 0];
          p[i] = si;
          p[j] = sj;
          v.push(p);
        }
      }
    }
  }
  return v;
}

/**
 * Circumradius at which the regular icosahedron's vertices land exactly on the
 * golden sections of the derived octahedron's edges: √(1+φ²)/φ².
 */
const GOLDEN_FIT_R = Math.sqrt(1 + PHI * PHI) / (PHI * PHI);

/**
 * The stretched twelve. The *shape* runs cuboctahedron → regular icosahedron,
 * and the *size* runs with it, because the two exact positions are not the
 * same size:
 *
 *   jitter 0  circumradius √2      — the vertices are Metatron's own twelve
 *   jitter 1  circumradius √(1+φ²)/φ²
 *                                  — the vertices are on the golden sections of
 *                                    the derived octahedron's twelve edges
 *
 * Holding the radius at √2 the whole way, as this first did, keeps the start
 * exact and leaves the end sitting on nothing — which reads as the icosahedron
 * being misaligned when it is only mis-scaled. Interpolating the radius makes
 * both ends exact and turns the morph into the figure drawing inward onto the
 * octahedron's edges. Only the endpoints are exact; the path between is a blend.
 */
function stretched(t, jitter = null) {
  const j = jitter === null ? (t - 1) / (PHI - 1) : jitter;
  const target = Math.SQRT2 + (GOLDEN_FIT_R - Math.SQRT2) * Math.min(Math.max(j, 0), 1);
  const k = target / Math.sqrt(1 + t * t);
  const v = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      v.push([a * k, t * b * k, 0]);
      v.push([0, a * k, t * b * k]);
      v.push([t * b * k, 0, a * k]);
    }
  }
  return v;
}


const CUBOCT = cuboctahedron();

/** Centres of the 6 square faces — exactly the vertices of an octahedron. */
const OCTA_RAW = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const OCTA = OCTA_RAW;

/** The derived octahedron's 12 edges, as endpoint pairs. */
export const OCTA_EDGES = (() => {
  const out = [];
  for (let i = 0; i < OCTA_RAW.length; i++) {
    for (let j = i + 1; j < OCTA_RAW.length; j++) {
      const a = OCTA_RAW[i];
      const b = OCTA_RAW[j];
      if (Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - Math.SQRT2) < 1e-9) {
        out.push([a, b]);
      }
    }
  }
  return out;
})();

/** Centres of the 8 triangular faces — exactly the corners of a cube. */
const CUBE = (() => {
  const out = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    out.push([(x * 2) / 3, (y * 2) / 3, (z * 2) / 3]);
  }
  return out;
})();



/** Alternating cube corners: product of signs positive gives one tetrahedron. */
const TETRA = CUBE.filter((p) => p[0] * p[1] * p[2] > 0);

/**
 * Dodecahedron, scaled so its eight cube-corner vertices land exactly on the
 * cube drawn from the triangular face centres.
 */
const DODECA = (() => {
  const s = 2 / 3;
  const inv = 1 / PHI;
  const out = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    out.push([x * s, y * s, z * s]);
  }
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    out.push([0, a * inv * s, b * PHI * s]);
    out.push([a * inv * s, b * PHI * s, 0]);
    out.push([a * PHI * s, 0, b * inv * s]);
  }
  return out;
})();

/**
 * The cuboctahedron's faces, as index lists into CUBOCT. Detected from the
 * geometry rather than hard-coded: triangles are triples all one edge apart,
 * squares are quads with four edges and two long diagonals.
 */
function faces() {
  const dd = (a, b) => Math.hypot(...[0, 1, 2].map((k) => CUBOCT[a][k] - CUBOCT[b][k]));
  const E = Math.SQRT2;
  const idx = CUBOCT.map((_, i) => i);
  const tri = [];
  const sq = [];

  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      for (let c = b + 1; c < 12; c++) {
        if (Math.abs(dd(a, b) - E) < 1e-9 && Math.abs(dd(a, c) - E) < 1e-9
          && Math.abs(dd(b, c) - E) < 1e-9) tri.push([a, b, c]);
      }
    }
  }
  for (const combo of combinations(idx, 4)) {
    const ds = [];
    for (const [a, b] of combinations(combo, 2)) ds.push(dd(a, b));
    ds.sort((x, y) => x - y);
    if (ds.slice(0, 4).every((x) => Math.abs(x - E) < 1e-9)
      && ds.slice(4).every((x) => Math.abs(x - 2) < 1e-9)) sq.push(combo);
  }
  return { tri, sq };
}

function* combinations(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield [...acc]; return; }
  for (let i = start; i < arr.length; i++) {
    acc.push(arr[i]);
    yield* combinations(arr, k, i + 1, acc);
    acc.pop();
  }
}

const FACES = faces();
const centroid = (f) => [0, 1, 2].map((k) => f.reduce((t, i) => t + CUBOCT[i][k], 0) / f.length);

/**
 * Which of Metatron's faces a solid's vertices are the centres of. This is the
 * whole claim made visible: turn the markers on and each corner of the cube is
 * sitting in the middle of one of the eight triangles.
 */
export function sourceFaces(kind) {
  if (kind === 'octa') return FACES.sq;
  if (kind === 'hexa' || kind === 'dodeca') return FACES.tri;
  if (kind === 'tetra') {
    return FACES.tri.filter((f) => {
      const c = centroid(f);
      return c[0] * c[1] * c[2] > 0;
    });
  }
  return null;   // the icosahedron uses the vertices themselves, not the faces
}

export const FACE_INDEX = FACES;

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * For every vertex of a derived solid, what it actually relates to on Metatron.
 * Three outcomes, and the difference between them is the whole point:
 *
 *   onVertex  the vertex IS one of Metatron's twelve — nothing to draw
 *   exact     it is the exact centroid of a Metatron face; spokes run out to
 *             that face's corners, which is the relationship made visible
 *   neither   it sits on no feature at all. Spokes then run to its three
 *             nearest vertices, but they are proximity lines and nothing more.
 *
 * That last case is real and worth seeing: twelve of the dodecahedron's twenty
 * vertices land on no Metatron feature of any kind — not a vertex, not a face
 * centre, not an edge midpoint. Drawing them the same way as the exact ones
 * would be dressing a coincidence up as a derivation.
 */
export function spokeMap(kind, jitter) {
  const raw = kind === 'icosa'
    ? stretched(1 + jitter * (T_ICOSA - 1), jitter)
    : DERIVED[kind].verts;
  const allFaces = [...FACES.tri, ...FACES.sq];

  return raw.map((v) => {
    for (let i = 0; i < CUBOCT.length; i++) {
      if (dist3(v, CUBOCT[i]) < 1e-9) {
        return { how: 'onVertex', exact: true, targets: [] };
      }
    }
    for (const f of allFaces) {
      if (dist3(v, centroid(f)) < 1e-9) {
        return { how: 'faceCentre', exact: true, targets: f.map((i) => CUBOCT[i]) };
      }
    }
    // On one of the derived octahedron's edges? That is where a regular
    // icosahedron's vertices land, at the golden section of each edge.
    for (const [a, b] of OCTA_EDGES) {
      const ab = dist3(a, b);
      if (Math.abs(dist3(a, v) + dist3(v, b) - ab) < 1e-9) {
        return { how: 'octaEdge', exact: true, targets: [a, b] };
      }
    }
    const near = CUBOCT
      .map((p, i) => ({ p, d: dist3(v, p) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 3)
      .map((o) => o.p);
    return { how: 'nearest', exact: false, targets: near };
  });
}

/** How many of a solid's vertices sit on a Metatron feature, and how many do not. */
export function shareTally(kind, jitter) {
  const map = spokeMap(kind, jitter);
  const count = (how) => map.filter((m) => m.how === how).length;
  return {
    total: map.length,
    onVertex: count('onVertex'),
    onFace: count('faceCentre'),
    onOctaEdge: count('octaEdge'),
    unrelated: count('nearest'),
  };
}

/** Largest vertex radius, for reporting how far into the hull a solid reaches. */
export function solidReach(kind, jitter) {
  const raw = kind === 'icosa'
    ? stretched(1 + jitter * (T_ICOSA - 1), jitter)
    : DERIVED[kind].verts;
  let m = 0;
  for (const p of raw) m = Math.max(m, Math.hypot(p[0], p[1], p[2]));
  return m * Math.SQRT2;
}

export const METATRON_REACH = 2;

/** Pairs at minimum separation — the polyhedron's own edges. */
function minimalEdges(verts) {
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
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

// The icosahedron's edge topology is taken at t = φ and held while the vertices
// move, so the stretch shows the icosahedron's own structure settling onto the
// cuboctahedron's points rather than the edge set popping between the two.
const ICOSA_EDGES = minimalEdges(stretched(T_ICOSA));

export const DERIVED = {
  tetra: { verts: TETRA, edges: minimalEdges(TETRA), from: '4 alternating corners of the cube on the triangular face centres — the other 4 are the merkaba’s twin' },
  hexa: { verts: CUBE, edges: minimalEdges(CUBE), from: 'the 8 triangular-face centres, exactly' },
  octa: { verts: OCTA, edges: minimalEdges(OCTA), from: 'the 6 square-face centres, exactly' },
  dodeca: { verts: DODECA, edges: minimalEdges(DODECA), from: 'dual of the icosahedron; 8 of its 20 vertices are the cube’s' },
  icosa: { verts: null, edges: ICOSA_EDGES, from: 'the 12 vertices themselves, golden-stretched — at Jitterbug 0 they are Metatron’s own points' },
};

/** Metatron's own twelve, for showing where the icosahedron comes from. */
export const CUBOCT_VERTS = CUBOCT;

/**
 * Vertices of a derived solid, in Metatron's frame.
 * `jitter` runs 0 → 1, carrying the icosahedron from the cuboctahedron to
 * regular; it has no effect on the other four.
 */
export function derivedVerts(kind, jitter, pool) {
  const raw = kind === 'icosa'
    ? stretched(1 + jitter * (T_ICOSA - 1), jitter)
    : DERIVED[kind].verts;
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    out.push(toMetatronFrame(p[0], p[1], p[2], pool ? pool[i] : undefined));
  }
  return out;
}
