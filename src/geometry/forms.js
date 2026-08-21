import * as THREE from 'three/webgpu';

/**
 * FORMS
 *
 * Shapes for the emitted particles, built once and instanced. Each is
 * normalised so a radius of 1 means the same apparent size whichever form is
 * chosen — otherwise the size slider would mean something different for each.
 */

/** Scale a geometry so its bounding sphere has radius 1, centred on the origin. */
function normalise(geo) {
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);
  geo.computeBoundingSphere();
  const r = geo.boundingSphere.radius || 1;
  geo.scale(1 / r, 1 / r, 1 / r);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A little flower: `petals` petals around a centre, each a domed surface that
 * is pointed at both ends and widest in the middle.
 *
 * Built as one BufferGeometry rather than merged sub-meshes, so the whole flower
 * is a single instanced draw. The petal is a parametric patch:
 *
 *   along   u ∈ [0,1]   distance out from the centre
 *   across  v ∈ [-1,1]  position across the petal
 *   width   sin(πu)     zero at both ends, widest halfway — a petal outline
 *   lift    sin(πu)     domes the petal up out of the plane
 *   curl    v²          turns the edges up, so it holds light like a real petal
 */
export function flowerGeometry(petals = 6, su = 10, sv = 7) {
  const pos = [];
  const idx = [];
  const petalLen = 1;
  const petalWide = 0.42;
  const lift = 0.26;
  const curl = 0.3;

  for (let p = 0; p < petals; p++) {
    const a = (p / petals) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const base = pos.length / 3;

    for (let i = 0; i <= su; i++) {
      const u = i / su;
      const env = Math.sin(Math.PI * u);
      for (let j = 0; j <= sv; j++) {
        const v = (j / sv) * 2 - 1;
        const x = 0.12 + u * petalLen;          // start just off the centre
        const y = v * env * petalWide;
        const z = env * lift + v * v * env * curl;
        pos.push(x * ca - y * sa, x * sa + y * ca, z);
      }
    }

    for (let i = 0; i < su; i++) {
      for (let j = 0; j < sv; j++) {
        const a0 = base + i * (sv + 1) + j;
        const b0 = a0 + sv + 1;
        idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);

  // A small centre so the flower is not hollow where the petals meet.
  const core = new THREE.SphereGeometry(0.17, 12, 8);
  return normalise(mergePositions(geo, core));
}

/**
 * Merge two indexed position-only geometries. Enough for these forms, and
 * avoids pulling in BufferGeometryUtils for two shapes.
 */
function mergePositions(a, b) {
  const pa = a.getAttribute('position');
  const pb = b.getAttribute('position');
  const ia = a.getIndex();
  const ib = b.getIndex();

  const pos = new Float32Array(pa.count * 3 + pb.count * 3);
  pos.set(pa.array.subarray(0, pa.count * 3), 0);
  pos.set(pb.array.subarray(0, pb.count * 3), pa.count * 3);

  const idx = [];
  for (let i = 0; i < ia.count; i++) idx.push(ia.getX(i));
  for (let i = 0; i < ib.count; i++) idx.push(ib.getX(i) + pa.count);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  a.dispose();
  b.dispose();
  return geo;
}

/**
 * A heart, extruded from the bezier outline in the three.js Shape docs, then
 * turned upright and normalised. Rotated π about X because the shape is drawn
 * point-up in screen coordinates, which is point-down once it becomes geometry.
 */
export function heartGeometry() {
  const s = new THREE.Shape();
  const x = 0;
  const y = 0;
  s.moveTo(x + 5, y + 5);
  s.bezierCurveTo(x + 5, y + 5, x + 4, y, x, y);
  s.bezierCurveTo(x - 6, y, x - 6, y + 7, x - 6, y + 7);
  s.bezierCurveTo(x - 6, y + 11, x - 3, y + 15.4, x + 5, y + 19);
  s.bezierCurveTo(x + 12, y + 15.4, x + 16, y + 11, x + 16, y + 7);
  s.bezierCurveTo(x + 16, y + 7, x + 16, y, x + 10, y);
  s.bezierCurveTo(x + 7, y, x + 5, y + 5, x + 5, y + 5);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 6,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 1.6,
    bevelThickness: 1.6,
    curveSegments: 10,
  });
  geo.rotateX(Math.PI);
  return normalise(geo);
}

export function sphereGeometry() {
  return new THREE.SphereGeometry(1, 18, 12);
}

export const FORMS = [
  { id: 'sphere', name: 'Spheres', build: sphereGeometry },
  { id: 'flower', name: 'Flowers', build: () => flowerGeometry(6) },
  { id: 'heart', name: 'Hearts', build: heartGeometry },
];
