import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

import { state, WIDE, RAIL } from './state.js';
import { buildUI, HEAVY_KEYS } from './ui.js';
import {
  RingField, SphereField, pearlMaterial, matterMaterial, emberMaterial,
} from './lib/fields.js';
import { EnergyLines, PULSE_STYLES, BEAM } from './lib/energy.js';
import { PALETTES, inkColor, skyTexture } from './lib/palettes.js';
import {
  flowerCircles, axialToVec, metatronEdges, eggSpheres, layerOffset,
} from './geometry/sacred.js';
import { SOLIDS } from './geometry/platonic.js';
import { POLYTOPES, PLANES, project4to3, rotatePlane } from './geometry/polytope4d.js';
import { buildFibre, wrapToSphere } from './geometry/hopf.js';
import { metatronAt, makeSlots, METATRON_POINTS } from './geometry/metatron.js';
import {
  DERIVED, derivedVerts, sourceFaces, solidReach, METATRON_REACH, CUBOCT_VERTS,
  spokeMap, shareTally, OCTA_EDGES,
} from './geometry/solidsFromMetatron.js';
import { toMetatronFrame } from './geometry/metatron.js';
import { toroidStreamline, lapsFor, toroidPoints } from './geometry/toroid.js';
import { phyllotaxis, goldenSpiral, goldenRectangles } from './geometry/fibonacci.js';
import { armDirection } from './geometry/emitter.js';
import { FORMS } from './geometry/forms.js';
import { edgeTrails, isClosed, weld } from './geometry/trails.js';
import { loadSpriteFolder, resolveSprites, spriteTexture } from './lib/sprites.js';
import { extensionGeometry, loadExtensionLibrary, activeExtension } from './lib/extensions.js';
import { metatronSpiral, HEXAGONS } from './geometry/metatronSpiral.js';
import { PrismHalo } from './lib/prism.js';
import {
  listSetups, getSetup, saveSetup, renameSetup, removeSetup,
  applySetup, describeSetup, MAX_ITEMS,
} from './lib/storage.js';
import { shareLink, takeIncomingLink } from './lib/share.js';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};
const frac = (x) => x - Math.floor(x);

// Instance ceilings. The lattice is the one that can genuinely be overrun —
// circles × shells × echoes — so the panel reports when it clamps rather than
// silently dropping geometry.
const MAX_NODES = 1500;
const MAX_FIBRES = 19;
// The fibres project to genuinely round circles, and faceting shows badly on
// the large ones — worse now that Depth stacks several nested levels, where the
// outermost is many times the size of the innermost.
const FIBRE_SEGMENTS = 192;
// Points per streamline are chosen per frame from the winding count, not fixed:
// see toroidPoints. These are the ceilings that sizing depends on.
const MAX_TOR_POINTS = 384;
const TOR_STRAND_BUDGET = 4000;   // segments allocated to each strand
const MAX_TOR_LINES = 20;
const MAX_TOR_STRANDS = 4;
const MAX_CORE_DEPTH = 4;
// Metatron spirals: four hexagons × six starting vertices.
const MAX_MSPIRALS = 12;
const MSPIRAL_STEPS_IN = 6;
const MSPIRAL_STEPS_OUT = 6;
const MSPIRAL_PER_STEP = 14;
const MSPIRAL_PTS = (MSPIRAL_STEPS_IN + MSPIRAL_STEPS_OUT) * MSPIRAL_PER_STEP + 1;
const MAX_ARMS = 60;
const MAX_BEADS = 10;
const SPIRAL_POINTS = 150;
const MAX_SPIRALS = 8;
const MAX_PHYLLO = 400;
// Worst case particles per path: 5 pulses × the longest trail (flames, 7).
const PULSE_CAP = 35;

// ---------------------------------------------------------------- renderer

const canvas = document.getElementById('view');
let renderer;
let post = null;
let bloomNode = null;

/**
 * Which backend to boot on.
 *
 * A WebXR session only runs on WebGPU if it advertises a `webgpu` feature, and
 * today's headset browsers do not. three.js ships a helper that hot-swaps to a
 * WebGL renderer when a session starts, but that means rebuilding the renderer,
 * its canvas, the environment map and the controls mid-session — a lot of moving
 * parts on the one path that cannot be tested from a desktop.
 *
 * So the choice is made once, up front: if this device can present immersive VR,
 * boot the WebGL backend, which is the proven XR path. Everything else gets
 * WebGPU. `?webgl` and `?webgpu` override it either way.
 */
/**
 * WebKit renders this scene to a canvas it then never composites.
 *
 * Measured on Safari 26.5, five fresh launches: the loop runs (800+ frames),
 * the surface is the right size, the camera is right, the scene holds four
 * visible objects carrying 10,746 instances, no error is logged anywhere — and
 * the canvas stays black. Nothing recovers it except a genuine change to the
 * window's size, which is why the piece appeared the moment the panel was
 * opened on a phone: that calls `resize`. Calling `resize` again with the same
 * numbers does nothing, because nothing has changed.
 *
 * It is a compositing fault rather than a rendering one. Putting any extra
 * layer over the canvas — a debug overlay was how this was found — makes every
 * frame appear correctly, three runs out of three. Sizing the surface before
 * `init`, promoting the canvas with `translateZ(0)`, and dropping the bloom
 * pass each changed nothing: 0 for 11 between them.
 *
 * The WebGL 2 backend is perfect on the same browser, three runs out of three,
 * pixel-identical each time. So WebKit gets WebGL. It costs some performance on
 * a platform that was showing nothing at all, and the piece is not heavy enough
 * for that to be the difference between running and not.
 *
 * `navigator.vendor` is the right test rather than sniffing for "Safari" in the
 * user agent: it is Apple for every browser on iOS, all of which are WebKit
 * underneath and all of which therefore have this bug, and it is Google or
 * empty for Chrome and Firefox on the Mac, which do not.
 *
 * `?webgpu` forces it back on, for checking whether a later Safari has fixed
 * this. `?webgl` forces the other way.
 */
function isWebKit() {
  return typeof navigator !== 'undefined' && navigator.vendor === 'Apple Computer, Inc.';
}

async function pickBackend() {
  const q = new URLSearchParams(location.search);
  if (q.has('webgl')) return true;
  if (q.has('webgpu')) return false;
  if (isWebKit()) return true;
  try {
    return (await navigator.xr?.isSessionSupported?.('immersive-vr')) === true;
  } catch {
    return false;
  }
}

/**
 * SIZE THE SURFACE BEFORE THE BACKEND CONFIGURES IT
 *
 * A canvas element starts at 300×150 whatever the stylesheet says — the CSS
 * governs how big it is *drawn*, not how big its buffer is. `init()` is where
 * the backend configures its swap chain against that buffer, so calling it
 * first and sizing afterwards asks WebGPU to configure a 300×150 surface for a
 * full-screen canvas.
 *
 * Chrome re-reads the canvas on each acquire and quietly corrects itself.
 * Safari configures once and keeps it, so the piece rendered into a surface
 * that was never presented and the canvas came up black — on macOS Safari and
 * on every iPhone, while Chrome and the WebGL fallback were both fine. Only a
 * genuine size *change* reconfigured it, which is why the artwork appeared the
 * moment the panel was opened: that calls `resize`. Re-calling `resize` with
 * the same numbers did nothing, because nothing had changed.
 *
 * So the size is set on the renderer before `init` is awaited. Nothing here is
 * Safari-specific; this is simply the correct order.
 */
async function sizedRenderer(forceWebGL) {
  const r = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setSize(window.innerWidth, window.innerHeight, false);
  await r.init();
  return r;
}

async function createRenderer() {
  const preferWebGL = await pickBackend();
  try {
    return await sizedRenderer(preferWebGL);
  } catch (err) {
    if (preferWebGL) throw err;
    console.warn('WebGPU init failed, falling back to WebGL 2', err);
    return sizedRenderer(true);
  }
}

let _thumbTarget = null;

/** One reused offscreen target for thumbnails, grown if a bigger one is asked for. */
function thumbTarget(w, h) {
  if (!_thumbTarget) {
    _thumbTarget = new THREE.RenderTarget(w, h, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
  } else if (_thumbTarget.width !== w || _thumbTarget.height !== h) {
    _thumbTarget.setSize(w, h);
  }
  return _thumbTarget;
}

/**
 * Read-back pixels start at the bottom-left and the picture wants the top-left,
 * so the rows are copied in reverse. Drawn at twice the final size and scaled
 * down, which is the cheapest antialiasing there is.
 */
function flipToJpeg(pixels, w, h, outW, outH) {
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  const ctx = full.getContext('2d');
  const img = ctx.createImageData(w, h);
  const row = w * 4;
  // The target is sized so rows are already aligned, but derive the stride
  // anyway rather than trust it: a silently sheared image is a hard bug to
  // recognise from the outside, and this costs one comparison.
  const stride = pixels.length > row * h ? Math.ceil(row / 256) * 256 : row;
  for (let y = 0; y < h; y++) {
    const from = (h - 1 - y) * stride;
    if (from + row > pixels.length) continue;
    img.data.set(pixels.subarray(from, from + row), y * row);
  }
  ctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  octx.fillStyle = '#05070e';
  octx.fillRect(0, 0, outW, outH);
  octx.drawImage(full, 0, 0, outW, outH);

  // The bloom, approximated: a blurred copy added over the top. The real pass
  // thresholds first so only the bright cores bleed; blurring everything and
  // adding it back at a third weight lands close enough at this size, and the
  // piece looks wrong without any glow at all.
  octx.save();
  octx.globalCompositeOperation = 'lighter';
  octx.globalAlpha = 0.34;
  octx.filter = 'blur(4px)';
  octx.drawImage(full, 0, 0, outW, outH);
  octx.restore();

  return out.toDataURL('image/jpeg', 0.72);
}

function createBloom(scene, camera) {
  try {
    const p = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode('output');
    // A high threshold matters here: every line is additive, so a low one
    // blooms the whole figure into a white disc instead of picking out the
    // bright cores against it.
    const b = bloom(color, state.bloom, 0.55, 0.55);
    p.outputNode = color.add(b);
    post = p;
    bloomNode = b;
  } catch (err) {
    console.warn('Bloom unavailable, falling back to direct render', err);
  }
}

// ---------------------------------------------------------------- scene

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
// The opening angle, saved off the panel along with everything in `DEFAULTS`.
// An artwork here is the settings and the viewpoint together, so a default that
// framed the figure from straight on would not be the same piece.
camera.position.set(-0.4435, 1.1381, -7.3837);

// Everything renderable hangs off `world`. Outside XR it sits at the origin at
// unit scale; in XR it is shrunk to metres and placed in front of the viewer,
// without any layer needing to know which mode it is in.
const world = new THREE.Group();
scene.add(world);

const rig = new THREE.Group();
world.add(rig);

const lampA = new THREE.PointLight(0xffffff, 60, 0, 2);
const lampB = new THREE.PointLight(0xffffff, 60, 0, 2);
lampA.position.set(6, 5, 6);
lampB.position.set(-7, -4, 4);
// Lamps travel with the world so the pearl highlights hold as it is scaled.
world.add(lampA, lampB, new THREE.AmbientLight(0xffffff, 0.12));

// Three surfaces for the lattice nodes. Glow is a billboard rather than a mesh:
// a sphere always has a silhouette and a specular highlight sitting on it, which
// is what makes it read as a bubble instead of as energy.
const NODE_MATS = [pearlMaterial(0.6), matterMaterial()];
const nodeSpheres = new SphereField(MAX_NODES, { material: NODE_MATS[0], segments: [16, 10] });
const nodeGlow = new PrismHalo(MAX_NODES, 'soft');
const rings = new RingField(MAX_NODES, { tube: 0.012, segments: 56 });
const ringHalo = new RingField(MAX_NODES, { tube: 0.05, segments: 20, opacity: 0.07 });
// The two bounding rings are three times the radius of a lattice circle, so at
// the lattice's tessellation they show obvious facets. Two instances is cheap
// enough to give them their own, much finer, geometry.
const boundRings = new RingField(2, { tube: 0.012, segments: 160 });
const eggs = new SphereField(8, { material: pearlMaterial(0.5), segments: [20, 14] });
// A Platonic solid drawn at each lattice node — the flat figure's circles read
// as solids. Capped well below the lattice ceiling: these are real geometry per
// instance, not a torus.
const MAX_NODE_SOLIDS = 200;
const nodeSolids = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(1),
  pearlMaterial(0.55),
  MAX_NODE_SOLIDS,
);
nodeSolids.frustumCulled = false;
nodeSolids.count = 0;
nodeSolids.setColorAt(0, new THREE.Color(0xffffff));
rig.add(ringHalo, rings, boundRings, nodeGlow, nodeSpheres, nodeSolids, eggs);

// 25 points at full 4D means 300 pairs, not the flat figure's 78.
const MAX_JOIN_EDGES = 300;
/**
 * A curved edge is not one segment but several, so the linework has to hold the
 * multiple. Eight is enough that a bow reads as a curve rather than a dogleg,
 * and 300 × 8 is the same order as the toroid's pool.
 */
const JOIN_CURVE_STEPS = 8;
const joinLines = new EnergyLines(MAX_JOIN_EDGES * JOIN_CURVE_STEPS, MAX_JOIN_EDGES * 8, { coreOpacity: 0.85, haloOpacity: 0.1 });
const joinVerts = new SphereField(METATRON_POINTS.length, { material: pearlMaterial(0.8), segments: [16, 12] });
// The same choice the lattice nodes have: a billboard with a hard core and thin
// diffraction spikes reads as a point of light, where a sphere — however
// translucent — always has a silhouette and a highlight, and reads as an object.
const joinGlow = new PrismHalo(METATRON_POINTS.length, 'soft');
// Outlines of the Metatron faces whose centres a bound solid's vertices are.
// Under joinGroup, so they sit on the figure exactly rather than near it.
const anchorLines = new EnergyLines(40, 1, { coreOpacity: 0.7, haloOpacity: 0.12 });
// Spokes from a solid's vertex out to the Metatron points around it. Separate
// from the outlines so they can be much finer, and so exact relationships can be
// tinted apart from mere proximity.
const spokeLines = new EnergyLines(80, 1, { coreOpacity: 0.55, haloOpacity: 0.05 });
const joinGroup = new THREE.Group();
joinGroup.add(joinLines, joinVerts, joinGlow, anchorLines, spokeLines);
rig.add(joinGroup);

const solidLines = new EnergyLines(32, 32 * PULSE_CAP, { coreOpacity: 0.95, haloOpacity: 0.12 });
const solidFaces = new THREE.Mesh(new THREE.IcosahedronGeometry(1), pearlMaterial(0.35));
const solidVerts = new SphereField(20, { material: pearlMaterial(0.9), segments: [14, 10] });
const solidGroup = new THREE.Group();
solidGroup.add(solidLines, solidFaces, solidVerts);
rig.add(solidGroup);
let solidBoundNow = false;

