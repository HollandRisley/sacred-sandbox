# Sacred Sandbox

An extended geometry installation for the browser. A single clock drives
everything: the centre emanates, shells of the Flower of Life travel outward
while some fall back inward, a toroid turns around it, a merkaba counter-rotates
at the core, and the whole figure can be wrapped off the plane onto a sphere so
the mandala is an object you turn rather than a picture you look at.

No plugin, no install, no app store.

## Running it

**You need the script name.** `npm run` on its own only prints the list of
scripts and exits — it starts nothing, which is why the URL showed nothing.

```bash
cd ~/Projects/3DSandbox && npm run dev
```

Vite then prints two URLs. `Local:` is `http://localhost:5180`. `Network:` is the
one to open on a phone on the same Wi-Fi — that is the real test.

If the port is busy, or you want to know whether anything is actually serving:

```bash
lsof -nP -iTCP:5180 -sTCP:LISTEN
```

To produce a static build for hosting:

```bash
npm run build
```

## Why three.js, and why WebGPU

**three.js r185 with `WebGPURenderer`, imported from `three/webgpu`.** It tries
WebGPU and falls back to WebGL 2 by itself — the panel reports which you got. As
of 2026 the fallback rarely fires: iOS 26 / iPadOS 26 Safari ship WebGPU on by
default, and Firefox 147 completed cross-browser support in January 2026.

Bundle is ~915 kB raw, ~255 kB gzipped — the full node-based build. That is the
number to attack if this ever needs a load-time budget.

## The centre

Two pieces of real mathematics hold the piece together. Neither is decoration.

### The Hopf fibration — `src/geometry/hopf.js`

```
plane R² ──σ⁻¹──▸ S² ──h⁻¹──▸ S³ ⊂ R⁴ ──R(θ)──▸ R⁴ ──σ──▸ R³
a lattice        a point       a circle     rotated     a knot
 node           on the         in 4-space  in 6 planes  in space
                sphere
```

The Hopf map `h: S³ → S²` has the property that the preimage of a **single
point** is an entire great circle of S³. So each lattice node — a
zero-dimensional thing — becomes a circle living in four dimensions, and every
pair of those circles is linked, with linking number exactly 1. Projected back
down they appear as Villarceau circles: perfect circles on nested tori, each
threaded through every other.

`R(θ)` is the *same* six-plane rotation the polytopes use, so the XW/YW/ZW dials
drive the core and the hypercube together. One 4D rotation, two lifts.

**Depth** draws the core at several nested scales at once, each a constant ratio
smaller than the one outside it, and advances every level's exponent by the same
continuously increasing amount. The stack climbs outward while a new level is
always being born at the centre, so the structure emerges from the singularity
forever without ever visibly restarting. It is the Droste construction:
self-similar under a scale-and-rotate, which is exactly the symmetry a
logarithmic spiral has — and why the levels read as spiralling out rather than
merely growing. While emerging, the stack carries one extra level in flight
(innermost half-born, outermost half-gone) so that the moment the climb
completes a full step the arrangement is identical again and the loop is
seamless. With **Emergence** at zero, or depth at one, it falls back to a static
stack — no fading, no cycling.

### The mandala is not a plane — `wrapToSphere`

Step 1 of that chain already solves it. σ⁻¹ carries the plane onto a sphere, and
because it is **conformal** it preserves circles and preserves tangency: every
circle stays a circle, every pair that touched still touches. The pattern is not
projected onto a dome, it is genuinely wrapped, and nothing is distorted. The
returned local length scale carries each circle's radius across with its centre;
the surface normal orients the ring so it lies *on* the shell.

Set **Sphere wrap** to 1 and the Flower of Life becomes a solid you rotate.

Two things had to be right for it to sit concentric with everything else, and
both were wrong at first:

- **Depth becomes height along the normal, not along world z.** Adding the flat
  figure's z to the target's z slid the whole shell sideways — at three layers,
  by 96% of the sphere's own radius. Radially, the stacked layers become
  concentric shells instead, evenly spaced by exactly the layer step.
- **Coverage is measured against the outermost node.** The lattice fills only
  about two thirds of the bounding radius, so scaling against that made the
  control mean something different at every Lattice setting, and left the figure
  covering barely a hemisphere with its mass above the origin. Measured against
  the node reach, coverage 1 is a hemisphere and **1.42 puts the shell's centroid
  on the origin** — verified by reading the instance matrices back and averaging
  them.

