export const state = {
  // What is present. Opens on the singularity alone — the piece starts at the
  // centre and everything else is something you choose to add to it.
  showRings: false,
  showNodes: false,
  showJoins: false,
  showSolid: false,
  showMerkaba: false,
  showPoly: false,
  showCore: true,
  showToroid: false,
  showFib: false,
  showPulses: true,
  showSpirals: false,
  showEmitter: false,

  // Time — one master clock everything else is a multiple of
  time: 1,
  emanate: 0.08,    // outward flow rate of the shells
  shells: 3,        // 0 = a single still figure
  contract: 0.33,   // fraction of streams running inward instead

  // Metatron's Cube — its own object now, not a flat overlay
  joinDim: 3,          // 2 = flat Fruit of Life, 3 = cuboctahedron, 4 = 24-cell
  joinSize: 1,
  joinReach: 1,        // 1 = every pair joined (the classic 78 lines)
  joinNodeSize: 0.05,
  joinTumble: 0.09,
  joinBreath: 0.12,

  // Sacred geometry
  mapToMetatron: false,   // place the lattice on Metatron's points instead
  nodeSolid: 0,           // a Platonic solid at each node (0 = off)
  nodeSolidSize: 0.5,
  nodeSolidSpin: 0.25,
  stage: 8,
  extent: 2,
  echoes: 1,
  wrap: 0.4,        // 0 = flat plane, 1 = wrapped onto the sphere
  wrapSpread: 1.42, // sphere coverage; 1.42 puts the shell's centroid on the origin
  radius: 1,
  layers: 0,
  spin: 0.05,
  nodeSize: 0.11,
  nodeDensity: 0.35,    // fraction of lattice nodes that get a marker
  nodeLook: 0,          // 0 glow (edgeless), 1 pearl, 2 matter
  nodeGlowSpread: 1,    // how far the glow reaches past the node

  // Singularity — the Hopf core
  fibres: 9,
  spread: 0.9,
  coreScale: 1.15,
  coreDepth: 3,      // nested scale levels
  coreRatio: 0.62,   // size of each level relative to the one outside it
  coreZoom: 0.06,    // levels climb outward forever, Droste-fashion
  coreTwist: 0.55,   // rotation added per level, which makes it spiral

  // Toroid
  torMajor: 1.5,
  torMinor: 0.62,
  torWindings: 5,
  torLines: 8,
  torFlow: 0.1,
  torStrands: 2,     // interwoven counter-flowing strand groups
  torCouple: 1,      // how strongly each strand follows its merkaba twin

  // Merkaba
  merkabaSize: 1.15,
  merkabaSpin: 0.35,

  // Fibonacci
  spiralArms: 2,
  spiralRise: 0.35,
  phyllo: 0,
  phylloSize: 0.03,
  goldenRects: true,

  // Spirals fitted to Metatron's hexagons
  mspirals: 4,
  mspiralReach: 3,
  mspiralScale: 1,
  mspiralTurn: 0.04,
  mspiralFade: 0.9,

  // Pure geometry — radial emission from the centre
  emArms: 12,
  emSpread: 0,       // 0 = flat rose window, 1 = Fibonacci sphere
  emReach: 3.2,
  emRays: 1,
  emBeads: 6,
  emBeadSize: 0.06,
  emFlow: 0.18,
  emSpin: 0.08,
  emForm: 0,        // 0 spheres, 1 flowers, 2 hearts, 3 images
  emLook: 0,        // 0 matter (opaque, sorts correctly), 1 pearl, 2 ember
  emImage: '',      // which sprite; '' deals the whole library across the arms
  emFace: false,    // hold every particle square to the camera
  emTwist: 0.35,    // turns straight rays into spiral emanations
  emTumble: 0.4,    // each particle turning on its own axis
  emRainbow: 0,     // hue cycled along each arm

  // Platonic
  solid: 5,
  solidScale: 1,
  solidFaces: 0.3,
  solidBind: true,        // derive the solid from Metatron's own points
  solidJitter: 1,         // cuboctahedron → icosahedron, for the icosa/dodeca
  solidNodeSize: 0.05,
  solidAnchors: true,     // outline the Metatron faces the vertices sit on
  solidSpokes: 0.7,       // fine lines from each vertex to the points around it

  // 4D
  poly: 2,
  polyScale: 0.55,
  eyeW: 2.8,
  rotXW: 0.18,
  rotYW: 0.0,
  rotZW: 0.09,
  tethers: 0.7,
  polyNodeSize: 0.05,   // pearl spheres at the polytope's vertices; 0 hides them

  // Particles
  pulseStyle: 2,     // licking flames
  pulses: 1,         // one per line
  pulseSpeed: 0.16,
  pulseSize: 0.3,    // as small as the slider allows

  // Vertices breathing on their own, independent of anything travelling the
  // lines. 0 = steady.
  vertexPulse: 0.55,
  vertexPulseRate: 0.35,

  // Beam: how much of each line is lit at once. 1 = the whole thing (a solid
  // line); 0 = a single particle racing the track and drawing it as it goes.
  beamTail: 1,

  // Prism dispersion around particles and vertices
  prism: 0.8,
  prismSize: 1,

  // Energy
  lineWidth: 0.012,
  glow: 0.8,
  halo: 0.11,
  bloom: 0.6,

  // In VR. Metres, from a floor-level origin — the piece is a few units across,
  // so it needs shrinking to something you can stand in front of.
  xrScale: 0.35,
  xrHeight: 1.4,
  xrDistance: 1.6,

  // Look
  palette: 0,
  hue: 0,
  sheen: 1,
  autoRotate: false,
};