const polyLines = new EnergyLines(96, 96 * PULSE_CAP, { coreOpacity: 0.95, haloOpacity: 0.14 });
const polyVerts = new SphereField(24, { material: pearlMaterial(0.85), segments: [16, 12] });
const polyGroup = new THREE.Group();
polyGroup.add(polyLines, polyVerts);
rig.add(polyGroup);

const tetherLines = new EnergyLines(24, 24 * PULSE_CAP, { coreOpacity: 0.5, haloOpacity: 0.08 });
rig.add(tetherLines);

const coreLines = new EnergyLines(MAX_FIBRES * (MAX_CORE_DEPTH + 1) * FIBRE_SEGMENTS, MAX_FIBRES * PULSE_CAP, {
  coreOpacity: 0.8, haloOpacity: 0.09,
});
rig.add(coreLines);

// Toroid — kept out of the rig so its axis stays fixed while the mandala turns.
// One EnergyLines per strand, each in its own group. That is what lets a strand
// be spun by its parent merkaba pyramid while its twin is spun the other way —
// a single donut with energy running through it in both directions at once.
const strandGroups = [];
const strandLines = [];
for (let i = 0; i < MAX_TOR_STRANDS; i++) {
  const lines = new EnergyLines(
    TOR_STRAND_BUDGET,
    Math.ceil((MAX_TOR_LINES / 2) * PULSE_CAP),
    { coreOpacity: 0.75, haloOpacity: 0.09 },
  );
  const g = new THREE.Group();
  g.add(lines);
  world.add(g);
  strandGroups.push(g);
  strandLines.push(lines);
}

// Merkaba — two tetrahedra in their own groups so they can turn against each other.
const merkabaUp = new EnergyLines(6, 6 * PULSE_CAP, { coreOpacity: 0.95, haloOpacity: 0.14 });
const merkabaDown = new EnergyLines(6, 6 * PULSE_CAP, { coreOpacity: 0.95, haloOpacity: 0.14 });
const merkabaUpGroup = new THREE.Group();
const merkabaDownGroup = new THREE.Group();
merkabaUpGroup.add(merkabaUp);
merkabaDownGroup.add(merkabaDown);
rig.add(merkabaUpGroup, merkabaDownGroup);

// Fibonacci
const spiralLines = new EnergyLines(MAX_SPIRALS * SPIRAL_POINTS, MAX_SPIRALS * PULSE_CAP, {
  coreOpacity: 0.8, haloOpacity: 0.1,
});
// The golden rectangles belong to Fibonacci, not to the solid, so they live in
// their own group and can be shown with the icosahedron hidden — which is the
// clearest way to see that the solid is built out of them.
const rectLines = new EnergyLines(12, 3 * PULSE_CAP, { coreOpacity: 0.7, haloOpacity: 0.09 });
const rectGroup = new THREE.Group();
rectGroup.add(rectLines);
const phylloSpheres = new SphereField(MAX_PHYLLO, { material: pearlMaterial(0.7), segments: [12, 8] });
rig.add(spiralLines, phylloSpheres, rectGroup);

// Spirals fitted to Metatron's four hexagons, running out past the figure.
const mspiralLines = new EnergyLines(MAX_MSPIRALS * MSPIRAL_PTS, MAX_MSPIRALS * 6, {
  coreOpacity: 0.8, haloOpacity: 0.1,
});
rig.add(mspiralLines);

// Prism coronas on the vertex fields. One per group, because each has its own
// world rotation to undo before the billboards can face the camera.
const joinPrism = new PrismHalo(METATRON_POINTS.length);
const solidPrism = new PrismHalo(24);
const polyPrism = new PrismHalo(24);
const nodePrism = new PrismHalo(400);
joinGroup.add(joinPrism);
solidGroup.add(solidPrism);
polyGroup.add(polyPrism);
rig.add(nodePrism);

// Stars — points of light thrown out of the centre.
const MAX_STARS = 700;
const starField = new PrismHalo(MAX_STARS, 'soft');
rig.add(starField);

// Extensions — contributed maths, drawn like any other layer.
const EXT_SEGMENTS = 6000;
const EXT_DOTS = 1200;
const extGroup = new THREE.Group();
const extLines = new EnergyLines(EXT_SEGMENTS, EXT_SEGMENTS, { coreOpacity: 0.85, haloOpacity: 0.1 });
const extDots = new SphereField(EXT_DOTS, { material: pearlMaterial(0.8), segments: [14, 10] });
extGroup.add(extLines, extDots);
rig.add(extGroup);

// Pure geometry — radial emission from the centre.
const emitterGroup = new THREE.Group();
const emRayLines = new EnergyLines(MAX_ARMS, MAX_ARMS * PULSE_CAP, { coreOpacity: 0.7, haloOpacity: 0.1 });

// Form geometries are built once; the look is three materials swapped on the
// same mesh, because switching `transparent` on a live material forces a shader
// rebuild while swapping the reference does not.
const EM_GEOM = FORMS.map((f) => f.build());
const EM_MATS = [matterMaterial(), pearlMaterial(0.75), emberMaterial(0.9)];
const emBeads = new THREE.InstancedMesh(EM_GEOM[0], EM_MATS[0], MAX_ARMS * MAX_BEADS);
emBeads.frustumCulled = false;
emBeads.count = 0;
emBeads.setColorAt(0, new THREE.Color(0xffffff));
// The rainbow: dispersion around each emitted particle, so they read as flaming
// lights rather than as objects.
const emPrism = new PrismHalo(MAX_ARMS * MAX_BEADS);

// IMAGE PARTICLES
//
// An InstancedMesh has one material, so it has one texture — which means a
// library dealt across the arms cannot be a single mesh. It is instead a small
// pool of meshes sharing one plane geometry, one per image actually in use, and
// the beads are distributed between them. Eight is the ceiling: eight draw
// calls is nothing, and past that the arms are being sliced too thin for any of
// the pictures to read anyway.
const MAX_SPRITE_MESHES = 8;
const SPRITE_GEOM = FORMS.find((f) => f.image).build();
const spriteGroup = new THREE.Group();
const spriteMeshes = [];

emitterGroup.add(emRayLines, emPrism, emBeads, spriteGroup);
rig.add(emitterGroup);

/**
 * Prepare one slot of the pool: its texture, and the blend behaviour its
 * surface implies. Both are set only on change — swapping `transparent` or
 * `blending` on a live material forces a shader rebuild every frame otherwise.
 */
function prepareSpriteMesh(slot, id, look) {
  let entry = spriteMeshes[slot];
  if (!entry) {
    const mesh = new THREE.InstancedMesh(
      SPRITE_GEOM,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
      MAX_ARMS * MAX_BEADS,
    );
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.setColorAt(0, new THREE.Color(0xffffff));
    spriteGroup.add(mesh);
    entry = spriteMeshes[slot] = { mesh, id: null, look: -1, aspectX: 1, aspectY: 1 };
  }

  if (entry.id !== id) {
    entry.mesh.material.map = spriteTexture(id);
    entry.mesh.material.needsUpdate = true;
    entry.id = id;
  }

  // A photograph is rarely square and the card is, so the picture would be
  // stretched to fit. The narrow side is scaled down instead, which keeps the
  // image's own proportions and keeps the size slider meaning the same thing
  // for every form — the long edge is always what the radius describes.
  //
  // Re-read every frame rather than once: the texture loads asynchronously, so
  // at the moment a picture is first chosen its dimensions are not known yet.
  const img = entry.mesh.material.map && entry.mesh.material.map.image;
  if (img && img.width && img.height) {
    entry.aspectX = img.width >= img.height ? 1 : img.width / img.height;
    entry.aspectY = img.height >= img.width ? 1 : img.height / img.width;
  } else {
    entry.aspectX = 1;
    entry.aspectY = 1;
  }

  if (entry.look !== look) {
    const m = entry.mesh.material;
    // Matter keeps its promise for pictures too: an alpha *test* rather than
    // alpha blending writes depth, so the buffer sorts the cards exactly and a
    // far one can never paint over a near one. The trade is a hard cutout edge.
    m.transparent = look !== 0;
    m.alphaTest = look === 0 ? 0.45 : 0;
    m.depthWrite = look === 0;
    m.opacity = look === 1 ? 0.85 : 1;
    m.blending = look === 2 ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.needsUpdate = true;
    entry.look = look;
  }

  entry.mesh.count = 0;
  return entry.mesh;
}

// ---------------------------------------------------------------- palette

const _sparkTint = new THREE.Color();
const _joinSparkTint = new THREE.Color();
const _starTint = new THREE.Color();
const palette = { ring: new THREE.Color(), join: new THREE.Color(), solid: new THREE.Color(), poly: new THREE.Color() };

/**
 * PER-LAYER COLOUR
 *
 * Every layer used to draw straight from the same four palette inks, so the
 * whole piece came out in one family and the layers ran together. Each layer now
 * holds its own pair of colours, taken from the palette but turned around the
 * hue circle by that layer's own amount — so the Metatron can be gold while the
 * hypercube is cyan and the toroid violet, without leaving the palette behind.
 *
 * Two colours rather than one because most layers already carry a gradient
 * inside themselves — depth in the hypercube, distance along an arm, one
 * strand against the next. Shifting the pair together keeps that internal
 * shape and moves the layer as a whole.
 */
const layer = {};
for (const k of ['rings', 'joins', 'solid', 'poly', 'core', 'merkaba', 'toroid', 'fib', 'emitter', 'ext', 'stars']) {
  layer[k] = new THREE.Color();
  layer[`${k}Alt`] = new THREE.Color();
}
const WHITE = new THREE.Color(0xffffff);
const _pearlTint = new THREE.Color();
const _pearlTint2 = new THREE.Color();
let skyTex = null;
let envRT = null;
let pmrem = null;

function rebuildEnvironment() {
  const pal = PALETTES[Math.round(state.palette)];
  const next = skyTexture(pal, state.hue);

  // The same image serves as backdrop and as reflection source, but at very
  // different strengths: dimmed almost to black behind the geometry, and driven
  // hard into the pearlescent surfaces in front of it.
  scene.background = next;
  scene.backgroundIntensity = 0.12;

  try {
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(next);
    scene.environment = rt.texture;
    envRT?.dispose();
    envRT = rt;
  } catch (err) {
    console.warn('PMREM unavailable, using the equirect map directly', err);
    scene.environment = next;
  }

  skyTex?.dispose();
  skyTex = next;

  lampA.color.copy(new THREE.Color(pal.lamp[0]).offsetHSL(state.hue, 0, 0));
  lampB.color.copy(new THREE.Color(pal.lamp[1]).offsetHSL(state.hue, 0, 0));
}

function applyLook() {
  const pal = PALETTES[Math.round(state.palette)];
  palette.ring.copy(inkColor(pal, 0, state.hue));
  palette.join.copy(inkColor(pal, 1, state.hue));
  palette.solid.copy(inkColor(pal, 2, state.hue));
  palette.poly.copy(inkColor(pal, 3, state.hue));

  // Each layer's pair, turned by its own offset on top of the global hue.
  const setLayer = (name, a, b, off) => {
    layer[name].copy(inkColor(pal, a, state.hue + off));
    layer[`${name}Alt`].copy(inkColor(pal, b, state.hue + off));
  };
  setLayer('rings', 0, 1, state.hueRings);
  setLayer('joins', 1, 0, state.hueJoins);
  setLayer('solid', 2, 3, state.hueSolid);
  setLayer('poly', 3, 1, state.huePoly);
  setLayer('core', 0, 3, state.hueCore);
  setLayer('merkaba', 2, 3, state.hueMerkaba);
  setLayer('toroid', 1, 0, state.hueToroid);
  setLayer('fib', 2, 0, state.hueFib);
  setLayer('emitter', 2, 0, state.hueEmitter);
  setLayer('ext', 1, 3, state.hueExt);
  setLayer('stars', 0, 2, state.hueStars);

  rings.baseColor.copy(layer.rings);
  boundRings.baseColor.copy(layer.rings);
  ringHalo.baseColor.copy(layer.rings);

  // Pearl surfaces get a washed-out tint rather than the full palette colour:
  // instance colour multiplies the reflection, so a saturated base would filter
  // the environment down to a single hue and kill the iridescence. Sheen sets
  // how far that goes, taking the surfaces from coloured glass to nacre.
  const wash = Math.min(0.2 + state.sheen * 0.32, 0.85);
  _pearlTint.copy(layer.rings).lerp(WHITE, wash);
  // The sparks want to be brighter than the pearl surfaces: a node marker is
  // meant to read as a point of light, and at full palette saturation over a
  // dark ground it reads as a coloured smudge instead.
  _sparkTint.copy(layer.rings).lerp(WHITE, 0.5);
  nodeSpheres.baseColor.copy(_pearlTint);
  nodeGlow.material.opacity = state.glow;
  // The glow field alone takes the spark colour; the pearl and matter spheres
  // keep their own washed tint so Sheen still means something for them.
  nodeGlow.tint = _sparkTint;
  joinGlow.material.opacity = state.glow;
  joinGlow.tint = _joinSparkTint.copy(layer.joins).lerp(WHITE, 0.5);
  starField.material.opacity = state.glow;
  starField.tint = _starTint.copy(layer.stars).lerp(WHITE, 0.45);
  eggs.baseColor.copy(_pearlTint);
  phylloSpheres.baseColor.copy(_pearlTint2.copy(layer.fib).lerp(WHITE, wash));

  joinLines.applyTint(layer.joins);
  solidLines.applyTint(layer.solid);
  rectLines.applyTint(layer.fib);
  polyLines.applyTint(layer.poly);
  polyVerts.baseColor.copy(_pearlTint2.copy(layer.poly).lerp(WHITE, wash));
  tetherLines.applyTint(layer.joins);
  coreLines.applyTint(layer.core);
  for (const l of strandLines) l.applyTint(layer.toroid);
  merkabaUp.applyTint(layer.merkaba);
  merkabaDown.applyTint(layer.merkabaAlt);
  spiralLines.applyTint(layer.fib);
  emRayLines.applyTint(layer.emitter);
  extLines.applyTint(layer.ext);
  extDots.baseColor.copy(_pearlTint2.copy(layer.extAlt).lerp(WHITE, wash));

  const g = state.glow;
  rings.material.opacity = g;
  boundRings.material.opacity = g;
  ringHalo.material.opacity = state.halo * 0.7;
  for (const lines of [joinLines, solidLines, rectLines, polyLines, tetherLines,
    coreLines, merkabaUp, merkabaDown, spiralLines, emRayLines, mspiralLines,
    ...strandLines]) {
    lines.setRadius(state.lineWidth);
    lines.setOpacity(g * 0.95, state.halo, g);
  }
  // Metatron's 78 lines all converge on one point; at full brightness the
  // centre of the figure saturates to white and the structure disappears.
  joinLines.setOpacity(g * 0.6, state.halo * 0.7, g * 0.8);
  mspiralLines.applyTint(layer.joins);
  tetherLines.setOpacity(g * 0.45, state.halo * 0.6, g * 0.7);

  for (const m of [nodeSpheres.material, eggs.material, polyVerts.material,
    solidFaces.material, phylloSpheres.material, EM_MATS[0], EM_MATS[1],
    NODE_MATS[1]]) {
    m.iridescence = Math.min(state.sheen, 1);
    m.envMapIntensity = 1.2 + state.sheen * 1.4;
  }
  // Environment strength is the other half of the sheen, and it lives on the
  // scene rather than the material — so it has to be driven from here too.
  scene.environmentIntensity = 1.4 + state.sheen * 1.5;
  nodeSolids.material.iridescence = Math.min(state.sheen, 1);
  nodeSolids.material.envMapIntensity = 1.2 + state.sheen * 1.4;
  solidFaces.material.color.copy(_pearlTint2.copy(layer.solid).lerp(WHITE, wash));
  solidFaces.material.opacity = state.solidFaces;
  solidFaces.visible = state.solidFaces > 0.004;

  if (bloomNode) bloomNode.strength.value = state.bloom;
}