### Node surfaces

A sphere mesh always has a silhouette where its outline meets the void, and a
specular highlight sitting on it. That is what makes a translucent one read as a
*bubble* rather than as energy, and no amount of tuning the material removes it:
the edge is the geometry. So **Glow** is a camera-facing billboard instead — a
tight core summed with a wide skirt, no edge anywhere. **Pearl** keeps the bubble,
softened (roughness up, reflection down, so the highlight is a sheen rather than
a glint), and **Matter** is opaque and depth-sorted.

### φ and the solids — `src/geometry/fibonacci.js`

The golden ratio belongs here for a specific reason. The twelve vertices of an
icosahedron are exactly

```
(0, ±1, ±φ),  (±1, ±φ, 0),  (±φ, 0, ±1)
```

— the corners of three mutually perpendicular golden rectangles. The
dodecahedron, its dual, is built from the same number. So two of the five
Platonic solids inside Metatron's Cube are *constructed out of* φ. Turn on
**Fibonacci → Golden rectangles** with the Platonic solid hidden and you see the
three rectangles that generate it.

Alongside them: the true logarithmic golden spiral `r(θ) = a·φ^(2θ/π)` (with a
**rise** control that lifts it into the helix the same growth law makes in three
dimensions), and phyllotaxis — n seeds each turned by the golden angle
`2π/φ² ≈ 137.507°`, the only rotation that never repeats and never leaves a gap.

### The toroid — `src/geometry/toroid.js`

The shape a field makes when it feeds itself: flow rises through the centre,
turns over, falls around the outside, returns through the middle. Each
streamline advances `windings` times around the tube per turn around the ring.
At integer windings it closes in one lap; otherwise it precesses over several,
which is what makes the surface read as flowing rather than as a wireframe. Its
axis is Z — the same axis the mandala and the merkaba turn on.

## Time

One clock. Every motion is a multiple of it, so **Time** is a single hand on the
whole installation, including a hard stop at zero.

**Emanation** releases concentric shells of the figure from the centre and
carries them outward, each fading in as it is born and out as it reaches the
rim. **Inward streams** turns a fraction of them around so they fall back in —
the piece breathes rather than only radiates. The Platonic solid, if shown,
breathes on the same clock, which is the only condition on which it earns its
place in a time-based piece.

## The other layers

**Toroid strands.** The donut carries up to four strands, each with its own
share of the streamlines and its own sign of flow and winding, so they weave
through each other rather than lying alongside. Each strand group's rotation is
driven by one of the merkaba's two pyramids — strand 0 by the upward
tetrahedron, strand 1 by the downward one — so the energy running the torus is
genuinely counter-threaded. **Bind to merkaba** sets how hard they follow. The
merkaba's angle advances whether or not the pyramids are drawn, so hiding them
does not freeze the flow that comes off them.

**Rainbows.** Small spectral bows riding the existing linework. Each picks a
host path and a point along it, then stands concentric half-circles on that
point — the chord along the line's tangent, the arc bulging perpendicular to it,
the way a real bow stands on the horizon. Bands run outermost-red to
innermost-violet, which is the way round a primary rainbow actually is: the
longer the wavelength, the wider the angle it leaves the droplet at. They drift
along their host, so the light appears to refract off the energy rather than
being painted on it. Rainbows take brightness from **Glow** but never a palette
tint — tinting them would wash seven bands into one colour.

**Pure geometry.** Radial emission from the centre: a ray down each arm and a
row of particles released along it one after another. **Spread** blends the arm
directions from an even ring in the mandala's plane to a Fibonacci sphere —
latitudes spaced for equal area, longitudes turned by the golden angle, so
emission stays evenly distributed at any arm count instead of clumping at the
poles the way a lat/long grid does. **Twist** carries each particle further
around the axis the further out it has travelled, which turns straight rays into
spiral emanations.

Particles come as **spheres, flowers or hearts** (`geometry/forms.js` — the
flower is a parametric petal patch, the heart an extruded bezier outline, both
normalised so one size slider means the same thing for all three), in three
surfaces:

- **Matter** — opaque and lit. The only one the depth buffer can sort, and
  therefore the only one that never layers wrongly. An InstancedMesh cannot sort
  its own instances, so anything transparent is at the mercy of draw order: this
  is what fixed distant particles painting over near ones.
