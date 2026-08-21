import { PRESETS } from './state.js';

/**
 * Natural-language → parameter changes.
 *
 * This is deliberately a local keyword matcher, not a model call: it keeps the
 * sandbox a static page that runs offline on a phone. It exists mainly to fix
 * the interface — text in, a partial state patch out — so that swapping in a
 * real model is a change of one function body and nothing else.
 *
 * To go live, replace the body of `interpret` with a call to your endpoint and
 * have it return the same shape: { patch, reply }. Do not call the Anthropic
 * API directly from the browser; put it behind a small server route so the key
 * never reaches the client.
 */

const RULES = [
  [/(installation|everything|full piece|whole thing|art piece)/i, PRESETS.installation, 'The full installation, breathing.'],
  [/(chakra|energy centre|energy center|3d mandala|sphere)/i, PRESETS.chakra, 'The mandala wrapped onto a sphere and turning — every circle still a circle.'],
  [/(toroid|torus|donut|field)/i, PRESETS.toroid, 'The toroid: flow up through the centre, over, and back around the outside.'],
  [/(merkaba|star tetra|chariot|two tetra)/i, PRESETS.merkaba, 'Merkaba — two tetrahedra turning against each other.'],
  [/(fibonacci|golden|phi|spiral|phyllotaxis|sunflower)/i, PRESETS.fibonacci, 'φ: the golden spiral, the sunflower’s 137.5° turn, and the three rectangles inside the icosahedron.'],
  [/(infinite|forever|droste|mandelbrot|endless|fractal)/i, PRESETS.infinite, 'Nested levels climbing outward forever — the same figure at every scale.'],
  [/(singularity|hopf|fibration|deeper|the core|source)/i, PRESETS.singularity, 'The Hopf core: every lattice node lifted to a linked circle in four dimensions.'],
  [/(rainbow|spectrum|prism|refract|diffract|crystal|dispers)/i, PRESETS.prism, 'Prism dispersion around every particle and vertex — white at the core, spectrum at the rim.'],
  [/(metatron spiral|hex spiral|spiral out|deep space|golden spiral out)/i, PRESETS.spirals, 'Spirals fitted to Metatron’s hexagons: φ per 60°, running out into deep space.'],
  [/(pure geometry|emitter|emission|rays|cones|radiate|starburst)/i, PRESETS.geometry, 'Pure geometry radiating from the centre.'],
  [/(flower[s]?\b(?!.*life)|petal|bloom)/i, PRESETS.flowers, 'Little flowers, emitted and tumbling.'],
  [/(heart)/i, PRESETS.hearts, 'Rainbow hearts, cycling the spectrum as they travel out.'],
  [/(spiral ?burst|psychedelic|swirl out)/i, PRESETS.spiralburst, 'Spiral emanations — the arms twisted into spirals, hue running along each.'],
  [/(sphere ?burst|explode|all directions|fibonacci sphere)/i, PRESETS.sphereburst, 'Emission in every direction at once, packed on a Fibonacci sphere.'],
  [/(mandala|complex|intricate|dmt visual|kaleido|rose window)/i, PRESETS.mandala, 'Sixty-one circles, six-fold moiré. Let your eyes unfocus.'],
  [/(flower of life|full flower|nineteen)/i, PRESETS.flower, 'The full Flower of Life — nineteen circles inside their bounding rings.'],
  [/(24.?cell|24 cell|icositetrachoron)/i, PRESETS.cell24, 'The 24-cell: twenty-four around one, the 4D vector equilibrium.'],
  [/(metatron.*(4d|four)|4d metatron|hyper.?metatron)/i, PRESETS.metatron4d, 'Metatron’s Cube opened into four dimensions — every pair still joined.'],
  [/(vector equilibrium|cuboctahedron|isotropic|twelve around one)/i, PRESETS.vectorequilibrium, 'The cuboctahedron: twelve spheres kissing one, the 3D vector equilibrium.'],
  [/(metatron|78 lines|fruit)/i, PRESETS.metatron, 'Metatron’s Cube, flat — all thirteen centres joined, 78 lines. Raise Dimension to lift it.'],
  [/(seed of life|seven circles)/i, PRESETS.seed, 'The Seed of Life — a centre and its six neighbours.'],
  [/(egg of life|eight spheres)/i, PRESETS.egg, 'The Egg of Life: the Seed lifted into three dimensions.'],
  [/(jitterbug|golden stretch|unfold|open the cubocta)/i, PRESETS.jitterbug, 'Jitterbug at zero: the icosahedron sitting exactly on Metatron’s twelve vertices. Raise it to open.'],
  [/(map.*(flower|metatron)|flower.*metatron|combine|bring together)/i, PRESETS.flowermap, 'The Flower mapped onto Metatron’s points, each circle a solid.'],
  [/(platonic|five solids|icosa|dodeca)/i, PRESETS.solids, 'The Platonic solid breathing inside Metatron’s Cube, with its golden rectangles.'],
  [/(hypercube|tesseract|4d|fourth dimension)/i, PRESETS.hypercube, 'A tesseract turning through the fourth dimension, bound to the lattice beneath it.'],

  // Time
  [/(stop|still|freeze|pause|hold)/i, PRESETS.still, 'Held still.'],
  [/(flow|faster|move|breathe|alive|emanat)/i, PRESETS.flow, 'Flowing.'],
  [/(slow|gentle|calm|drift)/i, { time: 0.35, emanate: 0.05, pulseSpeed: 0.08 }, 'Slowed right down.'],

  // Palettes
  [/(spore|purple and green|violet and green|mushroom)/i, { palette: 0 }, 'Spore: violet and emerald.'],
  [/(ayahuasca|vine|jungle|aya)/i, { palette: 1 }, 'Ayahuasca.'],
  [/(amanita|muscaria|scarlet|red cap|fly agaric)/i, { palette: 2 }, 'Amanita: scarlet and cream.'],
  [/(breakthrough|dmt|hyperspace|neon)/i, { palette: 3 }, 'Breakthrough.'],
  [/(void|cool|blue|calm blue)/i, { palette: 4 }, 'Void.'],

  // Energy
  [/(flame|fire|licking|burning)/i, PRESETS.flames, 'Flames licking along the lines.'],
  [/(honey|liquid|viscous|syrup|slow flow|molasses)/i, PRESETS.honey, 'Liquid honey, running thick.'],
  [/(fluoro|flicker|neon beam|strobe|electric)/i, PRESETS.fluoro, 'Fluoro beams, flickering.'],
  [/(drawn|draw.*movement|trace|tail|comet)/i, PRESETS.drawn, 'Lines drawn by movement — a particle with a tail, tracing each path as it goes.'],
  [/(single particle|one particle|racing|streak)/i, PRESETS.comets, 'One short comet per line, drawing it out of the dark.'],
  [/(pulse|particles|energy)/i, { showPulses: true, pulses: 4, pulseSpeed: 0.28, halo: 0.2 }, 'Energy running the lines.'],
  [/(brighter|burn|blaze|glow more)/i, { glow: 1.5, bloom: 1.6, halo: 0.22 }, 'Brighter.'],
  [/(dark|dim|quiet|softer)/i, { glow: 0.5, bloom: 0.35, halo: 0.06 }, 'Dimmed.'],
  [/(pearl|sheen|iridescen|nacre|oil slick)/i, { sheen: 1.7, nodeSize: 0.34, solidFaces: 0.6 }, 'Pearl turned up.'],
];

export function interpret(text) {
  const patch = {};
  const notes = [];
  for (const [re, p, note] of RULES) {
    if (re.test(text)) {
      Object.assign(patch, p);
      notes.push(note);
    }
  }
  if (!notes.length) {
    return { patch: null, reply: 'Not sure. Try: installation, chakra, toroid, merkaba, fibonacci, singularity, mandala, flow, still.' };
  }
  return { patch, reply: notes.join(' ') };
}