// ---------------------------------------------------------------- clock

/**
 * One clock. Every motion in the piece is a multiple of it, so the Time control
 * is a single hand on the whole installation — including a hard stop at zero.
 */
let clock = 0;

/**
 * Emanation: concentric shells of the figure released from the centre and
 * carried outward, each fading in as it is born and out as it reaches the rim.
 * A fraction of them run the other way, falling back in — the piece breathes
 * rather than only radiates.
 */
function shellPhase(index, count) {
  const inward = index < Math.round(count * state.contract);
  const u = frac(clock * state.emanate + index / count);
  return inward ? 1 - u : u;
}

// ---------------------------------------------------------------- lattice

const nodePool = Array.from({ length: MAX_NODES }, () => new THREE.Vector3());
// The lattice is rebuilt every frame, so its quaternions are pooled alongside
// its positions — cloning one per node per frame would allocate thousands.
const quatPool = Array.from({ length: MAX_NODES }, () => new THREE.Quaternion());
const nodes = [];
const primaryNodes = [];
let circles = flowerCircles(2);
let circlesExtent = 2;
let latticeWanted = 0;   // instances the settings asked for, before clamping
let latticeShed = null;  // what had to be given up to fit, if anything

// Circle radius, fitted so the figure keeps a constant overall diameter as the
// lattice grows: raising the lattice count adds detail rather than size.
let fittedR = 1;
let outerR = 3.2;
const FIT_DIAMETER = 3.2;

const _normal = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Rebuilt every frame now rather than on change, because the emanation moves
 * the shells continuously. It is a few hundred vector writes into a pool with
 * no allocation, which is far cheaper than it sounds.
 */
/**
 * Circle radius and overall extent. Split out of the lattice rebuild because
 * Metatron is sized from it and now runs first — the lattice can be mapped onto
 * Metatron's points, so Metatron has to be solved before the lattice is placed.
 */
function computeFit() {
  const extent = Math.round(state.extent);
  if (extent !== circlesExtent) {
    circles = flowerCircles(extent);
    circlesExtent = extent;
  }
  fittedR = (state.radius * FIT_DIAMETER) / (extent + 1);
  outerR = (extent + 1) * fittedR;
}

/**
 * Does anything actually consume the lattice this frame?
 *
 * The circles and node spheres obviously do, but so does the hypercube when its
 * vertices are tethered — the tethers bind to `primaryNodes`. Nothing else
 * touches it, so if none of those are on there is no reason to place a single
 * node.
 */
function latticeNeeded() {
  if (state.showRings || state.showNodes) return true;
  if (state.showPoly && state.tethers > 0.01 && Math.round(state.poly) > 0) return true;
  return false;
}

function rebuildLattice() {
  // Switching a layer off has to stop the work, not just the drawing. This ran
  // unconditionally, so with the circles hidden it still placed every node —
  // thousands of them, each with a quaternion for the sphere wrap — and then
  // painted none of it. All cost, no pixels.
  if (!latticeNeeded()) {
    nodes.length = 0;
    primaryNodes.length = 0;
    latticeWanted = 0;
    latticeShed = null;
    return;
  }

  const extent = Math.round(state.extent);

  // The tethers only ever reach for `primaryNodes` — one un-echoed, un-stacked
  // copy of the figure. So when the circles and node spheres are both hidden and
  // the lattice exists purely for the hypercube to bind to, build that one copy
  // and nothing else: at extent 4 with six echoes and six shells that is 61
  // placements instead of 3660, for an identical result.
  const tethersOnly = !state.showRings && !state.showNodes;
  let echoes = tethersOnly ? 1 : Math.round(state.echoes);
  let nLayers = tethersOnly ? 0 : Math.round(state.layers);
  let shells = tethersOnly ? 0 : Math.round(state.shells);

  // Echoes and shells MULTIPLY — six of each is thirty-six complete copies of
  // the figure, which is how the count reached 2928 against a 1500 ceiling.
  // Filling to the ceiling and dropping the remainder truncated a figure
  // part-drawn, which reads as broken rather than as reduced. Instead, shed
  // whole copies until the request fits: echoes first (a flat-figure moiré
  // device, and the least meaningful once the thing is emanating), then depth,
  // then shells last, since the emanation is usually the point. What was given
  // up is reported rather than absorbed silently.
  const asked = { echoes, layers: nLayers, shells };
  const cost = () => Math.max(shells, 1) * circles.length * (echoes + 2 * nLayers);
  while (cost() > nodePool.length && echoes > 1) echoes--;
  while (cost() > nodePool.length && nLayers > 0) nLayers--;
  while (cost() > nodePool.length && shells > 1) shells--;
  latticeShed = (echoes !== asked.echoes || nLayers !== asked.layers || shells !== asked.shells)
    ? { asked, got: { echoes, layers: nLayers, shells } }
    : null;

  const shellCount = Math.max(shells, 1);
  const wrap = state.wrap;
  const sphereR = outerR * 0.85;
  // Coverage: how far up the sphere the figure reaches. Scaled against the
  // outermost *node*, not the bounding radius — the lattice only fills about
  // two thirds of `outerR`, so measuring against that made the control mean
  // something different at every Lattice setting. At 1 the outermost ring lands
  // on the equator (a hemisphere of nodes, mass sitting above the origin);
  // it balances near 1.6, and higher wraps round toward the south pole.
  const nodeReach = Math.max(extent * fittedR, 1e-6);
  const k = state.wrapSpread / nodeReach;

  nodes.length = 0;
  primaryNodes.length = 0;
  let slot = 0;
  latticeWanted = 0;

  const place = (c, angle, off, fade, shellScale, primary, seed) => {
    latticeWanted++;
    if (slot >= nodePool.length) return;
    const p = nodePool[slot++];
    axialToVec(c.q, c.r, fittedR * shellScale, p);
    p.x += off.x * shellScale;
    p.y += off.y * shellScale;
    p.z += off.z * shellScale;
    if (angle) {
      const cs = Math.cos(angle);
      const sn = Math.sin(angle);
      const x = p.x;
      p.set(x * cs - p.y * sn, x * sn + p.y * cs, p.z);
    }

    // Conformal wrap onto the sphere. The returned factor carries a circle's
    // radius across with its centre, and the surface normal orients the torus
    // so the circle lies on the shell rather than slicing through it.
    let scale = shellScale;
    let quat = null;
    if (wrap > 0.001) {
      scale *= wrapToSphere(p, wrap, sphereR, k, _normal);
      quat = quatPool[slot - 1].setFromUnitVectors(Z_AXIS, _normal);
    }

    const node = { pos: p, born: c.born, fade, scale, quat, exc: 0, seed };
    nodes.push(node);
    if (primary) primaryNodes.push(node);
  };

  const ZERO = new THREE.Vector3();

  // Mapped mode: every node sits on one of Metatron's points instead of on the
  // hexagonal lattice. Stage, echoes and depth have nothing to address in that
  // arrangement, so only the emanation still applies.
  if (state.mapToMetatron && joinActive > 0) {
    for (let sh = 0; sh < shellCount; sh++) {
      let shellScale = 1;
      let shellFade = 1;
      if (shells > 0) {
        const u = shellPhase(sh, shellCount);
        shellScale = 0.12 + u * 0.98;
        shellFade = Math.sin(u * Math.PI);
        if (shellFade < 0.01) continue;
      }
      for (let i = 0; i < joinActive; i++) {
        if (slot >= nodePool.length) break;
        const p = nodePool[slot++];
        p.copy(joinPos[i]).multiplyScalar(shellScale);
        const node = {
          pos: p,
          born: 0,
          fade: shellFade * (joinPos[i].weight ?? 1),
          scale: shellScale * 0.42,
          quat: null,
          exc: 0,
          seed: sh * 1024 + i,
        };
        latticeWanted++;
        nodes.push(node);
        if (sh === 0) primaryNodes.push(node);
      }
    }
    return;
  }

  for (let s = 0; s < shellCount; s++) {
    let shellScale = 1;
    let shellFade = 1;
    if (shells > 0) {
      const u = shellPhase(s, shellCount);
      shellScale = 0.12 + u * 0.98;
      shellFade = Math.sin(u * Math.PI);       // born at the centre, dies at the rim
      if (shellFade < 0.01) continue;
    }

    // Echoes rotate the flat figure inside the lattice's own 60° symmetry, so
    // each copy lands somewhere the lattice does not already repeat — that near
    // miss is what produces the moiré.
    for (let e = 0; e < echoes; e++) {
      const angle = (e * (Math.PI / 3)) / echoes;
      const fade = (e === 0 ? 1 : 0.55 / (1 + e * 0.35)) * shellFade;
      // The seed is derived from *which* copy this is, never from how many
      // nodes happen to have been placed already — see keepNode.
      const copy = s * 32 + e;
      for (let ci = 0; ci < circles.length; ci++) {
        place(circles[ci], angle, ZERO, fade, shellScale, s === 0 && e === 0, copy * 1024 + ci);
      }
    }

    // Depth stacks only the un-echoed figure; echoing every layer as well would
    // multiply into tens of thousands of instances for no extra legibility.
    for (let l = -nLayers; l <= nLayers; l++) {
      if (l === 0) continue;
      const off = layerOffset(l, fittedR);
      const copy = s * 32 + 16 + (l + 4);
      const fade = (0.5 / (1 + Math.abs(l))) * shellFade;
      for (let ci = 0; ci < circles.length; ci++) {
        place(circles[ci], 0, off, fade, shellScale, false, copy * 1024 + ci);
      }
    }
  }
}

const ringList = [];
const haloList = [];
const nodeList = [];
const boundList = [];
const eggList = [];
const BOUNDS = new THREE.Vector3();

/**
 * Which nodes get a marker. Selection walks the golden ratio rather than taking
 * every Nth, because a fixed stride lands on the lattice's own periodicity and
 * picks out whole rings or spokes; an irrational step scatters evenly at any
 * density.
 *
 * The seed must identify the *node*, not its position in the surviving list.
 * Counting as we go looked equivalent and was not: the moment an emanating shell
 * faded below the visibility threshold and was skipped, every later node's index
 * shifted by one and the entire selection reshuffled — which is exactly the
 * flash seen as one shell handed over to the next.
 */
/**
 * Vertex twinkle. Each vertex gets its own phase from the golden ratio, so they
 * breathe out of step rather than blinking in unison — the difference between
 * points of energy and a warning light.
 *
 * This exists because the vertices *were* already flashing, as a side effect of
 * comet heads sweeping the edges that meet at them. That looked good and could
 * not be turned off or up. Now it is a control of its own, and the accidental
 * version is gone.
 */
function vertexBeat(i) {
  const amt = state.vertexPulse;
  if (amt < 0.004) return 1;
  const phase = (i * 0.6180339887) % 1;
  const b = 0.5 + 0.5 * Math.sin((clock * state.vertexPulseRate + phase) * Math.PI * 2);
  return 1 - amt + amt * b;
}

function keepNode(node) {
  const d = state.nodeDensity;
  if (d >= 0.999) return true;
  return (((node.seed ?? 0) * 0.6180339887) % 1) < d;
}
let eggCache = [];
let eggCacheR = -1;
let activeNodeSolid = -1;
let nodeSolidsClamped = 0;
const _nsMat = new THREE.Matrix4();
const _nsQuat = new THREE.Quaternion();
const _nsScale = new THREE.Vector3();
const _nsColor = new THREE.Color();
const NS_AXIS = new THREE.Vector3(0.4, 0.7, 0.6).normalize();