- **Pearl** — translucent and iridescent. Will layer by draw order; that is the
  trade for the glassy look.
- **Ember** — additive light. Needs no sorting because additive is commutative.
  Paired with **Rainbow hue** it gives a true spectrum, because nothing is lit
  and the instance colour *is* the final colour.

**Rainbow hue** runs the spectrum along each arm. On the lit surfaces it also
turns the metalness and reflection down as it rises, because at full metal the
environment drowns the per-instance colour — rainbow hearts came out uniformly
violet against a violet sky before that.

### Switching a layer off has to stop the work

Not just the drawing. Two bugs of exactly this shape were found and fixed:

- `rebuildLattice` ran unconditionally, so with the circles hidden it still
  placed every node — thousands, each with a quaternion for the sphere wrap —
  and then painted none of it. It is now gated on whether anything consumes the
  lattice at all.
- The tethers bind the hypercube to lattice nodes, but only ever to
  `primaryNodes`: one un-echoed, un-stacked copy. So when the lattice exists
  purely for them, only that copy is built — **61 placements instead of 3660**,
  for an identical result.
- `updateJoins` tested `solidBind`, which defaults *on*, so the whole Metatron
  solve kept running with every layer switched off. It now also requires the
  solid to actually be drawn.

- The travelling window that draws lines as comets read its length straight
  from the slider, so the **Particles** chip never reached it. Switching
  particles off removed the pulse spheres but left every line still being lit a
  fragment at a time — the flashing that appeared to have no control. The tail
  is now forced to 1 (the whole path, i.e. a solid line) whenever particles are
  hidden.

With every chip off the scene draws **zero instances**. Worth re-checking
whenever a layer gains a new consumer.

## WebXR

Enabled. On a headset an **Enter VR** button appears; on anything else it does
not, because `immersive-vr` is not supported and offering it would be a lie.

Three things behave differently while presenting:

- **The headset owns the camera.** The orbit controls stand down, and `resize`
  returns early rather than fighting the XR camera's aspect, fov and view offset.
- **No screen-space bloom.** A post pass and stereo rendering do not mix. The
  per-object halos carry the glow on their own, which is the reason they are
  real geometry rather than a blur.
- **The piece is placed and scaled in metres.** Everything renderable hangs off
  one `world` group; the reference space is `local-floor`, so the origin is the
  floor and **In VR → Height** is a real height above it. The figure is a few
  units across, so the default 0.35 scale puts it at roughly 1.4 m.

### Which backend, and why it is chosen up front

A WebXR session only runs on WebGPU if it advertises a `webgpu` feature, and
today's headset browsers do not. three.js ships `setupWebGLXRFallback` to
hot-swap renderers when a session starts, but that means rebuilding the
renderer, its canvas, the environment map and the controls mid-session — a lot of
moving parts on the one path that cannot be tested from a desktop.

So the choice is made once, at boot: **if the device can present immersive VR,
boot the WebGL 2 backend**, which is the proven XR path. Everything else gets
WebGPU. Override with `?webgl` or `?webgpu`.

The panel reports what you got — `WebGPU + bloom`, or `WebGL 2 + bloom + WebXR
ready`.

### On a Quest

The DOM panel is invisible in immersive mode, so **set the piece up in the
browser first, then enter VR**. Start sparse: the headset is fill-rate bound and
the whole aesthetic is stacked additive transparency. Turn layers off, keep
Particles low, and expect to want a smaller **Lattice**, fewer **Echoes** and
lower **Emanation** than on a desktop.

## Publishing

`npm run build` produces a fully self-contained static `dist/` with **relative**
asset paths (`base: './'`), so it works from any host and any sub-path. No
server, no API keys in the bundle — the Ask bar is a local keyword matcher — so
it is safe to publish as-is.

Two hard requirements:

1. **HTTPS.** WebXR needs a secure context. `localhost` is exempt; nothing else
   is. Over plain HTTP the Enter VR button will not appear.
2. **Correct `Content-Type` on the JS.** It is an ES module. Served as
   `application/octet-stream` it will not load at all.

### Sizes

```
index.js    964 kB raw    269 kB gzipped
index.css     8 kB raw      2 kB gzipped
```

Compression matters more than usual here — it is a 3.6× difference on the main
bundle, over headset Wi-Fi.

### Azure Blob static website

Works, with two caveats worth knowing before you pick it:

