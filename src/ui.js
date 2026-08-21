import { state } from './state.js';
import { STAGES } from './geometry/sacred.js';
import { SOLIDS } from './geometry/platonic.js';
import { POLYTOPES } from './geometry/polytope4d.js';
import { PALETTES } from './lib/palettes.js';
import { PULSE_STYLES } from './lib/energy.js';
import { FORMS } from './geometry/forms.js';
import { interpret } from './ai.js';

const stageAt = (v) => STAGES[Math.min(STAGES.length - 1, Math.max(0, Math.round(v) - 1))];
const CIRCLE_COUNT = { 2: 19, 3: 37, 4: 61 };

/** The visibility row — nine chips, always first, always visible. */
const VISIBILITY = [
  ['showRings', 'Circles'],
  ['showNodes', 'Nodes'],
  ['showJoins', 'Metatron'],
  ['showMerkaba', 'Merkaba'],
  ['showToroid', 'Toroid'],
  ['showCore', 'Singularity'],
  ['showPoly', 'Hypercube'],
  ['showFib', 'Fibonacci'],
  ['showSolid', 'Platonic'],
  ['showPulses', 'Particles'],
  ['showSpirals', 'Spirals'],
  ['showEmitter', 'Pure geometry'],
];

const SPEC = [
  {
    title: 'Time',
    open: true,
    note: 'One clock drives everything. The centre emanates; some streams run back inward.',
    controls: [
      { key: 'time', label: 'Time', min: 0, max: 3, step: 0.01, read: (v) => (v < 0.005 ? 'still' : `${v.toFixed(2)}×`) },
      { key: 'shells', label: 'Emanation', min: 0, max: 6, step: 1, read: (v) => (v === 0 ? 'still figure' : `${v} shells`) },
      { key: 'emanate', label: 'Outward rate', min: 0, max: 0.4, step: 0.005 },
      { key: 'contract', label: 'Inward streams', min: 0, max: 1, step: 0.01, read: (v) => `${Math.round(v * 100)}%` },
    ],
  },
  {
    title: 'Sacred geometry',
    owner: 'showRings',
    // The lattice underpins the joins, the core and Fibonacci's extent as well
    // as the circles themselves, so it stays while any of those are showing.
    when: (s) => s.showRings || s.showNodes || s.showJoins,
    controls: [
      { key: 'wrap', label: 'Sphere wrap', min: 0, max: 1, step: 0.01, read: (v) => (v < 0.005 ? 'flat plane' : v > 0.995 ? 'wrapped' : v.toFixed(2)) },
      { key: 'wrapSpread', label: 'Coverage', min: 0.5, max: 4, step: 0.01, when: (s) => s.wrap > 0.005, read: (v) => `${Math.round((1 - (1 - v * v) / (1 + v * v)) / 2 * 100)}% of the sphere` },
      { key: 'stage', label: 'Stage', min: 1, max: 8, step: 0.01, read: (v) => stageAt(v).name },
      { key: 'extent', label: 'Lattice', min: 2, max: 4, step: 1, read: (v) => `${CIRCLE_COUNT[v]} circles` },
      { key: 'echoes', label: 'Echoes', min: 1, max: 6, step: 1, read: (v) => (v === 1 ? 'single' : `${v}-fold moiré`) },
      { key: 'layers', label: '3D depth', min: 0, max: 3, step: 1, read: (v) => (v === 0 ? 'flat' : `${v * 2 + 1} layers`) },
      { key: 'nodeSize', label: 'Node spheres', min: 0, max: 0.55, step: 0.005 },
      // Glow is a billboard, so it has no silhouette and no highlight — which is
      // the difference between reading as energy and reading as a bubble.
      { key: 'nodeLook', label: 'Node surface', min: 0, max: 2, step: 1, read: (v) => ['Glow — edgeless light', 'Pearl — translucent bubble', 'Matter — solid, sorts correctly'][v] },
      { key: 'nodeGlowSpread', label: 'Glow spread', min: 0.3, max: 3, step: 0.01, when: (s) => Math.round(s.nodeLook) === 0 },
      { key: 'mapToMetatron', label: 'Map onto Metatron', type: 'toggle' },
      { key: 'nodeSolid', label: 'Solid at each node', min: 0, max: 5, step: 1, read: (v) => SOLIDS[v].name },
      { key: 'nodeSolidSize', label: 'Node solid size', min: 0.1, max: 1.5, step: 0.01 },
      { key: 'nodeSolidSpin', label: 'Node solid spin', min: -1, max: 1, step: 0.01 },
      { key: 'radius', label: 'Scale', min: 0.5, max: 1.6, step: 0.01 },
      { key: 'spin', label: 'Spin', min: -0.6, max: 0.6, step: 0.01 },
    ],
  },
  {
    title: 'Metatron’s Cube',
    owner: 'showJoins',
    when: (s) => s.showJoins,
    note: 'One arrangement per dimension: 6 around 1 is a hexagon, 12 around 1 a cuboctahedron, 24 around 1 the 24-cell. Past 3, the same rotation that drives the hypercube turns this too.',
    controls: [
      { key: 'joinDim', label: 'Dimension', min: 2, max: 4, step: 0.01, read: (v) => (v < 2.02 ? '2D — Fruit of Life' : v < 2.98 ? `${v.toFixed(2)}D — lifting` : v < 3.02 ? '3D — cuboctahedron' : v > 3.98 ? '4D — 24-cell' : `${v.toFixed(2)}D — opening`) },
      { key: 'joinReach', label: 'Edge reach', min: 0, max: 1, step: 0.01, read: (v) => (v > 0.99 ? 'every pair' : v < 0.05 ? 'shortest only' : v.toFixed(2)) },
      { key: 'joinSize', label: 'Size', min: 0.2, max: 2.5, step: 0.01 },
      { key: 'joinNodeSize', label: 'Vertex spheres', min: 0, max: 0.2, step: 0.002, read: (v) => (v < 0.001 ? 'off' : v.toFixed(3)) },
      { key: 'joinTumble', label: 'Tumble', min: -0.5, max: 0.5, step: 0.005 },
      { key: 'joinBreath', label: 'Breathe', min: 0, max: 0.6, step: 0.01, read: (v) => (v < 0.005 ? 'fixed' : v.toFixed(2)) },
    ],
  },
  {
    title: 'Toroid',
    owner: 'showToroid',
    when: (s) => s.showToroid,
    note: 'Flow rises through the centre, turns over, and returns around the outside.',
    controls: [
      { key: 'torMajor', label: 'Ring radius', min: 0.4, max: 3.2, step: 0.01 },
      { key: 'torMinor', label: 'Tube radius', min: 0.1, max: 1.6, step: 0.01 },
      // Whole numbers only: a half-integer forces the streamline to take two
      // laps to close, doubling the samples needed for no visual gain.
      { key: 'torWindings', label: 'Windings', min: 1, max: 12, step: 1 },
      { key: 'torLines', label: 'Streamlines', min: 1, max: 20, step: 1 },
      { key: 'torStrands', label: 'Strands', min: 1, max: 4, step: 1, read: (v) => (v === 1 ? 'single' : `${v} interwoven`) },
      { key: 'torCouple', label: 'Bind to merkaba', min: 0, max: 2, step: 0.01, read: (v) => (v < 0.005 ? 'free' : v.toFixed(2)) },
      { key: 'torFlow', label: 'Flow', min: -0.5, max: 0.5, step: 0.005 },
    ],
  },
  {
    title: 'Merkaba',
    owner: 'showMerkaba',
    when: (s) => s.showMerkaba,
    note: 'Two tetrahedra, one inverted, turning against each other.',
    controls: [
      { key: 'merkabaSize', label: 'Size', min: 0.3, max: 3, step: 0.01 },
      { key: 'merkabaSpin', label: 'Counter-spin', min: -1.2, max: 1.2, step: 0.01 },
    ],
  },
  {
    title: 'Fibonacci',
    owner: 'showFib',
    when: (s) => s.showFib,
    note: 'φ is not decoration here: the icosahedron’s twelve vertices are the corners of three golden rectangles.',
    controls: [
      { key: 'spiralArms', label: 'Golden spirals', min: 0, max: 8, step: 1, read: (v) => (v === 0 ? 'off' : `${v} arms`) },
      { key: 'spiralRise', label: 'Spiral rise', min: 0, max: 1.2, step: 0.01, read: (v) => (v < 0.005 ? 'flat' : v.toFixed(2)) },
      { key: 'phyllo', label: 'Phyllotaxis', min: 0, max: 400, step: 5, read: (v) => (v === 0 ? 'off' : `${v} seeds`) },
      { key: 'phylloSize', label: 'Seed size', min: 0.008, max: 0.12, step: 0.002 },
      { key: 'goldenRects', label: 'Golden rectangles', type: 'toggle' },
    ],
  },
  {
    title: 'Singularity',
    owner: 'showCore',
    when: (s) => s.showCore,
    note: 'Lattice nodes lifted through the Hopf fibration — each point becomes a linked circle in 4-space. Depth stacks the figure at nested scales that climb outward forever.',
    controls: [
      { key: 'fibres', label: 'Fibres', min: 0, max: 19, step: 1, read: (v) => (v === 0 ? 'off' : `${v} circles`) },
      { key: 'spread', label: 'Wrap on S²', min: 0.15, max: 1.4, step: 0.01 },
      { key: 'coreScale', label: 'Core size', min: 0.2, max: 2, step: 0.01 },
      { key: 'coreDepth', label: 'Depth', min: 1, max: 4, step: 1, read: (v) => (v === 1 ? 'single' : `${v} levels`) },
      { key: 'coreRatio', label: 'Scale per level', min: 0.35, max: 0.85, step: 0.01 },
      { key: 'coreZoom', label: 'Emergence', min: 0, max: 0.3, step: 0.005, read: (v) => (v < 0.003 ? 'held' : v.toFixed(3)) },
      { key: 'coreTwist', label: 'Twist per level', min: -2, max: 2, step: 0.01 },
    ],
  },
  {
    title: 'Fourth dimension',
    owner: 'showPoly',
    when: (s) => s.showPoly,
    controls: [
      { key: 'poly', label: 'Polytope', min: 0, max: 4, step: 1, read: (v) => POLYTOPES[v].name },
      { key: 'eyeW', label: 'W distance', min: 1.6, max: 9, step: 0.01, read: (v) => (v > 8.5 ? 'near-parallel' : v.toFixed(2)) },
      { key: 'polyScale', label: 'Size', min: 0.3, max: 2.5, step: 0.01 },
      { key: 'polyNodeSize', label: 'Vertex spheres', min: 0, max: 0.2, step: 0.002, read: (v) => (v < 0.001 ? 'off' : v.toFixed(3)) },
      { key: 'tethers', label: 'Bind to lattice', min: 0, max: 1.6, step: 0.01, read: (v) => (v < 0.01 ? 'free' : v.toFixed(2)) },
      { key: 'rotXW', label: 'Rotate XW', min: -0.8, max: 0.8, step: 0.01 },
      { key: 'rotYW', label: 'Rotate YW', min: -0.8, max: 0.8, step: 0.01 },
      { key: 'rotZW', label: 'Rotate ZW', min: -0.8, max: 0.8, step: 0.01 },
    ],
  },
  {
    title: 'Platonic solid',
    owner: 'showSolid',
    when: (s) => s.showSolid,
    note: 'All five come out of Metatron exactly — but none as a subset of its vertices. Spokes run from each vertex to the points around it: bright where the vertex is exactly a face centre, dim where it sits on no feature and the line is only proximity.',
    after: '<p class="note" id="solidinfo"></p>',
    controls: [
      { key: 'solid', label: 'Solid', min: 0, max: 5, step: 1, read: (v) => SOLIDS[v].name },
      { key: 'solidBind', label: 'Share Metatron’s points', type: 'toggle' },
      { key: 'solidAnchors', label: 'Mark what it sits on', type: 'toggle', when: (s) => s.solidBind },
      { key: 'solidSpokes', label: 'Spokes to Metatron', min: 0, max: 1, step: 0.01, when: (s) => s.solidBind, read: (v) => (v < 0.005 ? 'off' : v.toFixed(2)) },
      { key: 'solidJitter', label: 'Jitterbug', min: 0, max: 1, step: 0.005, when: (s) => s.solidBind && Math.round(s.solid) === 5, read: (v) => (v < 0.005 ? 'on Metatron’s vertices' : v > 0.995 ? 'on the octahedron’s edges' : v.toFixed(2)) },
      // Size is absent while bound on purpose: any scaling breaks the point
      // coincidence that binding exists to produce.
      { key: 'solidScale', label: 'Size', min: 0.4, max: 3, step: 0.01, when: (s) => !s.solidBind },
      { key: 'solidNodeSize', label: 'Vertex spheres', min: 0, max: 0.2, step: 0.002, read: (v) => (v < 0.001 ? 'off' : v.toFixed(3)) },
      { key: 'solidFaces', label: 'Translucent faces', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Particles',
    owner: 'showPulses',
    when: (s) => s.showPulses,
    note: 'What runs the lines, and how much of each line is lit at once. Tail length spans a single particle racing the track to a full beam end to end — at full it is identical to a solid line. Global: every layer draws itself this way.',
    controls: [
      { key: 'pulseStyle', label: 'Substance', min: 0, max: PULSE_STYLES.length - 1, step: 1, read: (v) => PULSE_STYLES[v].name },
      { key: 'pulses', label: 'Count', min: 0, max: 5, step: 1, read: (v) => (v === 0 ? 'none' : `${v} per line`) },
      { key: 'pulseSpeed', label: 'Flow', min: -0.6, max: 0.6, step: 0.01 },
      { key: 'pulseSize', label: 'Size', min: 0.3, max: 3, step: 0.01 },
      { key: 'beamTail', label: 'Tail length', min: 0, max: 1, step: 0.005, read: (v) => (v > 0.995 ? 'full beam — solid' : v < 0.02 ? 'single particle' : `${Math.round(v * 100)}% of the line`) },
      { key: 'prism', label: 'Prism glow', min: 0, max: 2.5, step: 0.01, read: (v) => (v < 0.005 ? 'off' : v.toFixed(2)) },
      { key: 'prismSize', label: 'Prism spread', min: 0.3, max: 4, step: 0.01 },
    ],
  },
  {
    title: 'Spirals',
    owner: 'showSpirals',
    when: (s) => s.showSpirals,
    note: 'Logarithmic spirals fitted to Metatron’s four hexagons: φ per 60°, so each crosses one of a hexagon’s six vertex directions every step with the radius multiplying by φ. No growing spiral can pass through two vertices of the same hexagon — they share a radius — so this crosses their rays instead.',
    controls: [
      { key: 'mspirals', label: 'Spirals', min: 0, max: 12, step: 1, read: (v) => (v === 0 ? 'off' : v <= 4 ? `${v} — one per hexagon` : `${v}`) },
      { key: 'mspiralReach', label: 'Reach outward', min: 1, max: 6, step: 1, read: (v) => `φ^${v} — ×${Math.round(Math.pow(1.618033988, v))}` },
      { key: 'mspiralScale', label: 'Scale', min: 0.2, max: 3, step: 0.01 },
      { key: 'mspiralTurn', label: 'Turn', min: -0.4, max: 0.4, step: 0.005 },
      { key: 'mspiralFade', label: 'Brightness', min: 0, max: 1.5, step: 0.01 },
    ],
  },
  {
    title: 'Pure geometry',
    owner: 'showEmitter',
    when: (s) => s.showEmitter,
    note: 'Particles released from the centre along each arm. Spread takes the arms from a flat rose window to a Fibonacci sphere; Twist carries each particle further around the further out it goes, which turns straight rays into spirals.',
    controls: [
      { key: 'emForm', label: 'Form', min: 0, max: FORMS.length - 1, step: 1, read: (v) => FORMS[v].name },
      // Matter is the only opaque option, so it is the only one whose instances
      // the depth buffer can sort. The others will layer by draw order.
      { key: 'emLook', label: 'Surface', min: 0, max: 2, step: 1, read: (v) => ['Matter — solid, sorts correctly', 'Pearl — translucent', 'Ember — pure light'][v] },
      { key: 'emBeadSize', label: 'Size', min: 0.01, max: 0.4, step: 0.005 },
      { key: 'emRainbow', label: 'Rainbow hue', min: 0, max: 1, step: 0.01, read: (v) => (v < 0.005 ? 'palette' : v > 0.995 ? 'full spectrum' : v.toFixed(2)) },
      { key: 'emTwist', label: 'Spiral twist', min: -2, max: 2, step: 0.01, read: (v) => (Math.abs(v) < 0.005 ? 'straight rays' : `${(v * 360).toFixed(0)}° over the reach`) },
      { key: 'emTumble', label: 'Tumble', min: 0, max: 2, step: 0.01 },
      { key: 'emArms', label: 'Arms', min: 1, max: 60, step: 1 },
      { key: 'emBeads', label: 'Per arm', min: 0, max: 10, step: 1, read: (v) => (v === 0 ? 'off' : `${v}`) },
      { key: 'emSpread', label: 'Spread', min: 0, max: 1, step: 0.01, read: (v) => (v < 0.005 ? 'flat ring' : v > 0.995 ? 'full sphere' : v.toFixed(2)) },
      { key: 'emReach', label: 'Reach', min: 0.5, max: 6, step: 0.01 },
      { key: 'emFlow', label: 'Emission', min: -0.6, max: 0.6, step: 0.005 },
      { key: 'emSpin', label: 'Spin', min: -0.8, max: 0.8, step: 0.01 },
      { key: 'emRays', label: 'Rays', min: 0, max: 1.5, step: 0.01, read: (v) => (v < 0.005 ? 'off' : v.toFixed(2)) },
    ],
  },
  {
    title: 'Energy',
    controls: [
      { key: 'lineWidth', label: 'Line width', min: 0.003, max: 0.04, step: 0.001, read: (v) => v.toFixed(3) },
      { key: 'halo', label: '3D glow', min: 0, max: 0.4, step: 0.005 },
      { key: 'bloom', label: 'Bloom', min: 0, max: 2.5, step: 0.01 },
      { key: 'glow', label: 'Brightness', min: 0.2, max: 1.8, step: 0.01 },
    ],
  },
  {
    title: 'In VR',
    note: 'Applies while presenting in a headset. The origin is the floor, so height is a real height above it, and scale is in metres — the piece is a few units across and needs shrinking to something you can stand in front of.',
    controls: [
      { key: 'xrScale', label: 'Scale', min: 0.05, max: 3, step: 0.01, read: (v) => `${(v * 4).toFixed(1)} m across` },
      { key: 'xrHeight', label: 'Height', min: 0, max: 3, step: 0.05, read: (v) => `${v.toFixed(2)} m` },
      { key: 'xrDistance', label: 'Distance', min: 0, max: 6, step: 0.05, read: (v) => `${v.toFixed(2)} m` },
    ],
  },
  {
    title: 'Look',
    controls: [
      { key: 'palette', label: 'Palette', min: 0, max: PALETTES.length - 1, step: 1, read: (v) => PALETTES[v].name },
      { key: 'hue', label: 'Hue shift', min: -0.5, max: 0.5, step: 0.005 },
      { key: 'sheen', label: 'Pearl sheen', min: 0, max: 2, step: 0.01 },
      { key: 'autoRotate', label: 'Orbit drift', type: 'toggle' },
    ],
  },
];

/** Changing these needs the environment map rebuilt, which is not free. */
export const HEAVY_KEYS = new Set(['palette', 'hue']);

export function buildUI(onChange, onLayout, store) {
  const panel = document.getElementById('panel');
  const readout = document.getElementById('readout');
  const bindings = [];

  // The headline names whatever is actually on screen. With the sacred layers
  // hidden, the stage of a figure nobody can see is not the right caption.
  const CAPTIONS = [
    ['showJoins', 'Metatron’s Cube', 'Thirteen points joined every way: a hexagon in two dimensions, a cuboctahedron in three, the 24-cell in four. Each is the arrangement where the distance to the centre equals the distance between neighbours.'],
    ['showCore', 'Singularity', 'Each lattice node lifted through the Hopf fibration into a circle in four-dimensional space, every pair linked. Depth stacks the figure at nested scales that climb outward forever.'],
    ['showEmitter', 'Pure geometry', 'Particles released from the centre along each arm \u2014 spheres, flowers or hearts. Spread carries the arms from a flat rose window to a Fibonacci sphere; Twist turns the rays into spirals.'],
    ['showToroid', 'Toroid', 'Flow rises through the centre, turns over, and returns around the outside. Its strands are bound to the merkaba turning inside it.'],
    ['showMerkaba', 'Merkaba', 'Two tetrahedra, one inverted, turning against each other.'],
    ['showPoly', 'Fourth dimension', 'A regular 4-polytope turning in planes that have no axis in our space, projected down into it.'],
    ['showFib', 'Fibonacci', 'φ, the golden angle, and the three rectangles whose corners are an icosahedron.'],
    ['showRainbow', 'Rainbows', 'Spectral bows standing on the linework, outermost red to innermost violet.'],
  ];

  const refresh = () => {
    for (const b of bindings) b();
    let title;
    let blurb;
    if (state.showRings || state.showNodes) {
      const s = stageAt(state.stage);
      title = s.name;
      blurb = s.blurb;
    } else {
      const found = CAPTIONS.find(([key]) => state[key]);
      title = found ? found[1] : 'Void';
      blurb = found ? found[2] : 'Nothing is switched on. Use the chips above.';
    }
    readout.querySelector('.r-title').textContent = title;
    readout.querySelector('.r-blurb').textContent = blurb;
  };

  // Filled as the groups are built below; the chip handlers only read it when
  // clicked, by which point every group exists.
  const groupByOwner = new Map();

  // ---- visibility chips, first and always
  const vis = document.createElement('section');
  vis.className = 'group vis';
  vis.innerHTML = `<div class="ghead">
      <h2>Visible</h2>
      <div class="gacts"><button type="button" data-all="1">all</button><button type="button" data-all="0">none</button></div>
    </div><div class="chips"></div>`;
  const chips = vis.querySelector('.chips');

  for (const btn of vis.querySelectorAll('.gacts button')) {
    btn.addEventListener('click', () => {
      const on = btn.dataset.all === '1';
      for (const [key] of VISIBILITY) state[key] = on;
      refresh();
      // Not '*' — that flag forces an environment-map rebuild, which is a
      // visible hitch and has nothing to do with what is switched on.
      onChange('visibility');
    });
  }
  for (const [key, label] of VISIBILITY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.addEventListener('click', () => {
      state[key] = !state[key];
      // Full refresh rather than a local toggle: flipping a chip also collapses
      // or reveals the control group that element owns.
      refresh();
      onChange(key);
      // Switching something on should show you its controls, not make you go
      // hunting. Switching it off leaves the panel alone.
      if (state[key]) {
        const g = groupByOwner.get(key);
        if (g) {
          g.classList.add('open');
          requestAnimationFrame(() => g.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
      }
    });
    bindings.push(() => b.classList.toggle('on', state[key]));
    chips.appendChild(b);
  }
  panel.appendChild(vis);

  for (const group of SPEC) {
    const g = document.createElement('section');
    g.className = 'group acc';
    // Accordion: everything starts closed but Time, so the panel opens as a
    // short list of sections rather than a wall of sliders.
    if (group.open) g.classList.add('open');
    g.innerHTML = `<button type="button" class="acch"><h2>${group.title}</h2><span class="caret" aria-hidden="true"></span></button>
      <div class="gbody">${group.note ? `<p class="note">${group.note}</p>` : ''}</div>`;
    const body = g.querySelector('.gbody');
    g.querySelector('.acch').addEventListener('click', () => g.classList.toggle('open'));
    if (group.owner) groupByOwner.set(group.owner, g);
    // A group whose element is switched off has nothing to control, so it goes
    // away entirely — the panel only ever shows dials that currently do something.
    if (group.when) bindings.push(() => g.classList.toggle('hidden', !group.when(state)));

    for (const c of group.controls) {
      const row = document.createElement('label');
      row.className = 'row';
      // A control whose own precondition fails is hidden individually, not just
      // with its group — a live slider that cannot do anything is a lie.
      if (c.when) bindings.push(() => row.classList.toggle('hidden', !c.when(state)));

      if (c.type === 'toggle') {
        // autocomplete=off stops the browser restoring stale control values on
        // reload, which would otherwise desync the panel from `state`.
        row.innerHTML = `<span class="lab">${c.label}</span><input type="checkbox" class="tgl" autocomplete="off">`;
        const input = row.querySelector('input');
        input.addEventListener('change', () => { state[c.key] = input.checked; onChange(c.key); });
        bindings.push(() => { input.checked = state[c.key]; });
      } else {
        row.innerHTML = `<span class="lab">${c.label}<em class="val"></em></span>
          <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" autocomplete="off">`;
        const input = row.querySelector('input');
        const val = row.querySelector('.val');
        input.addEventListener('input', () => {
          state[c.key] = parseFloat(input.value);
          val.textContent = c.read ? c.read(state[c.key]) : state[c.key].toFixed(2);
          onChange(c.key);
        });
        bindings.push(() => {
          input.value = state[c.key];
          val.textContent = c.read ? c.read(state[c.key]) : state[c.key].toFixed(2);
        });
      }
      body.appendChild(row);
    }
    if (group.after) body.insertAdjacentHTML('beforeend', group.after);
    panel.appendChild(g);
  }

  // ---- saved setup
  const saved = document.createElement('section');
  saved.className = 'group';
  saved.innerHTML = `<div class="ghead"><h2>Your setup</h2>
      <div class="gacts">
        <button type="button" data-store="save">save</button>
        <button type="button" data-store="restore">restore</button>
        <button type="button" data-store="clear">clear</button>
      </div></div>
    <p class="note" id="storestatus"></p>`;
  panel.appendChild(saved);

  const storeStatus = saved.querySelector('#storestatus');
  storeStatus.textContent = store.status();
  for (const btn of saved.querySelectorAll('[data-store]')) {
    btn.addEventListener('click', () => {
      storeStatus.textContent = store[btn.dataset.store]();
    });
  }

  // Command bar — text in, parameter patch out.
  const ai = document.createElement('section');
  ai.className = 'group ai';
  ai.innerHTML = `<h2>Ask</h2>
    <div class="askbar">
      <input type="text" id="ask" placeholder="open the chakra, let it flow" autocomplete="off">
      <button id="askgo" aria-label="Run">→</button>
    </div>
    <p class="reply" id="reply">Try: installation · chakra · toroid · merkaba · fibonacci · singularity · mandala · flow · still</p>
    <p class="load" id="load"></p>`;
  panel.appendChild(ai);

  const run = () => {
    const box = document.getElementById('ask');
    const { patch, reply } = interpret(box.value);
    document.getElementById('reply').textContent = reply;
    if (patch) { Object.assign(state, patch); refresh(); onChange('*'); }
    box.blur();
  };
  ai.querySelector('#askgo').addEventListener('click', run);
  ai.querySelector('#ask').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

  document.getElementById('toggle').addEventListener('click', () => {
    document.body.classList.toggle('panel-open');
    onLayout();
  });

  refresh();
  return { refresh };
}