function paintLattice() {
  const stage = state.stage;
  const size = state.nodeSize;
  ringList.length = 0;
  nodeList.length = 0;

  const wantRings = state.showRings;
  const wantNodes = state.showNodes && size > 0.004;

  if (wantRings || wantNodes) {
    for (const n of nodes) {
      const fade = smoothstep(n.born - 0.65, n.born + 0.12, stage) * n.fade;
      if (fade < 0.004) continue;
      if (wantRings) ringList.push({ pos: n.pos, radius: fittedR * n.scale, quat: n.quat, fade });
      if (wantNodes && keepNode(n)) {
        const b = vertexBeat(n.seed ?? 0);
        nodeList.push({
          pos: n.pos,
          radius: size * fittedR * n.scale * (1 + n.exc * 0.9) * (0.6 + b * 0.4),
          fade: fade * (1 + n.exc * 2.4) * b,
        });
      }
    }
  }

  // The bounding rings only make sense around a still, flat figure.
  boundList.length = 0;
  const bound = smoothstep(7.4, 8, stage);
  if (wantRings && bound > 0.004 && Math.round(state.shells) === 0 && state.wrap < 0.5) {
    boundList.push({ pos: BOUNDS, radius: outerR, fade: bound });
    boundList.push({ pos: BOUNDS, radius: outerR * 1.045, fade: bound * 0.7 });
  }
  boundRings.set(boundList);

  // A Platonic solid at each node, when asked for — the circles of the flat
  // figure read as solids without ceasing to be the same lattice.
  const nsIdx = Math.round(state.nodeSolid);
  if (nsIdx > 0 && nodeList.length) {
    if (nsIdx !== activeNodeSolid) {
      nodeSolids.geometry = SOLIDS[nsIdx].geometry;
      activeNodeSolid = nsIdx;
    }
    const n = Math.min(nodeList.length, MAX_NODE_SOLIDS);
    for (let i = 0; i < n; i++) {
      const item = nodeList[i];
      _nsScale.setScalar(item.radius * state.nodeSolidSize * 6);
      _nsQuat.setFromAxisAngle(NS_AXIS, clock * state.nodeSolidSpin + i * 0.4);
      _nsMat.compose(item.pos, _nsQuat, _nsScale);
      nodeSolids.setMatrixAt(i, _nsMat);
      _nsColor.copy(_pearlTint).multiplyScalar(Math.max(item.fade, 0));
      nodeSolids.setColorAt(i, _nsColor);
    }
    nodeSolids.count = n;
    nodeSolids.instanceMatrix.needsUpdate = true;
    if (nodeSolids.instanceColor) nodeSolids.instanceColor.needsUpdate = true;
    nodeSolidsClamped = nodeList.length > MAX_NODE_SOLIDS ? nodeList.length : 0;
  } else {
    nodeSolids.count = 0;
    nodeSolidsClamped = 0;
  }

  rings.set(ringList);
  haloList.length = 0;
  if (state.halo > 0.004 && wantRings) for (const r of ringList) haloList.push(r);
  ringHalo.set(haloList);
  // Glow (0) is a billboard field; Pearl (1) and Matter (2) are the sphere mesh.
  const nodeLook = Math.round(state.nodeLook);
  const nodesToMesh = Math.round(state.nodeSolid) > 0 ? [] : nodeList;
  if (nodeLook === 0) {
    nodeSpheres.set([]);
    if (nodesToMesh.length) {
      nodeGlow.faceCamera(camera);
      nodeGlow.set(nodesToMesh, state.nodeGlowSpread * 3.4, 1);
    } else {
      nodeGlow.count = 0;
    }
  } else {
    nodeGlow.count = 0;
    if (nodeSpheres.material !== NODE_MATS[nodeLook - 1]) {
      nodeSpheres.material = NODE_MATS[nodeLook - 1];
    }
    nodeSpheres.set(nodesToMesh);
  }

  const eggFade = Math.max(0, smoothstep(4.5, 5.05, stage) - smoothstep(5.9, 6.5, stage));
  eggList.length = 0;
  if (eggFade > 0.004 && state.showNodes) {
    if (eggCacheR !== fittedR) { eggCache = eggSpheres(fittedR); eggCacheR = fittedR; }
    for (const p of eggCache) eggList.push({ pos: p, radius: fittedR / 2, fade: eggFade });
  }
  eggs.set(eggList);
}

const joinPaths = [];
const joinSlots = makeSlots();
const joinPos = METATRON_POINTS.map(() => new THREE.Vector3());
// The pre-projection coordinates are kept alongside, because which pairs count
// as edges is a property of the polytope, not of the shadow it happens to cast.
const joinRaw = METATRON_POINTS.map(() => [0, 0, 0, 0]);
const joinEdgePool = Array.from({ length: MAX_JOIN_EDGES * 2 }, () => new THREE.Vector3());
const joinCurvePool = Array.from({ length: MAX_JOIN_EDGES * JOIN_CURVE_STEPS + 16 }, () => new THREE.Vector3());
const _bowMid = new THREE.Vector3();
const _bowDir = new THREE.Vector3();
const _bowCtl = new THREE.Vector3();
const BOW_FALLBACK = new THREE.Vector3(0, 0, 1);

/**
 * WHICH WAY AN EDGE BOWS
 *
 * A curve needs a direction to bend in, and picking one per edge at random
 * reads as noise rather than as life — the figure looks crumpled instead of
 * billowing. So every edge bows *outward from the centre*, which is a direction
 * the whole web agrees on: the result opens like a jellyfish rather than
 * crinkling.
 *
 * The exception is an edge whose midpoint is on the centre — the long diagonals
 * straight through Metatron — where "outward" means nothing. Those take a
 * perpendicular to the edge instead, so they still bend, just not radially.
 */
function bowDirection(a, b, out) {
  _bowMid.addVectors(a, b).multiplyScalar(0.5);
  if (_bowMid.lengthSq() > 1e-6) return out.copy(_bowMid).normalize();
  out.subVectors(b, a).cross(BOW_FALLBACK);
  if (out.lengthSq() < 1e-9) out.set(1, 0, 0);
  return out.normalize();
}
const joinTints = Array.from({ length: MAX_JOIN_EDGES }, () => new THREE.Color());

// Metatron's edge set is not fixed: which pairs are close enough to join
// depends on Edge reach, and past three dimensions the distances themselves
// change as the figure turns. The trails are therefore rebuilt whenever the set
// of pairs changes and reused when it has not — recognised by a running hash of
// the pairs, which costs nothing and allocates nothing on the frames in between.
const joinPairs = [];
let joinTrails = [];
let joinTrailHash = -1;
const joinNodeList = [];
const _join4 = [0, 0, 0, 0];

const dist4 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);

/**
 * Metatron's Cube, alive.
 *
 * The figure is carried through its own family — flat hexagonal Fruit of Life,
 * cuboctahedron, 24-cell — and once the fourth dimension is open the same
 * six-plane rotation that drives the hypercube and the Hopf core turns it too,
 * so all three are one motion seen three ways. Edges are drawn between pairs
 * within a distance threshold, which at full reach is every pair (the classic
 * 78 lines when only the thirteen are present) and at low reach only the
 * shortest, leaving the bare polyhedron.
 */
function updateJoins() {
  joinPaths.length = 0;
  joinNodeList.length = 0;

  // Inside the stage walk Metatron still appears at stage 7. Shown on its own,
  // there is no walk to be part of, so it simply shows.
  const staged = state.showRings || state.showNodes;
  const fade = state.showJoins
    ? (staged ? smoothstep(6.4, 7.05, state.stage) : 1)
    : 0;

  // The points are solved even when the figure is not drawn, because two other
  // layers can be mapped onto them — but only while those layers are themselves
  // being drawn. `solidBind` defaults on, so testing the flag alone kept the
  // whole Metatron solve running with every layer switched off.
  const drawing = fade > 0.004;
  const mappedLattice = state.mapToMetatron && (state.showRings || state.showNodes);
  const boundSolid = state.solidBind && state.showSolid && Math.round(state.solid) > 0;

  joinGroup.visible = drawing;
  if (!drawing && !mappedLattice && !boundSolid) {
    joinLines.setPaths([]);
    joinVerts.set([]);
    joinGlow.count = 0;
    anchorLines.setPaths([]);
    spokeLines.setPaths([]);
    joinActive = 0;
    return;
  }

  const dim = state.joinDim;
  const open = Math.min(Math.max(dim - 3, 0), 1);
  metatronAt(dim, joinSlots);

  // Breathing rides the same emanation clock as the shells, so the figure
  // belongs to the piece's pulse rather than keeping its own time.
  const breath = 1 + state.joinBreath * Math.sin(clock * state.emanate * Math.PI * 2);
  const size = state.joinSize * fittedR * breath;

  joinGroup.rotation.x = clock * state.joinTumble;
  joinGroup.rotation.y = clock * state.joinTumble * 0.618;

  let active = 0;
  for (let i = 0; i < joinSlots.length; i++) {
    const slot = joinSlots[i];
    if (slot.weight < 0.01) continue;

    const q = _join4;
    q[0] = slot.p[0]; q[1] = slot.p[1]; q[2] = slot.p[2]; q[3] = slot.p[3];
    if (open > 0.001) {
      // Scaling the angles by `open` means the w-planes only start turning as
      // the fourth dimension does, so nothing jumps as the slider crosses 3.
      rotatePlane(q, PLANES.xw, angles.xw * open);
      rotatePlane(q, PLANES.yw, angles.yw * open);
      rotatePlane(q, PLANES.zw, angles.zw * open);
    }
    const raw = joinRaw[active];
    raw[0] = q[0]; raw[1] = q[1]; raw[2] = q[2]; raw[3] = q[3];
    project4to3(q, state.eyeW, joinPos[active]).multiplyScalar(size);
    joinPos[active].weight = slot.weight;
    active++;
  }

  // Threshold as a fraction of the spread of pair distances, measured in the
  // polytope's own space. Measuring the projection instead would make the edge
  // set flicker as the figure turns, because perspective in w stretches some
  // distances and squashes others.
  let minD = Infinity;
  let maxD = 0;
  for (let i = 0; i < active; i++) {
    for (let j = i + 1; j < active; j++) {
      const d = dist4(joinRaw[i], joinRaw[j]);
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
    }
  }
  const threshold = minD + (maxD - minD) * state.joinReach + 1e-4;

  let e = 0;
  joinPairs.length = 0;
  let hash = 17;
  for (let i = 0; i < active && e < MAX_JOIN_EDGES && drawing; i++) {
    for (let j = i + 1; j < active && e < MAX_JOIN_EDGES; j++) {
      if (dist4(joinRaw[i], joinRaw[j]) > threshold) continue;
      joinPairs.push([i, j]);
      hash = (hash * 31 + i * 64 + j) | 0;
      e++;
    }
  }
  if (hash !== joinTrailHash) {
    joinTrails = edgeTrails(joinPairs, active).map((t) => {
      const closed = isClosed(t);
      const ids = closed ? t.slice(0, -1) : t;
      // Sized for the curved case: a bowed edge is JOIN_CURVE_STEPS segments,
      // and over-allocating costs a few colours where re-allocating on every
      // change of the curve slider would cost a stutter.
      const n = (closed ? ids.length : ids.length - 1) * JOIN_CURVE_STEPS;
      return {
        ids,
        closed,
        pts: new Array(ids.length),
        // Built with the trail, not with the frame: these are refilled in place
        // every frame and only reallocated when the edge set itself changes.
        tints: Array.from({ length: n }, () => new THREE.Color()),
        segFades: new Float32Array(n),
      };
    });
    joinTrailHash = hash;
  }

  // Walked rather than scattered, for the same reason as the hypercube: a pulse
  // on a two-point path cannot turn a corner, so the web blinked instead of
  // being traced. Each segment keeps its own colour and weight — the short
  // edges are the polyhedron's own skeleton and run brighter than the long
  // diagonals, which is what keeps the solid readable inside the full web.
  // Bowed by a slow breath rather than held bent: a fixed curve is a shape, a
  // moving one is alive. The phase runs along the trail so the bend travels
  // rather than every edge pulsing together.
  const curve = state.joinCurve;
  const bowing = curve > 0.004;
  const steps = bowing ? JOIN_CURVE_STEPS : 1;
  let cp = 0;

  for (const trail of joinTrails) {
    const { ids, tints, segFades } = trail;
    const pts = trail.curvePts || (trail.curvePts = []);
    pts.length = 0;
    let seg = 0;

    const edges = trail.closed ? ids.length : ids.length - 1;
    for (let i = 0; i < edges; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      const pa = joinPos[a];
      const pb = joinPos[b];
      const d = dist4(joinRaw[a], joinRaw[b]);
      const near = 1 - Math.min((d - minD) / Math.max(maxD - minD, 1e-4), 1);
      const w = Math.min(pa.weight, pb.weight);

      if (!bowing) {
        pts.push(pa);
        if (seg < tints.length) {
          tints[seg].copy(layer.joins).lerp(layer.joinsAlt, 1 - near);
          segFades[seg] = w * (0.35 + near * 0.65);
        }
        seg++;
        continue;
      }

      // A quadratic through a control point pushed off the midpoint. The bow
      // scales with the edge's own length, so short edges stay taut and long
      // diagonals swing — which is what makes it read as a membrane rather
      // than as every line being bent by the same amount.
      const len = pa.distanceTo(pb);
      const breath = 1 + 0.35 * Math.sin(clock * state.joinCurveRate * Math.PI * 2 + i * 0.7);
      bowDirection(pa, pb, _bowDir);
      _bowCtl.addVectors(pa, pb).multiplyScalar(0.5)
        .addScaledVector(_bowDir, curve * len * 0.9 * breath);

      for (let k = 0; k < steps; k++) {
        if (cp >= joinCurvePool.length) break;
        const u = k / steps;
        const v = 1 - u;
        const p = joinCurvePool[cp++];
        // (1-u)²·a + 2(1-u)u·control + u²·b
        p.set(0, 0, 0)
          .addScaledVector(pa, v * v)
          .addScaledVector(_bowCtl, 2 * v * u)
          .addScaledVector(pb, u * u);
        pts.push(p);
        if (seg < tints.length) {
          tints[seg].copy(layer.joins).lerp(layer.joinsAlt, 1 - near);
          segFades[seg] = w * (0.35 + near * 0.65);
        }
        seg++;
      }
    }

    // An open trail has to be told where it ends; a closed one wraps.
    if (!trail.closed && edges > 0) pts.push(joinPos[ids[ids.length - 1]]);
    joinPaths.push({ pts, tints, segFades, closed: trail.closed, fade });
  }
  joinLines.setPaths(joinPaths);

  if (drawing && state.joinNodeSize > 0.001) {
    for (let i = 0; i < active; i++) {
      const b = vertexBeat(i + 71);
      joinNodeList.push({
        pos: joinPos[i],
        radius: state.joinNodeSize * size * (0.6 + b * 0.4),
        fade: fade * joinPos[i].weight * b,
      });
    }
  }
  // Star or sphere, never both.
  if (Math.round(state.joinLook) === 0 && joinNodeList.length) {
    joinVerts.set([]);
    joinGlow.faceCamera(camera);
    joinGlow.set(joinNodeList, state.joinGlowSpread * 3.4, 1);
  } else {
    joinGlow.count = 0;
    joinVerts.set(joinNodeList);
  }
  joinActive = active;
  joinCurrentSize = size;
}

// Metatron's solved state, published for the layers that hang off it.
let joinActive = 0;
let joinCurrentSize = 1;

// ---------------------------------------------------------------- solid

const solidPaths = [];
const rectPaths = [];
let activeSolid = -1;

