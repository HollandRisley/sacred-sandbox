import * as THREE from 'three/webgpu';

export const SQRT3 = Math.sqrt(3);

/**
 * The Flower of Life is a triangular lattice of circles whose spacing equals
 * their radius — every circle passes through the centres of its neighbours.
 * Axial hex coordinates (q, r) are the natural address space for that lattice.
 */
export function axialToVec(q, r, R, out) {
  return (out || new THREE.Vector3()).set(R * (q + r / 2), (R * (r * SQRT3)) / 2, 0);
}

export function hexRing(q, r) {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

/** The six unit steps of the lattice, in order around the ring. */
const DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

export const STAGES = [
  { id: 1, name: 'Unity', blurb: 'One circle. The undivided.' },
  { id: 2, name: 'Vesica Piscis', blurb: 'Two circles, each through the other’s centre. The first relationship — and the √3 that generates everything after it.' },
  { id: 3, name: 'Tripod of Life', blurb: 'Three circles. The first enclosed triangle.' },
  { id: 4, name: 'Seed of Life', blurb: 'Seven circles: a centre and its six neighbours. Six days of the lattice.' },
  { id: 5, name: 'Egg of Life', blurb: 'The Seed lifted off the page — eight spheres at the corners of a cube, two interlocked tetrahedra.' },
  { id: 6, name: 'Fruit of Life', blurb: 'Thirteen circles that no longer touch, at the corners and centre of the hexagon.' },
  { id: 7, name: 'Metatron’s Cube', blurb: 'Every one of the thirteen Fruit centres joined to every other — 78 lines. None of the five Platonic solids is a subset of those points, but all five come out of the figure exactly: three from its face centres, one from its vertices, one by duality.' },
  { id: 8, name: 'Flower of Life', blurb: 'Nineteen complete circles inside two bounding rings. The full classical figure.' },
];

/**
 * Every circle of the 19-circle Flower, tagged with the stage at which it is
 * born. Drawing the whole set once and fading instances in by birth stage lets
 * the stage slider be continuous rather than a rebuild per step.
 */
export function flowerCircles(extent = 2) {
  const cells = [];
  for (let q = -extent; q <= extent; q++) {
    for (let r = -extent; r <= extent; r++) {
      if (hexRing(q, r) <= extent) cells.push([q, r]);
    }
  }

  const isFruitOuter = (q, r) => DIRS.some(([dq, dr]) => dq * 2 === q && dr * 2 === r);

  return cells.map(([q, r]) => {
    const ring = hexRing(q, r);
    let born;
    if (ring === 0) born = 1;                       // Unity
    else if (q === 1 && r === 0) born = 2;          // Vesica
    else if (q === 0 && r === 1) born = 3;          // Tripod
    else if (ring === 1) born = 4;                  // Seed completes
    else if (ring === 2 && isFruitOuter(q, r)) born = 6; // Fruit outer ring
    else born = 8;                                  // Flower fills the gaps, and
                                                    // anything past ring 2 with it
    return { q, r, ring, born, fruit: ring === 0 || ring === 1 || isFruitOuter(q, r) };
  }).sort((a, b) => a.born - b.born);
}

/** The thirteen Fruit of Life centres, in lattice order. */
export function fruitCentres(R) {
  const out = [axialToVec(0, 0, R)];
  for (const [q, r] of DIRS) out.push(axialToVec(q, r, R));
  for (const [q, r] of DIRS) out.push(axialToVec(q * 2, r * 2, R));
  return out;
}

/** All 78 pairwise connections between the Fruit centres. */
export function metatronEdges(R) {
  const c = fruitCentres(R);
  const edges = [];
  for (let i = 0; i < c.length; i++) {
    for (let j = i + 1; j < c.length; j++) edges.push({ a: c[i], b: c[j] });
  }
  return edges;
}

/**
 * Egg of Life: the Seed pattern read as spheres rather than circles. Eight
 * spheres on cube corners, spaced so that edge-adjacent spheres kiss.
 */
export function eggSpheres(R) {
  const h = R / 2;
  const out = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) {
    out.push(new THREE.Vector3(x, y, z));
  }
  return out;
}

/**
 * Offsets for stacking the flat lattice into its close-packed 3D form. Each
 * layer sits in the triangular hollows of the one below (the A-B-A of hexagonal
 * close packing), which is the honest 3D extension of the figure.
 */
export function layerOffset(index, R) {
  const dz = R * Math.sqrt(2 / 3);
  const odd = Math.abs(index) % 2 === 1;
  // Odd layers drop into the hollows; even layers sit back over the base (A-B-A).
  const v = odd
    ? new THREE.Vector3((R / 2) * Math.sign(index), ((R * SQRT3) / 6) * Math.sign(index), 0)
    : new THREE.Vector3(0, 0, 0);
  v.z = dz * index;
  return v;
}