const only = (...keys) => {
  const off = {
    showRings: false, showNodes: false, showJoins: false, showSolid: false,
    showMerkaba: false, showPoly: false, showCore: false, showToroid: false,
    showFib: false, showSpirals: false, showEmitter: false,
  };
  for (const k of keys) off[k] = true;
  return off;   // showPulses is deliberately untouched — it rides on whatever is shown
};

export const PRESETS = {
  flower: { ...only('showRings', 'showNodes'), stage: 8, extent: 2, echoes: 1, wrap: 0, shells: 0, layers: 0 },
  metatron: { ...only('showJoins'), joinDim: 2, joinReach: 1, joinSize: 1.1, joinTumble: 0, joinNodeSize: 0.05, stage: 7 },
  vectorequilibrium: { ...only('showJoins'), joinDim: 3, joinReach: 0.1, joinSize: 1.1, joinTumble: 0.12, joinNodeSize: 0.07, joinBreath: 0.15 },
  cell24: { ...only('showJoins'), joinDim: 4, joinReach: 0.12, joinSize: 1, joinTumble: 0.05, joinNodeSize: 0.045, rotXW: 0.22, rotZW: 0.11, eyeW: 3 },
  metatron4d: { ...only('showJoins'), joinDim: 4, joinReach: 1, joinSize: 0.95, joinTumble: 0.04, joinNodeSize: 0.04, rotXW: 0.16, rotZW: 0.08, eyeW: 3.2, glow: 0.5, halo: 0.06, lineWidth: 0.007 },
  seed: { ...only('showRings', 'showNodes'), stage: 4, wrap: 0, shells: 0, extent: 2, echoes: 1 },
  egg: { ...only('showRings', 'showNodes'), stage: 5, wrap: 0, shells: 0, extent: 2, echoes: 1 },
  mandala: { ...only('showRings', 'showNodes', 'showJoins'), stage: 8, extent: 4, echoes: 6, wrap: 0, shells: 0, spin: 0.02, nodeSize: 0.06 },
  chakra: { ...only('showRings', 'showNodes', 'showToroid', 'showCore'), stage: 8, extent: 3, echoes: 1, wrap: 1, shells: 4, emanate: 0.1, layers: 0, fibres: 7, spin: 0.06 },
  toroid: { ...only('showToroid', 'showCore'), torLines: 14, torWindings: 5, torFlow: 0.14, fibres: 5, wrap: 1 },
  merkaba: { ...only('showMerkaba', 'showRings', 'showNodes'), stage: 4, wrap: 0, shells: 0, merkabaSpin: 0.5, merkabaSize: 1.3 },
  fibonacci: { ...only('showFib', 'showRings', 'showNodes'), stage: 8, wrap: 0, shells: 0, extent: 2, spiralArms: 5, phyllo: 260, goldenRects: true },
  solids: { ...only('showJoins', 'showSolid'), joinDim: 3, joinReach: 0.1, solid: 5, solidBind: true, solidScale: 1, solidJitter: 1, solidFaces: 0.3, solidNodeSize: 0.05, joinNodeSize: 0.06, joinTumble: 0.08 },
  jitterbug: { ...only('showJoins', 'showSolid'), joinDim: 3, joinReach: 0.1, solid: 5, solidBind: true, solidScale: 1, solidJitter: 0, solidFaces: 0.2, solidNodeSize: 0.06, joinNodeSize: 0.06, joinTumble: 0.1, time: 1 },
  flowermap: { ...only('showJoins', 'showRings', 'showNodes'), mapToMetatron: true, joinDim: 3, joinReach: 0.1, joinNodeSize: 0, nodeSolid: 5, nodeSolidSize: 0.5, nodeSolidSpin: 0.3, shells: 0, joinTumble: 0.07 },
  hypercube: { ...only('showPoly', 'showRings', 'showNodes'), stage: 4, wrap: 0, shells: 0, poly: 2, polyScale: 0.9, eyeW: 2.4, rotXW: 0.3, rotZW: 0.15, tethers: 1 },
  singularity: { ...only('showCore'), fibres: 9, spread: 0.95, coreScale: 1.15, coreDepth: 3, coreRatio: 0.62, coreZoom: 0.06, coreTwist: 0.55, rotXW: 0.14, rotZW: 0.07, pulses: 3, pulseSpeed: 0.1 },
  infinite: { ...only('showCore'), fibres: 13, spread: 1.05, coreScale: 1.35, coreDepth: 4, coreRatio: 0.55, coreZoom: 0.11, coreTwist: 0.85, rotXW: 0.1, rotZW: 0.05, pulses: 2, pulseSpeed: 0.08, lineWidth: 0.007, glow: 0.7, bloom: 0.8 },
  spirals: { ...only('showJoins', 'showSpirals'), joinDim: 3, joinReach: 0.1, mspirals: 4, mspiralReach: 3, mspiralFade: 0.9, joinNodeSize: 0.05 },
  prism: { prism: 1.6, prismSize: 1.4, pulses: 2, showPulses: true },
  drawn: { beamTail: 0.18, pulses: 1, pulseSize: 0.45, pulseSpeed: 0.14, prism: 1.4, showPulses: true },
  comets: { beamTail: 0.06, pulses: 3, pulseSize: 0.5, pulseSpeed: 0.22, prism: 1.6, showPulses: true },
  geometry: { ...only('showEmitter', 'showCore'), emArms: 14, emSpread: 0, emReach: 3.2, emBeads: 7, emFlow: 0.2, emSpin: 0.1, emForm: 0, emLook: 0, emTwist: 0.35, fibres: 5 },
  sphereburst: { ...only('showEmitter'), emArms: 60, emSpread: 1, emReach: 3.4, emBeads: 5, emFlow: 0.24, emSpin: 0.05, emForm: 0, emLook: 0, emTwist: 0.2 },
  flowers: { ...only('showEmitter'), emForm: 1, emLook: 0, emArms: 10, emBeads: 6, emSpread: 0.25, emReach: 3.2, emBeadSize: 0.16, emTwist: 0.5, emTumble: 0.3, emFlow: 0.16, prism: 1.1 },
  hearts: { ...only('showEmitter'), emForm: 2, emLook: 0, emRainbow: 1, emArms: 12, emBeads: 6, emSpread: 0.35, emReach: 3.2, emBeadSize: 0.14, emTwist: 0.45, emTumble: 0.5, emFlow: 0.16, prism: 1.4 },
  images: { ...only('showEmitter'), emForm: 3, emImage: '', emLook: 2, emArms: 12, emBeads: 5, emSpread: 0.3, emReach: 3.2, emBeadSize: 0.22, emTwist: 0.4, emTumble: 0.15, emFlow: 0.14, emRainbow: 0.4, emRays: 0.3, prism: 0.5 },
  spiralburst: { ...only('showEmitter', 'showCore'), emForm: 0, emLook: 2, emArms: 28, emBeads: 9, emSpread: 0.5, emReach: 3.6, emBeadSize: 0.07, emTwist: 1.1, emFlow: 0.22, emRainbow: 0.7, prism: 1.6, fibres: 7 },
  // Each element occupies its own radius so they read as layers of one object
  // rather than merging: merkaba at the core, toroid as a ring outside the
  // wrapped shells, spirals reaching past both.
  installation: {
    showRings: true, showNodes: true, showJoins: false, showSolid: false,
    showMerkaba: true, showPoly: true, showCore: true, showToroid: true, showFib: true,
    showSpirals: false, showEmitter: false,
    stage: 8, extent: 2, echoes: 1, wrap: 0.6, shells: 3, emanate: 0.07, contract: 0.33,
    fibres: 5, coreScale: 0.85, spin: 0.04, time: 1, nodeSize: 0.1,
    torMajor: 2.7, torMinor: 0.45, torLines: 9, torWindings: 7, torFlow: 0.1,
    merkabaSize: 0.95, merkabaSpin: 0.3,
    spiralArms: 2, phyllo: 0, goldenRects: false,
    polyScale: 0.5, glow: 0.7, bloom: 0.5, halo: 0.09,
  },
  still: { time: 0 },
  flow: { time: 1.8, emanate: 0.16, torFlow: 0.22, pulseSpeed: 0.3, showPulses: true },
  flames: { showPulses: true, pulseStyle: 2, pulses: 3, pulseSpeed: 0.28, pulseSize: 1.1 },
  honey: { showPulses: true, pulseStyle: 3, pulses: 2, pulseSpeed: 0.09, pulseSize: 1.2 },
  fluoro: { showPulses: true, pulseStyle: 1, pulses: 4, pulseSpeed: 0.36, pulseSize: 0.9 },
};