function updateSolid() {
  const idx = Math.round(state.solid);
  const bind = state.solidBind;

  // Bound: reparent under Metatron so the two share one transform exactly —
  // matching rotations frame by frame would drift, inheriting cannot. It is
  // also why a bound solid turns with Metatron rather than on its own.
  if (bind !== solidBoundNow) {
    (bind ? joinGroup : rig).add(solidGroup);
    solidBoundNow = bind;
  }

  solidGroup.visible = state.showSolid && idx > 0;
  anchorPaths.length = 0;
  spokePaths.length = 0;

  if (!solidGroup.visible) {
    solidLines.setPaths([]);
    solidVerts.set([]);
    anchorLines.setPaths([]);
    spokeLines.setPaths([]);
    rectGroup.visible = state.showFib && state.goldenRects;
    if (!rectGroup.visible) rectLines.setPaths([]);
    return;
  }

  const def = SOLIDS[idx];
  solidPaths.length = 0;
  solidVertList.length = 0;

  if (bind) {
    // No Size and no breathing here on purpose: the point of binding is that
    // the vertices land on Metatron's own features, and any scaling at all
    // breaks that silently. The solid takes Metatron's size and nothing else.
    solidGroup.rotation.set(0, 0, 0);
    solidGroup.scale.setScalar(1);
    const kind = def.id;
    const derived = DERIVED[kind];
    const verts = derivedVerts(kind, state.solidJitter, derivedPool);
    for (const v of verts) v.multiplyScalar(joinCurrentSize);

    solidLines.setRadius(state.lineWidth);
    // Walked, so a pulse goes round the solid instead of blinking edge to edge.
    trailPaths(cachedTrails(`derived:${kind}`, derived.edges, verts.length), verts, solidPaths);
    if (state.solidNodeSize > 0.001) {
      for (let vi = 0; vi < verts.length; vi++) {
        const b = vertexBeat(vi + 211);
        solidVertList.push({
          pos: verts[vi],
          radius: state.solidNodeSize * joinCurrentSize * (0.6 + b * 0.4),
          fade: b,
        });
      }
    }

    // Faces hulled from the derived vertices themselves. The three.js primitive
    // is the wrong orientation for this frame, and a shell that does not sit on
    // its own edges is worse than no shell.
    solidFaces.visible = state.solidFaces > 0.004;
    solidFaces.scale.setScalar(1);
    solidFaces.quaternion.identity();
    if (solidFaces.visible) {
      const key = `${kind}:${joinCurrentSize.toFixed(3)}:${state.solidJitter.toFixed(3)}`;
      if (key !== hullKey) {
        solidFaces.geometry.dispose();
        solidFaces.geometry = new ConvexGeometry(verts.map((v) => v.clone()));
        hullKey = key;
        activeSolid = -1;
      }
    }

    // The markers: outline each Metatron face whose centre is a vertex here.
    if (state.solidAnchors) {
      let a = 0;
      const faces = sourceFaces(kind);
      if (faces) {
        for (const f of faces) {
          const pts = [];
          for (const vi of f) pts.push(metatronVertex(vi, anchorPool[a++]));
          anchorPaths.push({ pts, closed: true, fade: 0.8 });
        }
      } else if (kind === 'icosa') {
        // The icosahedron sits on no face. It sits on the twelve edges of the
        // octahedron Metatron gives you, so those are what to draw.
        // Twelve edges meeting four to a corner: one closed circuit, so the
        // light goes right round the octahedron rather than flickering across
        // its edges one at a time.
        for (const trail of octaTrails()) {
          if (a + trail.ids.length > anchorPool.length) break;
          for (let i = 0; i < trail.ids.length; i++) {
            trail.pts[i] = framePoint(OCTA_POINTS[trail.ids[i]], anchorPool[a++]);
          }
          anchorPaths.push({ pts: trail.pts, closed: trail.closed, fade: 0.55 });
        }
      }
    }
    anchorLines.setRadius(state.lineWidth * 0.6);

    // Spokes: from each vertex out to the Metatron points it relates to. A
    // vertex sitting exactly at a face centre gets its face's corners; one
    // sitting on nothing gets its three nearest, tinted apart so a coincidence
    // never passes for a derivation.
    if (state.solidSpokes > 0.004) {
      const map = spokeMap(kind, state.solidJitter);
      let sp = 0;
      for (let vi = 0; vi < map.length && sp + 3 < spokePool.length; vi++) {
        const m = map[vi];
        if (m.how === 'onVertex') continue;   // zero length; nothing to show
        for (const tp of m.targets) {
          if (sp + 2 > spokePool.length) break;
          const a = spokePool[sp++].copy(verts[vi]);
          const b = framePoint(tp, spokePool[sp++]);
          spokePaths.push({
            pts: [a, b],
            fade: state.solidSpokes * (m.exact ? 1 : 0.45),
            tint: m.exact ? layer.solid : layer.solidAlt,
          });
        }
      }
    }
    spokeLines.setRadius(state.lineWidth * 0.32);
  } else {
    const sc = state.solidScale;
    if (idx !== activeSolid) { solidFaces.geometry = def.geometry; activeSolid = idx; }
    solidGroup.scale.setScalar(sc);
    // Tube radius is in local space, so undo the group scale to keep the
    // linework a constant apparent thickness as the solid grows.
    solidLines.setRadius(state.lineWidth / sc);
    trailPaths(cachedTrails(`solid:${idx}`, def.indexEdges, def.points.length), def.points, solidPaths);
    solidFaces.visible = state.solidFaces > 0.004;
    solidFaces.scale.setScalar(1);
    solidFaces.quaternion.identity();
  }

  solidLines.setPaths(solidPaths);
  solidVerts.set(solidVertList);
  anchorLines.setPaths(anchorPaths);
  spokeLines.setPaths(spokePaths);

  // Three golden rectangles at the scale of the icosahedron they generate —
  // shown whether or not the solid itself is drawn.
  rectGroup.visible = state.showFib && state.goldenRects;
  rectPaths.length = 0;
  if (rectGroup.visible) {
    const rs = bind ? joinCurrentSize * 0.5 : state.solidScale;
    rectGroup.scale.setScalar(rs);
    rectLines.setRadius((state.lineWidth * 0.75) / rs);
    if (!rectCache) rectCache = goldenRectangles(0.5257);
    for (const r of rectCache) rectPaths.push({ pts: r, closed: true, fade: 0.85 });
  }
  rectLines.setPaths(rectPaths);
}

const anchorPaths = [];
const anchorPool = Array.from({ length: 48 }, () => new THREE.Vector3());
const spokePaths = [];
const spokePool = Array.from({ length: 160 }, () => new THREE.Vector3());

/** An axis-aligned point, carried into Metatron's frame at its current size. */
function framePoint(p, out) {
  return toMetatronFrame(p[0], p[1], p[2], out).multiplyScalar(joinCurrentSize);
}

/** One of Metatron's twelve, in its frame and at its current size. */
function metatronVertex(i, out) {
  return framePoint(CUBOCT_VERTS[i], out);
}

const solidVertList = [];
const derivedPool = Array.from({ length: 24 }, () => new THREE.Vector3());
let hullKey = '';

let rectCache = null;

// ---------------------------------------------------------------- 4D

const angles = { xw: 0, yw: 0, zw: 0, xy: 0 };
const projected = Array.from({ length: 24 }, () => new THREE.Vector3());
const wValues = new Float32Array(24);
const polyTints = Array.from({ length: 96 }, () => new THREE.Color());
const scratch4 = [0, 0, 0, 0];
const polyPaths = [];
const vertList = [];
let polyCount = 0;

/**
 * The polytope's edges chained into continuous walks, worked out once per
 * figure. Which vertices a trail visits never changes — only where they are —
 * so the chains, their point arrays and their colours are all built on first
 * sight of a polytope and refilled in place afterwards, and the per-frame cost
 * is the same as the loose edges it replaces.
 */
const polyTrailCache = new Map();

// Metatron's derived octahedron, welded from loose pairs into a graph once.
const OCTA_WELD = weld(OCTA_EDGES);
const OCTA_POINTS = OCTA_WELD.points;
let _octaTrails = null;
function octaTrails() {
  if (!_octaTrails) {
    _octaTrails = edgeTrails(OCTA_WELD.edges, OCTA_POINTS.length).map((t) => {
      const closed = isClosed(t);
      const ids = closed ? t.slice(0, -1) : t;
      return { ids, closed, pts: new Array(ids.length) };
    });
  }
  return _octaTrails;
}

/**
 * The same walk for any figure given as indexed edges. Cached on a key of the
 * caller's choosing, since the topology is fixed even while the points move.
 */
const trailCache = new Map();

function cachedTrails(key, edges, vertexCount) {
  let cached = trailCache.get(key);
  if (cached) return cached;
  cached = edgeTrails(edges, vertexCount).map((t) => {
    const closed = isClosed(t);
    const ids = closed ? t.slice(0, -1) : t;
    return { ids, closed, pts: new Array(ids.length) };
  });
  trailCache.set(key, cached);
  return cached;
}

/** Fill a cached trail's point array from a positions list and hand it over. */
function trailPaths(trails, positions, out, fade = 1, tint) {
  for (const trail of trails) {
    const { ids, pts } = trail;
    for (let i = 0; i < ids.length; i++) pts[i] = positions[ids[i]];
    out.push({ pts, closed: trail.closed, fade, tint });
  }
}

function polyTrails(idx, def) {
  let cached = polyTrailCache.get(idx);
  if (cached) return cached;
  cached = edgeTrails(def.edges, def.verts.length).map((t) => {
    // A closed walk drops its repeated last vertex and lets the renderer wrap,
    // so a pulse goes round forever instead of stopping where it started.
    const closed = isClosed(t);
    const ids = closed ? t.slice(0, -1) : t;
    const segs = closed ? ids.length : ids.length - 1;
    return {
      ids,
      closed,
      pts: new Array(ids.length),
      tints: Array.from({ length: segs }, () => new THREE.Color()),
    };
  });
  polyTrailCache.set(idx, cached);
  return cached;
}

function updatePolytope(dt) {
  angles.xw += state.rotXW * dt;
  angles.yw += state.rotYW * dt;
  angles.zw += state.rotZW * dt;
  angles.xy += 0.05 * dt;

  const idx = Math.round(state.poly);
  polyGroup.visible = state.showPoly && idx > 0;
  polyCount = 0;
  if (!polyGroup.visible) { polyLines.setPaths([]); polyVerts.set([]); return; }

  const def = POLYTOPES[idx];
  const s = state.polyScale;
  const n = def.verts.length;
  polyCount = n;
  let minW = Infinity;
  let maxW = -Infinity;

  for (let i = 0; i < n; i++) {
    const v = def.verts[i];
    const p = scratch4;
    p[0] = v[0]; p[1] = v[1]; p[2] = v[2]; p[3] = v[3];
    rotatePlane(p, PLANES.xy, angles.xy);
    rotatePlane(p, PLANES.xw, angles.xw);
    rotatePlane(p, PLANES.yw, angles.yw);
    rotatePlane(p, PLANES.zw, angles.zw);
    wValues[i] = p[3];
    minW = Math.min(minW, p[3]);
    maxW = Math.max(maxW, p[3]);
    project4to3(p, state.eyeW, projected[i]).multiplyScalar(s);
  }

  // Colour by depth in w: edges nearer the 4D viewpoint run hot, far ones cold.
  const span = Math.max(maxW - minW, 1e-4);
  // ONE WALK, NOT THIRTY-TWO SEGMENTS
  //
  // Each edge used to be its own two-point path. A pulse on a two-point path
  // has a single segment to live on, and every path is given its own phase, so
  // the figure blinked chords at random instead of being traced — nothing ever
  // turned a corner, because there was no corner to turn. Chained into trails,
  // the light enters a vertex on one edge and leaves on another, and the
  // tesseract's thirty-two edges become a single closed circuit.
  polyPaths.length = 0;
  for (const trail of polyTrails(idx, def)) {
    const { ids, pts, tints } = trail;
    for (let i = 0; i < ids.length; i++) pts[i] = projected[ids[i]];
    for (let i = 0; i < tints.length; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      const t = ((wValues[a] + wValues[b]) / 2 - minW) / span;
      tints[i].copy(layer.poly).lerp(layer.polyAlt, t).multiplyScalar(0.55 + t * 0.75);
    }
    polyPaths.push({ pts, tints, closed: trail.closed, fade: 1 });
  }
  polyLines.setPaths(polyPaths);

  vertList.length = 0;
  const vsize = state.polyNodeSize;
  if (vsize > 0.001) {
    for (let i = 0; i < n; i++) {
      const b = vertexBeat(i);
      vertList.push({ pos: projected[i], radius: vsize * s * (0.6 + b * 0.4), fade: b });
    }
  }
  polyVerts.set(vertList);
}

const tetherPaths = [];

/**
 * Bind each projected 4D vertex to the lattice node nearest it, and let that
 * node brighten and swell as the vertex approaches. The polytope stops being a
 * separate object floating over the pattern and starts playing it.
 */
function updateTethers() {
  for (const n of primaryNodes) n.exc = 0;
  tetherPaths.length = 0;

  if (state.tethers > 0.01 && polyGroup.visible && primaryNodes.length) {
    const reach = 2.6;
    for (let i = 0; i < polyCount; i++) {
      const v = projected[i];
      let best = null;
      let bestD = Infinity;
      for (const n of primaryNodes) {
        const d = n.pos.distanceToSquared(v);
        if (d < bestD) { bestD = d; best = n; }
      }
      const closeness = Math.max(0, 1 - Math.sqrt(bestD) / reach);
      if (best) best.exc = Math.max(best.exc, closeness);
      if (closeness > 0.002) tetherPaths.push({ pts: [v, best.pos], fade: state.tethers * closeness });
    }
  }
  tetherLines.setPaths(tetherPaths);
}

// ---------------------------------------------------------------- the core

const fibrePool = Array.from(
  { length: MAX_FIBRES * (MAX_CORE_DEPTH + 1) * FIBRE_SEGMENTS },
  () => new THREE.Vector3(),
);
let fibreCursor = 0;
const takeFibrePoint = () => fibrePool[fibreCursor++];
const corePaths = [];
const coreTints = Array.from({ length: MAX_FIBRES * (MAX_CORE_DEPTH + 1) }, () => new THREE.Color());
const _latticeScratch = new THREE.Vector3();
let coreWanted = 0;

const rotate4 = (p) => {
  rotatePlane(p, PLANES.xy, angles.xy * 0.5);
  rotatePlane(p, PLANES.xw, angles.xw);
  rotatePlane(p, PLANES.yw, angles.yw);
  rotatePlane(p, PLANES.zw, angles.zw);
};

/**
 * The core is drawn at several nested scales at once, each a constant ratio
 * smaller than the one outside it. Advancing every level's exponent by the same
 * continuously increasing amount makes the whole stack climb outward while a
 * new level is always being born at the centre — so the structure emerges from
 * the singularity forever without ever visibly restarting. It is the Droste
 * construction: self-similar under a scale-and-rotate, which is exactly the
 * symmetry a logarithmic spiral has, and why the levels read as spiralling out
 * rather than merely growing.
 */
