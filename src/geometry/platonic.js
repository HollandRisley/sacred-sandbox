import * as THREE from 'three/webgpu';

/**
 * The five Platonic solids, in the order they are traditionally read out of
 * Metatron's Cube. Each carries its edge list (as vertex pairs) so it can be
 * fed to the same EnergyLines renderer as everything else.
 */
const DEFS = [
  { id: 'none', name: 'None', geo: null },
  { id: 'tetra', name: 'Tetrahedron', geo: () => new THREE.TetrahedronGeometry(1), faces: 4, element: 'Fire' },
  { id: 'hexa', name: 'Cube', geo: () => new THREE.BoxGeometry(1.15, 1.15, 1.15), faces: 6, element: 'Earth' },
  { id: 'octa', name: 'Octahedron', geo: () => new THREE.OctahedronGeometry(1), faces: 8, element: 'Air' },
  { id: 'dodeca', name: 'Dodecahedron', geo: () => new THREE.DodecahedronGeometry(1), faces: 12, element: 'Aether' },
  { id: 'icosa', name: 'Icosahedron', geo: () => new THREE.IcosahedronGeometry(1), faces: 20, element: 'Water' },
];

export const SOLIDS = DEFS.map((d) => {
  if (!d.geo) return { ...d, edges: [], geometry: null };

  const geometry = d.geo();
  // A high angle threshold collapses the triangulation three.js uses internally
  // back down to the solid's true polygonal edges.
  const edgeGeo = new THREE.EdgesGeometry(geometry, 1);
  const pos = edgeGeo.getAttribute('position');
  const edges = [];
  for (let i = 0; i < pos.count; i += 2) {
    edges.push([
      new THREE.Vector3().fromBufferAttribute(pos, i),
      new THREE.Vector3().fromBufferAttribute(pos, i + 1),
    ]);
  }
  edgeGeo.dispose();
  return { ...d, geometry, edges };
});