- **No automatic compression.** Blob storage serves exactly the bytes you
  uploaded, so that is 964 kB on the wire unless you either front it with Azure
  Front Door / CDN (which compresses) or pre-compress and upload with
  `Content-Encoding: gzip` set by hand.
- **HTTPS on a custom domain needs CDN or Front Door.** The static website
  endpoint itself is HTTPS — fine for WebXR — but a custom domain on it is
  HTTP-only, which would break WebXR.

```bash
az storage blob upload-batch -s dist -d '$web' --account-name <account> --overwrite
```

`upload-batch` infers content types from file extension, which is what you want;
the portal's uploader does not always.

**If you want to stay in Azure, Azure Static Web Apps is the better fit** —
HTTPS, custom domains with certificates, and compression all handled, where Blob
static website is the rawer, older option.

### GitHub Pages — what this repo is set up for

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
`dist/`. Pages gives HTTPS (so WebXR works), gzip on the wire, and custom-domain
certificates, with nothing to configure per-asset.

Two things to know:

- **Set Pages to build from GitHub Actions.** Repo → Settings → Pages → Source →
  *GitHub Actions*. Without that the workflow uploads an artifact nothing serves.
- **`base: './'` is what makes it work.** Pages serves the site from
  `/<repo>/`, not the domain root, so absolute asset paths would 404. Relative
  paths resolve correctly at any depth. Verified by serving the production build
  from a sub-path before committing.

The workflow uses `npm ci` rather than `npm install`, so a deploy builds from
the lockfile and can never quietly pick up a different three.js than the one
this was tested against.

### Other routes

Cloudflare Pages, Netlify and Vercel are equivalent for this — HTTPS,
compression and certificates on a free tier, taking a `dist/` folder directly.
Any of them is less work than configuring Blob plus a CDN.

### Caching

Vite content-hashes the assets (`index-D78e7U65.js`), so they can be cached
indefinitely; `index.html` should not be. On Blob that means setting
`Cache-Control` per blob rather than once.

## Saving

**Your setup** stores every parameter plus the camera position and target in
`localStorage`, and restores it automatically on load — an artwork here is the
combination of the two, since the same settings from a different angle is a
different piece. Restoring only copies keys the current build still recognises,
so an old save cannot inject parameters that no longer exist. Camera *zoom* is
deliberately not stored: the layout code owns it, shrinking the view when the
panel is open, so a restored value would just be overwritten.

## Controls

**Visible** sits at the top and is sticky: nine chips, one per element. That is
the first thing to reach for — most compositions are about what you turn *off*.

The panel reports the lattice instance count at the bottom, and says so plainly
when Lattice × Echoes × Emanation exceeds the 1500-instance ceiling and geometry
is being dropped. It does not silently truncate.

**Vertex pulse** and **Pulse rate** live under *Energy*, not under *Particles*.
They breathe the vertex markers — polytope corners, join nodes, solid corners,
lattice nodes — on the master clock, each vertex offset along the golden ratio
so the field shimmers rather than blinking in unison. They sit under Energy on
purpose: this is the effect that used to happen *with particles switched off*
and could not be reached, so putting the control in a group that hides with the
Particles chip would have reintroduced the same complaint. At 0 the vertices are
steady; particles and pulse are now independent, so the vertices can be defined
by travelling energy, by breathing, by both, or by neither.

## Implementation notes

```
src/
  main.js               scene, the clock, per-frame update
  state.js              every parameter in one object, plus named presets
  ui.js                 panel built from a declarative spec
  ai.js                 text → parameter patch
  lib/fields.js         instanced primitives + neon and pearlescent materials
  lib/energy.js         glowing lines: core tube, halo, travelling pulses
  lib/palettes.js       colour schemes and the generated environment map
  geometry/sacred.js    hex lattice, stage sequence, Metatron's Cube
  geometry/platonic.js  the five solids
  geometry/polytope4d.js  4-polytopes and six-plane rotation
  geometry/hopf.js      the Hopf chain and the sphere wrap
  geometry/toroid.js    torus streamlines
  geometry/fibonacci.js φ, the spiral, phyllotaxis, the golden rectangles
```

- **Lines are three coincident layers, not line primitives.** GPU lines are
  locked to one pixel everywhere. Each line is a bright core tube, the same tube
  several times wider and very faint, and spheres travelling along it. Additive
  blending makes the wide layer accumulate into glow with real volume that
  occludes correctly from any angle — which a screen-space blur cannot do. Bloom
  sits on top for the bleed, not instead of it.