function updateCore() {
  corePaths.length = 0;
  fibreCursor = 0;
  coreWanted = 0;
  if (!state.showCore) { coreLines.setPaths([]); return; }

  const count = Math.min(Math.round(state.fibres), MAX_FIBRES, circles.length);
  if (count === 0) { coreLines.setPaths([]); return; }

  const depth = Math.min(Math.round(state.coreDepth), MAX_CORE_DEPTH);
  const ratio = state.coreRatio;
  const emerging = state.coreZoom > 0.003 && depth > 1;
  // While emerging, the stack carries one extra level: the innermost is always
  // half-born and the outermost half-gone, so at the moment the climb completes
  // a full step the arrangement is identical again and the loop is seamless.
  const levels = emerging ? depth + 1 : depth;
  const climb = emerging ? frac(clock * state.coreZoom) : 0;
  const cap = coreLines.core.instanceMatrix.count;

  for (let d = 0; d < levels; d++) {
    const step = d + climb;
    const levelScale = state.coreScale * Math.pow(ratio, step);

    let levelFade = 1;
    if (emerging) {
      // Born at the centre, gone by the outermost step.
      levelFade = Math.min(
        smoothstep(0, 0.85, step),
        smoothstep(depth, depth - 0.85, step),
      );
      if (levelFade < 0.01) continue;
    }

    const twist = step * state.coreTwist;
    const cs = Math.cos(twist);
    const sn = Math.sin(twist);

    for (let i = 0; i < count; i++) {
      coreWanted += FIBRE_SEGMENTS;
      if (fibreCursor + FIBRE_SEGMENTS > fibrePool.length) continue;
      if (corePaths.length * FIBRE_SEGMENTS >= cap) continue;

      const c = circles[i];
      const v = axialToVec(c.q, c.r, 1, _latticeScratch);
      const pts = buildFibre(v.x, v.y, state.spread, FIBRE_SEGMENTS, rotate4, takeFibrePoint, 4.5);
      for (const q of pts) {
        q.multiplyScalar(levelScale);
        const x = q.x;
        q.set(x * cs - q.y * sn, x * sn + q.y * cs, q.z);
      }

      const t = count > 1 ? i / (count - 1) : 0;
      const tint = coreTints[(d * MAX_FIBRES + i) % coreTints.length];
      tint.copy(layer.core).lerp(layer.coreAlt, t);
      // Inner levels run hotter, so the eye is pulled toward where they emerge.
      tint.lerp(WHITE, 0.35 * (1 - step / Math.max(depth, 1)));
      corePaths.push({
        pts,
        closed: true,
        fade: levelFade * (1 - t * 0.3),
        tint,
        phase: t + d * 0.31,
      });
    }
  }
  coreLines.setPaths(corePaths);
}

// ---------------------------------------------------------------- toroid

const torPool = Array.from({ length: MAX_TOR_LINES * MAX_TOR_POINTS }, () => new THREE.Vector3());
let torCursor = 0;
const takeTorPoint = () => torPool[torCursor++];
const torTints = Array.from({ length: MAX_TOR_LINES }, () => new THREE.Color());
const strandPaths = Array.from({ length: MAX_TOR_STRANDS }, () => []);

/**
 * One donut, several strands. Each strand gets its own share of the streamlines
 * and its own sign of flow, and — crucially — its own group, whose rotation is
 * driven by one of the merkaba's two pyramids. Strand 0 turns with the upward
 * tetrahedron, strand 1 with the downward one, so the energy running the torus
 * is genuinely counter-threaded rather than two copies of the same motion.
 */
function updateToroid() {
  torCursor = 0;
  const strands = Math.min(Math.round(state.torStrands), MAX_TOR_STRANDS);
  const on = state.showToroid;

  for (let sIdx = 0; sIdx < MAX_TOR_STRANDS; sIdx++) {
    const active = on && sIdx < strands;
    strandGroups[sIdx].visible = active;
    const paths = strandPaths[sIdx];
    paths.length = 0;
    if (!active) { strandLines[sIdx].setPaths(paths); continue; }

    // Alternate strands run their flow and their winding the other way, which
    // is what makes them weave through each other instead of lying alongside.
    const dir = sIdx % 2 === 0 ? 1 : -1;
    const perStrand = Math.max(1, Math.round(state.torLines / strands));
    const windings = state.torWindings * dir;
    const laps = lapsFor(Math.abs(windings));
    const drift = clock * state.torFlow * dir * Math.PI * 2;

    // Resolution follows the winding count, so a tightly-wound tube is still a
    // tube rather than a zigzag, and is shared out among this strand's lines.
    const pts_n = toroidPoints(windings, laps, Math.floor(TOR_STRAND_BUDGET / perStrand));

    for (let i = 0; i < perStrand; i++) {
      if (torCursor + pts_n > torPool.length) break;
      // Offset each strand around the ring so they interleave rather than overlap.
      const phase = ((i / perStrand) + (sIdx / strands) / perStrand) * Math.PI * 2 + drift;
      const pts = toroidStreamline(state.torMajor, state.torMinor, windings, phase, laps, pts_n, takeTorPoint);
      const tint = torTints[(sIdx * 7 + i) % torTints.length];
      tint.copy(sIdx % 2 === 0 ? layer.toroid : layer.toroidAlt)
        .lerp(layer.toroid, i / Math.max(perStrand - 1, 1) * 0.5);
      paths.push({ pts, closed: true, fade: 0.8, tint, phase: i / perStrand });
    }
    strandLines[sIdx].setPaths(paths);

    // Bound to the merkaba: strand 0 rides the upward pyramid, strand 1 the
    // downward one, and any extras alternate after them.
    const parent = sIdx % 2 === 0 ? merkabaUpGroup.rotation.z : merkabaDownGroup.rotation.z;
    strandGroups[sIdx].rotation.z = parent * state.torCouple;
  }
}

// ---------------------------------------------------------------- merkaba

let merkabaCache = null;
const merkabaUpPaths = [];
const merkabaDownPaths = [];

function updateMerkaba() {
  // The angle is advanced whether or not the merkaba is drawn, because the
  // toroid's strands are bound to it — hiding the pyramids should not freeze
  // the energy that runs off them.
  const a = clock * state.merkabaSpin;
  merkabaUpGroup.rotation.z = a;
  merkabaDownGroup.rotation.z = -a;

  merkabaUpGroup.visible = state.showMerkaba;
  merkabaDownGroup.visible = state.showMerkaba;
  if (!state.showMerkaba) { merkabaUp.setPaths([]); merkabaDown.setPaths([]); return; }

  if (!merkabaCache) {
    const geo = new THREE.TetrahedronGeometry(1);
    const edgeGeo = new THREE.EdgesGeometry(geo, 1);
    const posAttr = edgeGeo.getAttribute('position');

    // three.js builds the tetrahedron corner-on to the axes. Turning the vertex
    // at (1,1,1) onto +Z stands it up as a pyramid on the same axis the rig and
    // the toroid turn about — so the mirrored twin becomes an apex-down pyramid
    // and the pair reads as a merkaba rather than as two tilted solids.
    const upright = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(1, 1, 1).normalize(),
      new THREE.Vector3(0, 0, 1),
    );

    merkabaCache = [];
    for (let i = 0; i < posAttr.count; i += 2) {
      merkabaCache.push([
        new THREE.Vector3().fromBufferAttribute(posAttr, i).applyQuaternion(upright),
        new THREE.Vector3().fromBufferAttribute(posAttr, i + 1).applyQuaternion(upright),
      ]);
    }
    geo.dispose();
    edgeGeo.dispose();

    // The same walk the other figures get. A tetrahedron's four corners all
    // have three edges, so it cannot be drawn in one stroke — it comes out as
    // two trails — but within each of those a pulse turns the corner instead of
    // blinking one edge at a time. Built once with the cache: the tetrahedra
    // never change shape, only the scale of the group holding them.
    const welded = weld(merkabaCache);
    merkabaUpPaths.length = 0;
    merkabaDownPaths.length = 0;
    for (const t of edgeTrails(welded.edges, welded.points.length)) {
      const closed = isClosed(t);
      const ids = closed ? t.slice(0, -1) : t;
      const pts = ids.map((i) => welded.points[i]);
      merkabaUpPaths.push({ pts, closed, fade: 1 });
      merkabaDownPaths.push({ pts, closed, fade: 1 });
    }
  }

  const s = state.merkabaSize;
  merkabaUpGroup.scale.setScalar(s);
  merkabaDownGroup.scale.set(s, s, -s);   // the inverted twin
  merkabaUp.setRadius(state.lineWidth / s);
  merkabaDown.setRadius(state.lineWidth / s);

  merkabaUp.setPaths(merkabaUpPaths);
  merkabaDown.setPaths(merkabaDownPaths);
}

// ---------------------------------------------------------------- fibonacci

const spiralPool = Array.from({ length: MAX_SPIRALS * (SPIRAL_POINTS + 1) }, () => new THREE.Vector3());
let spiralCursor = 0;
const takeSpiralPoint = () => spiralPool[spiralCursor++];
const spiralPaths = [];
const phylloList = [];
let phylloCache = [];
let phylloCacheN = -1;

function updateFibonacci() {
  spiralPaths.length = 0;
  spiralCursor = 0;
  phylloList.length = 0;

  if (!state.showFib) {
    spiralLines.setPaths([]);
    phylloSpheres.set([]);
    return;
  }

  const arms = Math.min(Math.round(state.spiralArms), MAX_SPIRALS);
  for (let i = 0; i < arms; i++) {
    // Arms evenly spaced round the turn; the spiral itself also creeps with the
    // clock so growth reads as continuous rather than as a static drawing.
    const phase = (i / arms) * Math.PI * 2 + clock * state.emanate * Math.PI;
    const pts = goldenSpiral(3, SPIRAL_POINTS, outerR, state.spiralRise, phase, takeSpiralPoint);
    spiralPaths.push({ pts, fade: 0.85, phase: i / arms });
  }
  spiralLines.setPaths(spiralPaths);

  const n = Math.min(Math.round(state.phyllo), MAX_PHYLLO);
  if (n > 0) {
    if (phylloCacheN !== n) { phylloCache = phyllotaxis(n, 1, []); phylloCacheN = n; }
    const spin = clock * state.emanate * 0.5;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    for (let i = 0; i < phylloCache.length; i++) {
      const p = phylloCache[i];
      const pos = phylloPool[i];
      pos.set((p.x * cs - p.y * sn) * outerR, (p.x * sn + p.y * cs) * outerR, 0);
      let scale = 1;
      if (state.wrap > 0.001) {
        scale = wrapToSphere(pos, state.wrap, outerR * 0.85, 1 / outerR, null);
      }
      phylloList.push({
        pos,
        radius: state.phylloSize * outerR * scale,
        fade: 0.5 + 0.5 * (1 - p.t),
      });
    }
  }
  phylloSpheres.set(phylloList);
}

const phylloPool = Array.from({ length: MAX_PHYLLO }, () => new THREE.Vector3());

// ------------------------------------------------------ metatron spirals

const mspiralPool = Array.from({ length: MAX_MSPIRALS * MSPIRAL_PTS }, () => new THREE.Vector3());
const mspiralCursor = { i: 0 };
const mspiralPaths = [];
const mspiralTints = Array.from({ length: MAX_MSPIRALS }, () => new THREE.Color());
const mspiralFades = Array.from({ length: MAX_MSPIRALS }, () => new Float32Array(MSPIRAL_PTS));

/**
 * Logarithmic spirals tuned to Metatron's hexagons: φ per 60°, so each crosses
 * one of a hexagon's six vertex directions every step, the radius multiplying
 * by φ. They run inward almost to the centre and outward past the figure,
 * fading as they go — a full turn multiplies the radius by φ⁶, so they leave
 * quickly.
 */
function updateMetatronSpirals() {
  mspiralPaths.length = 0;
  mspiralCursor.i = 0;
  if (!state.showSpirals || HEXAGONS.length === 0) { mspiralLines.setPaths([]); return; }

  const count = Math.min(Math.round(state.mspirals), MAX_MSPIRALS);
  if (count === 0) { mspiralLines.setPaths([]); return; }

  const out = Math.round(state.mspiralReach);
  // No fudge factor: at scale 1 the spiral passes exactly through a vertex,
  // which is the whole claim.
  const scale = state.mspiralScale * joinCurrentSize;
  const turn = clock * state.mspiralTurn;

  for (let i = 0; i < count; i++) {
    // Spread across the four hexagons first, then across each hexagon's six
    // starting vertices, so low counts still sample every plane.
    const hex = i % HEXAGONS.length;
    const start = Math.floor(i / HEXAGONS.length);
    const pts = metatronSpiral(hex, start, MSPIRAL_STEPS_IN, out, MSPIRAL_PER_STEP,
      scale, mspiralPool, mspiralCursor);
    if (pts.length < 2) continue;

    if (turn !== 0) {
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      for (const q of pts) {
        const x = q.x;
        q.set(x * c - q.y * sn, x * sn + q.y * c, q.z);
      }
    }

    const tint = mspiralTints[i].copy(layer.joins).lerp(layer.joinsAlt, i / Math.max(count - 1, 1));

    // One path for the whole spiral, carrying a per-point fade. Splitting it
    // into separately-faded runs would restart the beam's comet at every join;
    // this way a single head can run the entire curve from centre to deep space.
    const fades = mspiralFades[i];
    for (let a = 0; a < pts.length; a++) {
      const step = pts[a].step ?? 0;
      fades[a] = smoothstep(-MSPIRAL_STEPS_IN, -MSPIRAL_STEPS_IN + 2.5, step)
        * (1 - smoothstep(out - 1.1, out, step));
    }
    mspiralPaths.push({ pts, fades, fade: state.mspiralFade, tint, phase: i / count });
  }
  mspiralLines.setPaths(mspiralPaths);
}

// ---------------------------------------------------------------- stars

const starHosts = Array.from({ length: MAX_STARS }, () => ({
  pos: new THREE.Vector3(), radius: 0, fade: 0,
}));
const starList = [];
const _starDir = new THREE.Vector3();

/**
 * STARS
 *
 * The node markers turned out to be the best thing in the piece — a hard core
 * with diffraction spikes reads as a point of light in a way no sphere does —
 * but they were tied to the lattice, so they could only ever appear where the
 * figure had a vertex. This is the same spark, freed from the figure: thrown
 * out of the centre in every direction and left to travel.
 *
 * Directions come from `armDirection`, the emitter's own distribution, so one
 * control takes them from a flat ring in the mandala's plane to an even sphere
 * — the golden angle again, packing a sphere rather than a sunflower.
 *
 * Each star is given its own place in the journey by the golden ratio rather
 * than by an even division. An even division makes them leave in ranks, which
 * reads as a machine; an irrational step scatters them along the whole path at
 * any count, which reads as a sky.
 */
function updateStars() {
  starField.visible = state.showStars;
  if (!state.showStars) { starField.count = 0; return; }

  const count = Math.min(Math.round(state.starCount), MAX_STARS);
  const reach = state.starReach;
  const spread = state.starSpread;
  const rate = state.starRate;
  starList.length = 0;

  for (let i = 0; i < count; i++) {
    const host = starHosts[i];
    const u = frac(clock * rate + (i * 0.6180339887) % 1);
    armDirection(i, count, spread, _starDir);
    host.pos.copy(_starDir).multiplyScalar(u * reach);

    // Full strength almost at once, then dissolving at the rim. Fading in from
    // zero would make them appear a third of the way out and read as coming
    // from a shell rather than from the centre — the same mistake the emitter
    // made, and the same fix.
    host.fade = Math.min(u / 0.05, 1) * (1 - smoothstep(0.7, 1, u));
    host.radius = state.starSize * (0.35 + u * 1.2);
    starList.push(host);
  }

  starField.faceCamera(camera);
  starField.set(starList, state.starGlow * 3.4, 1);
}

// ---------------------------------------------------------------- extensions

const extPool = Array.from({ length: EXT_SEGMENTS + 8 }, () => new THREE.Vector3());
const extPaths = [];
const extDotList = [];
let extClamped = 0;

/**
 * Draw whatever the active extension last produced.
 *
 * The geometry arrives as flat arrays of numbers — the contract is deliberately
 * that narrow, so an extension needs to know nothing about three.js — and is
 * copied into the pooled vectors the linework wants. Nothing is allocated here;
 * the pool is the ceiling, and going over it is reported rather than dropped in
 * silence, the same as the lattice does.
 */
function updateExtensions() {
  extGroup.visible = state.showExt;
  if (!state.showExt) {
    extLines.setPaths([]);
    extDots.set([]);
    extClamped = 0;
    return;
  }

  const out = extensionGeometry(clock);
  if (!out) { extLines.setPaths([]); extDots.set([]); return; }

  extPaths.length = 0;
  extDotList.length = 0;
  extClamped = 0;
  let n = 0;

  for (const path of out.paths) {
    const count = path.points.length / 3;
    if (count < 2) continue;
    if (n + count > extPool.length) { extClamped += count; continue; }
    const pts = [];
    for (let i = 0; i < count; i++) {
      const v = extPool[n++];
      v.set(path.points[i * 3], path.points[i * 3 + 1], path.points[i * 3 + 2])
        .multiplyScalar(state.extScale);
      pts.push(v);
    }
    extPaths.push({ pts, closed: path.closed, fade: 1 });
  }

  const size = state.extDotSize;
  if (size > 0.001) {
    for (const d of out.dots) {
      if (extDotList.length >= EXT_DOTS) { extClamped++; break; }
      extDotList.push({
        pos: _extDot.set(d.x, d.y, d.z).multiplyScalar(state.extScale).clone(),
        radius: size * d.r,
        fade: 1,
      });
    }
  }

  extGroup.rotation.z = clock * state.extSpin;
  extLines.setPaths(extPaths);
  extDots.set(extDotList);
}

const _extDot = new THREE.Vector3();

// ---------------------------------------------------------------- emitter

const armPool = Array.from({ length: MAX_ARMS }, () => new THREE.Vector3());
const rayPool = Array.from({ length: MAX_ARMS * 2 }, () => new THREE.Vector3());
const rayPaths = [];
const armTints = Array.from({ length: MAX_ARMS }, () => new THREE.Color());
const emHosts = [];
const emHostPool = Array.from({ length: MAX_ARMS * MAX_BEADS }, () => ({
  pos: new THREE.Vector3(), radius: 0, fade: 0,
}));
const _emMat = new THREE.Matrix4();
const _emQuat = new THREE.Quaternion();
const _emScale = new THREE.Vector3();
const _emColor = new THREE.Color();
const EM_SPIN_AXIS = new THREE.Vector3(0.3, 0.6, 0.74).normalize();
const VIEW_AXIS = new THREE.Vector3(0, 0, 1);
const _emFaceQ = new THREE.Quaternion();
const _emRollQ = new THREE.Quaternion();
const _emWorldQ = new THREE.Quaternion();
let emSlots = [];
let emActiveForm = -1;
let emActiveLook = -1;
let emLastRainbow = -1;

/**
 * Pure geometry radiating from the centre: a ray down each arm, and a row of
 * particles released along it one after another. Arm directions come from
 * `armDirection`, which blends a flat ring into a Fibonacci sphere so one
 * control takes it from rose window to starburst.
 *
 * The particles carry the weight of the layer now — form, material, spin, hue
 * and a spiral twist — so they are managed directly rather than through a field.
 */