- **`EnergyLines` takes paths, not edges,** so a pulse runs smoothly around a
  whole Hopf circle or toroid streamline instead of flickering between segments.
- **Linework blends additively; pearl surfaces do not.** A translucent solid has
  twenty overlapping faces and additive drives the middle to white. The
  pearlescent material uses normal blending with `depthWrite` off.
- **The sheen is mostly the environment map.** A dense field of coloured blobs,
  used dim as the backdrop and hard as the reflection source. Metalness is held
  near 0.5 — at full metal the instance colour filters the reflection to one
  flat hue and the iridescence dies.
- **The lattice rebuilds every frame** now that emanation moves it. It is a few
  hundred pooled vector writes with no allocation — positions, quaternions,
  fibre points, toroid points, spiral points and phyllotaxis points are all
  pooled at worst-case size.
- **Echoes rotate by `e·(π/3)/E`** — a fraction of the lattice's own 60° period,
  so each copy lands where the lattice does *not* repeat. That near miss is the
  moiré.
- **The figure is size-normalised**, so raising the lattice count adds detail
  rather than diameter.
- **Echoes and shells multiply**, which is easy to miss: six of each is
  thirty-six complete copies of the figure, and at extent 4 that asks for 2928
  node placements against a 1500 ceiling. Filling to the ceiling and dropping
  the remainder truncated a figure part-drawn, which reads as broken rather than
  as reduced — so the lattice sheds *whole copies* until the request fits.
  Echoes go first (a flat-figure device, least meaningful once the thing is
  emanating), then depth, then shells last, because the emanation is usually the
  point. Whatever was given up is named in the readout — `echoes 6→2 to fit` —
  rather than absorbed silently, so the number on the slider and the thing on
  screen never disagree without saying so.
- **Node density** thins the markers without touching the circles, so how many
  points glow and how much structure is drawn are separate decisions. Selection
  walks the golden ratio rather than taking every Nth node: a fixed stride lands
  on the lattice's own periodicity and picks out whole rings or spokes, where an
  irrational step scatters evenly at any density. **The golden step has to be
  taken against a stable per-node seed, not a running counter.** Keyed off a
  counter it walks only the nodes that survive, so the moment one emanation
  shell finishes and stops being drawn, every remaining node shifts one place
  along the sequence and the whole selection reshuffles — measured, shell 1 kept
  6 nodes while shell 0 was present and 8 the instant it left. That swap lands
  in a single frame, which is exactly the momentary flash seen at handover
  between two shells. Each node now carries a seed fixed at creation
  (`copy·1024 + index`), so whether a node is kept depends on nothing but the
  node.

## Performance

Frame rate could not be measured from the automated preview — a backgrounded tab
throttles `requestAnimationFrame`. What was measured: at the previous version's
maximum settings, ~2.4M triangles across ~1300 draw calls at ~4.8 ms per
synchronous render on an M-series Mac, excluding bloom. Comfortable on desktop,
heavy on a phone. Levers in order: **Lattice**, **Echoes**, **Emanation**,
**3D depth**. **This wants a real check on an actual iPhone.**

## The "Ask" bar

Maps typed phrases to parameter patches, and composes them — "open the chakra,
let it flow" applies both. A local keyword matcher, deliberately, so the page
stays static and offline-capable. Its value is that it fixes the interface:
**text in, `{ patch, reply }` out**. Swapping in a real model is one function
body — behind a server route, because a browser API key is public.
`window.sandbox.apply(patch)` is the programmatic entry point.

## Next

- **Presets as URL state** — makes a configuration a shareable link, and makes
  the piece exhibitable.
- **Audio** — the lattice ratios are intervals; the pulses already carry phase.
- **WebXR** — same renderer. A Hopf core you can stand inside is a different
  experience from one on a screen.

## Licence

MIT — see `LICENSE`. Use the maths for anything you like.

The geometry modules are the part worth taking: `hopf.js`, `metatron.js`,
`solidsFromMetatron.js`, `metatronSpiral.js` and `polytope4d.js` are pure
functions over numbers with no renderer dependency, and every claim in them was
checked numerically before it was written down. Where something is exact the
comments say so; where it is a designed morph rather than a derivation, they say
that too.