function updateEmitter() {
  rayPaths.length = 0;
  emHosts.length = 0;
  emitterGroup.visible = state.showEmitter;
  if (!state.showEmitter) {
    emRayLines.setPaths([]);
    emBeads.count = 0;
    emPrism.count = 0;
    for (const e of spriteMeshes) e.mesh.count = 0;
    return;
  }

  const form = Math.min(Math.round(state.emForm), FORMS.length - 1);
  const look = Math.min(Math.round(state.emLook), EM_MATS.length - 1);
  const isImage = !!FORMS[form].image;

  // A picture has no back, so the image form billboards whether or not the
  // switch is on — an edge-on card is an invisible one.
  const facing = isImage || state.emFace;

  if (!isImage) {
    if (form !== emActiveForm) { emBeads.geometry = EM_GEOM[form]; emActiveForm = form; }
    if (look !== emActiveLook) { emBeads.material = EM_MATS[look]; emActiveLook = look; }
  }
  emBeads.visible = !isImage;
  spriteGroup.visible = isImage;

  // The library is dealt across the arms one image per mesh. Resolving it here
  // rather than per bead means a slot's texture and blend mode are settled once
  // a frame, not sixty times.
  emSlots = isImage ? resolveSprites(state.emImage).slice(0, MAX_SPRITE_MESHES) : [];
  for (let k = 0; k < emSlots.length; k++) prepareSpriteMesh(k, emSlots[k].id, look);
  for (let k = emSlots.length; k < spriteMeshes.length; k++) spriteMeshes[k].mesh.count = 0;
  const slotN = emSlots.map(() => 0);

  // Billboarding, computed once. The particles sit inside a group that is
  // itself spinning, so the group's own world rotation has to be undone before
  // the camera's is applied — otherwise Spin would drag the cards round with it.
  if (facing) {
    emitterGroup.getWorldQuaternion(_emWorldQ);
    _emFaceQ.copy(_emWorldQ).invert().multiply(camera.quaternion);
  }

  // Instance colour tints the diffuse term, but at metalness 0.45 the reflected
  // environment drowns it — rainbow hearts came out uniformly violet because the
  // sky is violet. Turning the metal and the reflection down as the rainbow
  // comes up lets the hue actually be the hue. Only on change: these are
  // material properties, not per-instance.
  if (state.emRainbow !== emLastRainbow) {
    const r = state.emRainbow;
    for (const m of [EM_MATS[0], EM_MATS[1]]) {
      m.metalness = 0.45 * (1 - r * 0.85);
      m.envMapIntensity = 2.4 * (1 - r * 0.65);
      m.roughness = 0.18 + r * 0.22;
    }
    emLastRainbow = r;
  }

  emitterGroup.rotation.z = clock * state.emSpin;

  const arms = Math.min(Math.round(state.emArms), MAX_ARMS);
  const beads = Math.min(Math.round(state.emBeads), MAX_BEADS);
  const reach = state.emReach;
  const spread = state.emSpread;
  const twist = state.emTwist * Math.PI * 2;
  const rainbow = state.emRainbow;
  let n = 0;

  for (let i = 0; i < arms; i++) {
    const dir = armDirection(i, arms, spread, armPool[i]);
    const tint = armTints[i];
    tint.copy(layer.emitter).lerp(layer.emitterAlt, i / Math.max(arms - 1, 1));

    if (state.emRays > 0.004) {
      const a = rayPool[i * 2].set(0, 0, 0);
      const b = rayPool[i * 2 + 1].copy(dir).multiplyScalar(reach);
      rayPaths.push({ pts: [a, b], fade: state.emRays, tint });
    }

    for (let j = 0; j < beads && n < emHostPool.length; j++) {
      const u = frac(clock * state.emFlow + j / beads + i * 0.017);
      const host = emHostPool[n];
      host.pos.copy(dir).multiplyScalar(u * reach);

      // The twist is what turns straight rays into spiral emanations: each
      // particle is carried further around the axis the further out it has
      // travelled, so a row of them traces a spiral rather than a spoke.
      if (twist !== 0) {
        const a = u * twist;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const x = host.pos.x;
        host.pos.set(x * c - host.pos.y * sn, x * sn + host.pos.y * c, host.pos.z);
      }

      // EMISSION STARTS AT THE CENTRE
      //
      // This was sin(u·π), which is *zero* at u = 0 — so a particle was
      // invisible exactly where it was born and only faded up a third of the
      // way out. The emission read as coming from a shell around the middle
      // rather than from the point everything else in the piece is built
      // around. It now reaches full strength within the first few percent of
      // the ray and keeps it until it dissolves at the rim, so the stream is
      // continuous from the centre of the Metatron and the hypercube outward.
      const fade = Math.min(u / 0.06, 1) * (1 - smoothstep(0.72, 1, u));
      host.radius = state.emBeadSize * (0.45 + u * 0.9);
      host.fade = fade;

      // Rainbow runs the hue along the arm, so a stream of hearts or flowers
      // cycles the spectrum as it travels rather than being one flat colour.
      if (rainbow > 0.004) {
        _emColor.setHSL(frac(state.hue + u + (i / arms) * 0.3), 0.95, 0.6);
        _emColor.lerp(tint, 1 - rainbow);
      } else {
        _emColor.copy(tint);
      }
      // Matter is lit rather than additive, so fading it toward black would
      // read as dirt. Its brightness comes from the light instead.
      const shade = look === 0 ? 0.35 + fade * 0.65 : fade;
      _emColor.multiplyScalar(Math.max(shade, 0));

      const turn = clock * state.emTumble + i * 0.7 + j;
      if (facing) {
        // Square to the viewer, then rolled in the picture plane, so Tumble
        // still turns the particle instead of being cancelled by the billboard.
        _emRollQ.setFromAxisAngle(VIEW_AXIS, turn);
        _emQuat.copy(_emFaceQ).multiply(_emRollQ);
      } else {
        _emQuat.setFromAxisAngle(EM_SPIN_AXIS, turn);
      }
      if (isImage) {
        if (emSlots.length) {
          const k = i % emSlots.length;
          const entry = spriteMeshes[k];
          _emScale.set(host.radius * entry.aspectX, host.radius * entry.aspectY, host.radius);
          _emMat.compose(host.pos, _emQuat, _emScale);
          const mesh = entry.mesh;
          const at = slotN[k]++;
          mesh.setMatrixAt(at, _emMat);
          // The picture carries its own colour, so a lit shade would only
          // muddy it — the tint is brightness and the rainbow, nothing more.
          mesh.setColorAt(at, _emColor);
        }
      } else {
        _emScale.setScalar(host.radius);
        _emMat.compose(host.pos, _emQuat, _emScale);
        emBeads.setMatrixAt(n, _emMat);
        emBeads.setColorAt(n, _emColor);
      }
      emHosts.push(host);
      n++;
    }
  }

  if (isImage) {
    emBeads.count = 0;
    for (let k = 0; k < emSlots.length; k++) {
      const mesh = spriteMeshes[k].mesh;
      mesh.count = slotN[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  } else {
    emBeads.count = n;
    emBeads.instanceMatrix.needsUpdate = true;
    if (emBeads.instanceColor) emBeads.instanceColor.needsUpdate = true;
  }
  emRayLines.setPaths(rayPaths);

  if (state.prism > 0.004 && n > 0) {
    emPrism.faceCamera(camera);
    emPrism.set(emHosts, state.prismSize * 2.6, state.prism);
  } else {
    emPrism.count = 0;
  }
}

// ---------------------------------------------------------------- loop

let controls;
let heavy = true;
let last = performance.now();
let loadEl = null;
let solidInfoEl = null;
let solidInfoLast = '';

function onChange(key) {
  if (key === '*' || HEAVY_KEYS.has(key)) heavy = true;
  applyLook();
}

function tick() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const t = dt * state.time;
  clock += t;

  rig.rotation.z += state.spin * t;
  if (!state.solidBind) {
    solidGroup.rotation.y += state.spin * 0.8 * t;
    solidGroup.rotation.x += state.spin * 0.35 * t;
  }

  if (heavy) { rebuildEnvironment(); heavy = false; }

  // The beam window has to be current before any layer rebuilds its paths,
  // because the fade is folded into that rebuild. Head speed is matched to the
  // particles exactly, so the comet and the particle riding it travel together.
  const beamStyle = PULSE_STYLES[Math.round(state.pulseStyle)] || PULSE_STYLES[0];
  BEAM.time = clock;
  // With the particles switched off the lines must stop travelling as well.
  // Leaving the beam running meant comet heads still swept the edges, so the
  // vertices kept flashing with no control switched on to explain it.
  BEAM.tail = state.showPulses ? state.beamTail : 1;
  BEAM.count = Math.max(1, Math.round(state.pulses));
  BEAM.speed = state.pulseSpeed * beamStyle.speed;

  // Order matters: the fit sizes Metatron, Metatron solves its points, and the
  // lattice and the bound solid can both be placed onto them.
  computeFit();
  updateJoins();
  rebuildLattice();
  updateSolid();
  updatePolytope(t);
  updateCore();
  // Merkaba first: the toroid's strands read its rotation.
  updateMerkaba();
  updateToroid();
  updateFibonacci();
  updateEmitter();
  updateExtensions();
  updateStars();
  updateTethers();
  paintLattice();
  updateMetatronSpirals();

  const p = state.showPulses ? Math.round(state.pulses) : 0;
  const ps = state.pulseSpeed;
  const style = PULSE_STYLES[Math.round(state.pulseStyle)] || PULSE_STYLES[0];
  const psz = state.pulseSize;
  joinLines.updatePulses(clock, ps, p, style, psz);
  polyLines.updatePulses(clock, ps * 1.4, p, style, psz);
  solidLines.updatePulses(clock, ps * 1.2, p, style, psz);
  tetherLines.updatePulses(clock, ps * 2, p ? 1 : 0, style, psz);
  coreLines.updatePulses(clock, ps * 0.5, p, style, psz);
  for (let i = 0; i < strandLines.length; i++) {
    strandLines[i].updatePulses(clock, ps * 0.7 * (i % 2 === 0 ? 1 : -1), p, style, psz);
  }
  emRayLines.updatePulses(clock, ps * 1.6, p, style, psz);
  extLines.updatePulses(clock, ps, p, style, psz);
  mspiralLines.updatePulses(clock, ps * 0.6, p, style, psz);
  merkabaUp.updatePulses(clock, ps * 1.1, p, style, psz);
  merkabaDown.updatePulses(clock, -ps * 1.1, p, style, psz);
  spiralLines.updatePulses(clock, ps * 0.8, p, style, psz);
  rectLines.updatePulses(clock, ps * 0.6, p ? 1 : 0, style, psz);

  if (solidInfoEl) {
    const idx = Math.round(state.solid);
    let txt = '';
    if (state.showSolid && idx > 0) {
      const kind = SOLIDS[idx].id;
      if (state.solidBind) {
        const reach = solidReach(kind, state.solidJitter);
        const pct = Math.round((reach / METATRON_REACH) * 100);
        const t = shareTally(kind, state.solidJitter);
        const parts = [];
        if (t.onVertex) parts.push(`${t.onVertex} on its vertices`);
        if (t.onFace) parts.push(`${t.onFace} on face centres`);
        if (t.onOctaEdge) parts.push(`${t.onOctaEdge} on the golden section of the octahedron’s edges`);
        if (t.unrelated) parts.push(`${t.unrelated} on no feature at all`);
        txt = `${SOLIDS[idx].name} — ${DERIVED[kind].from}. `
          + `Of ${t.total} vertices: ${parts.join(', ')}. Reaches ${pct}% of the hull.`;
      } else {
        txt = `${SOLIDS[idx].name} — free-floating, sharing nothing.`;
      }
    }
    if (txt !== solidInfoLast) { solidInfoEl.textContent = txt; solidInfoLast = txt; }
  }

  if (loadEl) {
    const clamped = latticeWanted > MAX_NODES;
    const nsWarn = nodeSolidsClamped > 0;
    let txt;
    if (latticeShed) {
      // Name exactly what was given up and why, so the number on the slider and
      // the thing on screen never disagree without saying so.
      const a = latticeShed.asked;
      const g = latticeShed.got;
      const parts = [];
      if (g.echoes !== a.echoes) parts.push(`echoes ${a.echoes}\u2192${g.echoes}`);
      if (g.layers !== a.layers) parts.push(`depth ${a.layers}\u2192${g.layers}`);
      if (g.shells !== a.shells) parts.push(`shells ${a.shells}\u2192${g.shells}`);
      txt = `lattice ${latticeWanted} instances \u2014 ${parts.join(', ')} to fit`;
    } else if (nsWarn) {
      txt = `lattice ${latticeWanted} \u00b7 node solids ${MAX_NODE_SOLIDS} of ${nodeSolidsClamped} \u2014 clamped`;
    } else {
      txt = `lattice ${latticeWanted} instances`;
    }
    loadEl.textContent = txt;
    loadEl.classList.toggle('warn', !!latticeShed || nsWarn);
  }

  // Prism coronas, after everything has placed its particles and vertices.
  const prismOn = state.prism;
  const prismScale = state.prismSize;
  for (const l of ALL_LINES) l.updatePrism(camera, prismOn, prismScale);
  updateVertexPrisms(prismOn, prismScale);

  // In XR the headset owns the camera and the frame is stereo, so the orbit
  // controls and the screen-space post pass both step aside.
  if (renderer.xr.isPresenting) {
    world.position.set(0, state.xrHeight, -state.xrDistance);
    world.scale.setScalar(state.xrScale);
    renderer.render(scene, camera);
  } else {
    world.position.set(0, 0, 0);
    world.scale.setScalar(1);
    controls.update();
    if (post) post.render(); else renderer.render(scene, camera);
  }
}

/** Every line layer, for the passes that touch all of them. */
const ALL_LINES = [joinLines, solidLines, rectLines, polyLines, tetherLines,
  coreLines, merkabaUp, merkabaDown, spiralLines, emRayLines, mspiralLines,
  anchorLines, spokeLines, extLines, ...strandLines];

const vertexHosts = [];
const EMPTY = [];

/** Coronas on the vertex spheres, mirroring whatever each field last drew. */
function updateVertexPrisms(strength, scale) {
  const pairs = [
    [joinPrism, joinNodeList],
    [solidPrism, solidVertList],
    [polyPrism, vertList],
    // Glow nodes are already billboards carrying their own halo; a prism corona
    // on top would double-draw, and nodePrism's smaller cap would silently clamp
    // the list as well. Only the mesh surfaces need it.
    [nodePrism, Math.round(state.nodeLook) === 0 ? EMPTY : nodeList],
  ];
  for (const [halo, list] of pairs) {
    if (strength <= 0.004 || !list.length || !halo.parent.visible) { halo.count = 0; continue; }
    halo.faceCamera(camera);
    vertexHosts.length = 0;
    for (const h of list) vertexHosts.push(h);
    halo.set(vertexHosts, scale * 2.2, strength);
  }
}

const BASE_FOV = 50;

function reframe(w, h) {
  const open = document.body.classList.contains('panel-open');
  camera.zoom = 1;
  if (!open) { camera.clearViewOffset(); return; }

  // The offset shifts the rendered window sideways so the figure sits in the
  // space the panel is not covering. Half the panel's width is the amount that
  // centres it in what is left.
  if (document.body.classList.contains('landscape')) {
    // Half the panel's own width, since the panel can now be dragged wider or
    // narrower and a fixed fraction would put the figure off centre.
    const panel = document.getElementById('panel');
    const pw = panel ? panel.getBoundingClientRect().width : w * 0.5;
    camera.setViewOffset(w, h, pw * 0.5, 0, w, h);
    camera.zoom = Math.max(0.6, Math.min(1, 1 - (pw / w) * 0.35));
  } else if (w < WIDE) {
    camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    camera.zoom = 0.72;
  } else {
    camera.setViewOffset(w, h, 160, 0, w, h);
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // The XR camera is managed by the session; touching aspect, fov or the view
  // offset while presenting would fight it.
  if (renderer && renderer.xr.isPresenting) return;
  camera.aspect = w / h;

  // three.js fixes the *vertical* field of view, so a tall phone screen crops
  // the figure at the sides. Widening the fov on portrait viewports keeps the
  // horizontal extent constant instead — capped, because past ~78° the
  // perspective distortion starts fighting the geometry.
  const a = Math.min(camera.aspect, 1);
  const widened = THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV) / 2) / a),
  );
  camera.fov = Math.min(widened, 78);
  reframe(w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// ---------------------------------------------------------------- boot

async function boot() {
  renderer = await createRenderer();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  resize();

  createBloom(scene, camera);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 1.5;
  controls.maxDistance = 40;
  controls.autoRotateSpeed = 0.4;

  // Each layer's comet runs at the same multiple of the clock as its particles.
  const BEAM_SPEEDS = [
    [joinLines, 1], [polyLines, 1.4], [solidLines, 1.2], [tetherLines, 2],
    [coreLines, 0.5], [merkabaUp, 1.1], [merkabaDown, -1.1], [spiralLines, 0.8],
    [emRayLines, 1.6], [mspiralLines, 0.6], [rectLines, 0.6], [extLines, 1],
    [anchorLines, 0.9], [spokeLines, 1.3],
  ];
  for (const [layer, mult] of BEAM_SPEEDS) layer.beamSpeed = mult;
  strandLines.forEach((l, i) => { l.beamSpeed = 0.7 * (i % 2 === 0 ? 1 : -1); });

  const ui = buildUI(onChange, resize, {
    list: () => listSetups(),
    save: async () => {
      // Captured before anything else so the picture is of what is on screen
      // at the moment of asking, not of whatever a repaint leaves behind.
      const thumb = window.sandbox?.capture ? await window.sandbox.capture() : null;
      const { item, error } = saveSetup(state, camera, controls, { thumb });
      return error || `kept "${item.name}"`;
    },
    load: (id) => {
      const item = getSetup(id);
      if (!applySetup(item, state, camera, controls)) return 'that piece has gone';
      ui.refresh();
      onChange('*');
      return `opened "${item.name}" — ${describeSetup(item)}`;
    },
    rename: (id, name) => (renameSetup(id, name) ? 'renamed' : 'that piece has gone'),
    remove: (id) => (removeSetup(id) ? 'removed' : 'that piece has gone'),
    status: () => {
      const n = listSetups().length;
      if (!n) return 'nothing kept yet — “keep this” saves what is on screen';
      return `${n} of ${MAX_ITEMS} kept · tap a picture to open it, its name to rename`;
    },
    share: async () => {
      const url = await shareLink(state, camera, controls);
      if (!url) return 'this browser cannot build a link';
      try {
        await navigator.clipboard.writeText(url);
        return `link copied — ${url.length} characters`;
      } catch {
        // Clipboard access needs a secure context and a user gesture, and is
        // refused often enough that failing here should not lose the link.
        console.info('Share link:', url);
        return 'clipboard refused — the link is in the console';
      }
    },
  });
  loadEl = document.getElementById('load');
  solidInfoEl = document.getElementById('solidinfo');

  // The shipped particle folder. Not awaited: a manifest that is slow or absent
  // must not hold the piece back from drawing, and the emitter reads the
  // library live, so the images simply appear the moment they arrive.
  loadSpriteFolder().then(() => ui.refresh());
  loadExtensionLibrary();

  // A link beats a save, and a save beats the defaults. Someone who followed a
  // link came to see that particular position, so it should not be quietly
  // replaced by whatever they last saved on this device.
  // A link beats the defaults. Nothing else does: the defaults are themselves a
  // composition now, and a gallery is a place you choose to go rather than one
  // that opens itself.
  const shared = await takeIncomingLink();
  if (shared) {
    applySetup(shared, state, camera, controls);
    ui.refresh();
  }

  rebuildEnvironment();
  applyLook();
  heavy = false;

  // ---- WebXR
  let xrReady = false;
  try {
    renderer.xr.enabled = true;
    // local-floor puts the origin on the floor, so xrHeight is a real height
    // above it rather than an offset from an arbitrary point.
    renderer.xr.setReferenceSpaceType('local-floor');
    if (await navigator.xr?.isSessionSupported?.('immersive-vr')) {
      document.body.appendChild(VRButton.createButton(renderer));
      xrReady = true;
    }
  } catch (err) {
    console.warn('WebXR unavailable', err);
  }

  renderer.xr.addEventListener('sessionstart', () => {
    controls.enabled = false;
    // Stereo rendering and a screen-space bloom pass do not mix; the per-object
    // halos carry the glow on their own, which is why they exist.
    document.body.classList.add('in-xr');
  });
  renderer.xr.addEventListener('sessionend', () => {
    controls.enabled = true;
    document.body.classList.remove('in-xr');
    resize();
  });

  const backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  const bits = [backend];
  if (post) bits.push('bloom');
  if (xrReady) bits.push('WebXR ready');
  document.getElementById('backend').textContent = bits.join(' + ');

  window.addEventListener('resize', resize);

  /**
   * Keeping the surface in step with the viewport after startup.
   *
   * Two listeners beyond the window's own, covering what it does not report:
   *
   * 1. A ResizeObserver on the canvas, which hears layout changes the window
   *    event does not — including a container change with no window resize.
   * 2. `visualViewport`, for iOS. When the URL bar collapses the visual
   *    viewport changes while the layout viewport does not, so neither the
   *    window event nor the observer fires, yet `innerHeight` — which this
   *    reads — has moved.
   */
  // A phone turned sideways gets the three-column layout. Matched here rather
  // than in the stylesheet so the query exists once: the class drives the CSS
  // and `reframe` reads the same flag, which is what keeps the panel and the
  // artwork from disagreeing about where the edge between them is.
  const sideways = window.matchMedia(RAIL);
  const applyOrientation = () => {
    document.body.classList.toggle('landscape', sideways.matches);
    resize();
  };
  sideways.addEventListener('change', applyOrientation);
  applyOrientation();

  const surface = new ResizeObserver(() => resize());
  surface.observe(renderer.domElement);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }
  renderer.setAnimationLoop(() => {
    controls.autoRotate = state.autoRotate;
    tick();
  });

  // The programmatic seam: `apply` is the single entry point for anything that
  // wants to drive the sandbox from outside — the console, a model, a URL.
  window.sandbox = {
    state,
    scene,
    camera,
    renderer,
    controls,
    apply(patch) {
      Object.assign(state, patch);
      ui.refresh();
      onChange('*');
    },
    /**
     * A thumbnail of what is on screen, as a JPEG data URL.
     *
     * Rendered into an offscreen target and read back, rather than pulled off
     * the canvas with `toDataURL`. A canvas only holds what was last
     * *presented*, and presentation is compositing — so a tab that is hidden,
     * backgrounded or simply mid-frame hands back a stale picture with no error
     * to say so. Measured: two completely different scenes, every layer off in
     * one of them, produced byte-identical captures. Reading the target is
     * deterministic and owes nothing to whether anyone is looking.
     *
     * It also renders through the same pipeline the screen uses, so the
     * thumbnail carries the bloom; and it clears the view offset first, so the
     * shot is of the figure rather than of the figure shoved aside to make room
     * for the panel.
     */
    async capture(w = 240, h = 150) {
      // WebGPU pads every row of a texture read up to a multiple of 256 bytes.
      // At 480 wide a row is 1920, which is padded to 2048, and reading it back
      // as though it were tight shears the picture into diagonal streaks — the
      // first thumbnails were unrecognisable for exactly this reason. A width
      // that is a multiple of 64 makes a row a multiple of 256 already, so
      // there is no padding to account for. 240 becomes 512, twice over.
      const tw = Math.ceil((w * 2) / 64) * 64;
      const target = thumbTarget(tw, Math.round((tw * h) / w));
      const view = camera.view && camera.view.enabled ? { ...camera.view } : null;
      const aspect = camera.aspect;
      const zoom = camera.zoom;

      camera.clearViewOffset();
      camera.aspect = w / h;
      camera.zoom = 1;
      camera.updateProjectionMatrix();

      let data = null;
      try {
        tick();                       // bring the scene up to date, on screen
        renderer.setRenderTarget(target);
        // Straight render, not the bloom pipeline: driving `RenderPipeline`
        // into an offscreen target never returns. The glow is put back in two
        // dimensions afterwards, which for something 240 pixels wide is
        // indistinguishable and costs nothing.
        await renderer.renderAsync(scene, camera);
        // Returns the buffer; it does not fill one that is handed to it. Passing
        // an array here makes it the `textureIndex` argument, which fails later
        // and deep inside as "invalid value used as weak map key".
        const pixels = await renderer.readRenderTargetPixelsAsync(
          target, 0, 0, target.width, target.height,
        );
        data = flipToJpeg(pixels, target.width, target.height, w, h);
      } catch (err) {
        console.warn('Could not render a thumbnail', err);
      } finally {
        renderer.setRenderTarget(null);
        camera.aspect = aspect;
        camera.zoom = zoom;
        if (view) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
        camera.updateProjectionMatrix();
      }
      return data;
    },
    /**
     * Run one update synchronously. A backgrounded tab throttles
     * requestAnimationFrame down to a crawl, so instance counts and matrices
     * read straight after a change are whatever the last real frame left
     * behind — which has repeatedly made a working change look broken and a
     * broken one look fine. This forces the state through.
     */
    frame() {
      tick();
      return true;
    },
  };

  document.body.classList.remove('loading');
  // Open by default where there is room beside the artwork — a wide window, or
  // a phone held sideways, which is the whole point of turning it. Portrait
  // stays closed: there the panel is a sheet over the piece, not beside it.
  if (window.innerWidth > WIDE || sideways.matches) document.body.classList.add('panel-open');
  resize();
  return ui;
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('readout').innerHTML =
    `<div class="r-title">Could not start</div><div class="r-blurb">${err.message}</div>`;
});
