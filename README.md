# Sacred Sandbox

An extended geometry installation for the browser. A single clock drives
everything: the centre emanates, shells of the Flower of Life travel outward
while some fall back inward, a toroid turns around it, a merkaba counter-rotates
at the core, and the whole figure can be wrapped off the plane onto a sphere so
the mandala is an object you turn rather than a picture you look at.

No plugin, no install, no app store.

Working on it with an AI assistant, or just want the short version of how not to
break it? `CLAUDE.md` has the module map, the frame order, and the invariants —
each of which was learned by breaking it.

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

### Except on WebKit, where WebGPU draws to a canvas nobody composites

Safari ships WebGPU and it does not work here. On Safari 26.5, five fresh
launches out of five: the loop runs — 800+ frames — the surface is the right
size, the camera is right, the scene holds four visible objects carrying 10,746
instances, nothing is logged anywhere, and the canvas stays black. It is a
compositing fault, not a rendering one. The frames are drawn and never shown.

Nothing recovers it except a genuine change to the window's size. That is why
the piece appeared on a phone only once the panel had been opened: opening it
calls `resize`. Calling `resize` again with the same numbers does nothing,
because nothing has changed — which is what made this look like a startup
problem for so long.

What was measured, all on the same browser and the same scene:

| | fresh launches | result |
|---|---|---|
| WebGPU | 5 | black, every time |
| WebGPU, surface sized before `init` | 5 | black |
| WebGPU, no bloom pass | 1 | black |
| WebGPU, canvas promoted with `translateZ(0)` | 2 | black |
| WebGPU **with any extra layer over the canvas** | 3 | correct |
| **WebGL 2** | 3 | correct, pixel-identical |

The overlay row is the tell, and it is how this was found: a debug panel added
to read the diagnostics out was itself making the bug disappear. A second
compositing layer over the canvas is enough to get every frame presented.

So WebKit gets WebGL. `navigator.vendor === 'Apple Computer, Inc.'` is the test
rather than sniffing the user agent for "Safari": it is Apple for *every*
browser on iOS, all of which are WebKit underneath and all of which therefore
have this, and it is Google or empty for Chrome and Firefox on the Mac, which do
not. Chrome keeps WebGPU. `?webgpu` forces it back on for checking whether a
later Safari has fixed this; `?webgl` forces the other way.

It costs some performance on a platform that was showing nothing at all.

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

**Emission starts at the centre.** The particle fade was `sin(u·π)`, which is
*zero* at u = 0 — so a particle was invisible exactly where it was born and only
faded up a third of the way out. The emission read as coming from a shell around
the middle rather than from the point the whole piece is built around. It now
reaches full strength within the first few percent of the ray, so the stream is
continuous from the shared centre of the Metatron, the hypercube and the merkaba
outward.

**Images.** A fourth form: the particle is a picture. Two sources, one library —
`public/particles/`, listed by a `manifest.json` (drop a file in, add a line,
and it is pickable), and anything added through the panel, which is downscaled
to 256px and kept in `localStorage` under its own key so clearing a saved
artwork does not throw the pictures away with it. The shipped set is six SVG
glyphs — Seed of Life, vesica, hexagram, golden spiral, lotus, torus — a few
kilobytes in total and editable in any text editor.

Picking is a thumbnail grid, not an index, because an index is not something you
can recognise. **All** is the default: with no single image chosen the emitter
deals the whole library across its arms. The selection is stored as the sprite's
*id*, not its position — positions shift every time an image is added or
removed, which would silently repoint a saved artwork at a different picture.

Two implementation consequences worth knowing:

- **One mesh per image.** An InstancedMesh has one material, so it has one
  texture, so a library dealt across the arms cannot be a single mesh. It is a
  pool of eight sharing one plane geometry, one per image actually in use.
  Eight draw calls is nothing, and past eight the arms are sliced too thin for
  any of the pictures to read anyway.
- **The card is not square.** A photograph rarely is, and stretching it to fit
  would be wrong, so the narrow side is scaled down by the texture's aspect —
  measured every frame, because the texture loads asynchronously and its
  dimensions are unknown at the moment the picture is first chosen. The long
  edge is always what the size slider describes, so one number still means the
  same thing across all four forms.

**Face camera** holds every particle square to the viewer. The group the
particles live in is itself spinning, so the billboard undoes the group's own
world rotation before applying the camera's — otherwise **Spin** would drag the
cards round with it. Tumble is not lost to it: it becomes a roll in the picture
plane. The Images form billboards whether the switch is on or not, and the
switch is hidden there rather than shown doing nothing — a picture has no back,
and an edge-on card is an invisible one.

### The dispersion halo was green, and why

The prism glow is a camera-facing billboard carrying a radial spectrum, drawn
additively — white at the core, colour by wavelength as the radius grows. The
first version swept hue linearly with radius and faded alpha with radius too,
which couples two things that must not be coupled:

- **Area.** A ring's area grows with its radius, so a linear sweep puts the
  middle of the spectrum — green — exactly where most of the pixels are.
- **Alpha.** `(1−t)^2.2` extinguished the whole red half of the spectrum before
  it could be seen, because red sat at the largest radius.

Integrated over the disc the halo emitted **R 0.18 : G 0.36 : B 0.46**. Every
glow was a blue-green blob, and once bloom smeared a field of them together the
piece went sickly — which is exactly what the flower preset looked like.

Three changes, each of which is also the physically truer thing:

- **Hue is raised to a power, not linear.** Short wavelengths are bent hardest,
  so violet belongs in a tight inner fringe and red on the wide outer rim. That
  is both the real bending order and what balances the disc by area.
- **Each band is divided by its own relative luminance.** A saturated hue at
  full chroma is not equally bright at every wavelength — green carries ~0.72 of
  the luminance where blue carries ~0.07 — so an equal-energy spectrum still
  reads green.
- **A wide achromatic core**, so the thing reads as light with a spectral fringe
  rather than as a coloured disc.

Measured on the generated texture, the halo now emits **R 0.335 : G 0.336 :
B 0.329** — neutral white light. The colour is all in the fringe, where
dispersion actually puts it.

### A pulse cannot turn a corner it was never given

Every figure made of edges was handed over as a list of two-point paths. A pulse
on a two-point path has one segment to live on: it appears, crosses, and dies —
and since each path is given its own phase, a figure of thirty-two edges blinked
thirty-two unrelated chords rather than being traced. Nothing ever went round a
square, because as far as the renderer was concerned there was no square, only
four unrelated sticks.

`geometry/trails.js` chains the edges into walks instead, so the light enters a
vertex along one edge and leaves along another. That is Hierholzer's algorithm:
walk unused edges, park a vertex when it runs out, splice the loops together.

The catch is that it only produces a genuine walk when at most two vertices have
an odd number of edges. Run on a cube — where all eight are odd — it returned a
sequence of twelve steps that covered only ten edges and repeated two, because
consecutive entries were not actually joined. So the odd vertices are paired off
with virtual edges first, making every degree even, and the resulting circuit is
cut back apart wherever it crosses one. What is left is the fewest real trails
the graph allows, one per pair of odd vertices:

| | vertices | edges | odd | trails |
|---|---|---|---|---|
| Tesseract | 16 | 32 | 0 | **1 closed circuit** |
| Metatron, full web | 13 | 78 | 0 | **1 closed circuit** |
| Octahedron | 6 | 12 | 0 | **1 closed circuit** |
| Icosahedron | 12 | 30 | 12 | 6 |
| Cube | 8 | 12 | 8 | 4 |
| Tetrahedron (each merkaba half) | 4 | 6 | 4 | 2 |

Figures that arrive as loose point pairs — the merkaba's tetrahedra, the
octahedron Metatron derives — are welded back into a graph first: `EdgesGeometry`
repeats every shared corner once per edge meeting there, so nothing records that
two segments touch until they are matched up on a rounded key.

One subtlety cost a round. The walk is a *circuit*, so its two ends are the same
vertex and its last run continues straight into its first. Cutting it as though
it were a line left those as separate pieces, and a tetrahedron came back as
three trails of 4, 1 and 1 edges where two of 3 exist. Rejoining the ends gives
the minimum in every case tested.

A cube cannot be drawn in one stroke and neither can a dodecahedron — that is a
fact about the solid, not a shortcoming here. The hypercube can, and does: one
pulse walks all thirty-two of its edges and comes back to where it started.

Chaining costs the per-edge colouring a path used to carry, so `EnergyLines`
gained per-segment `tints` and `segFades`. The hypercube keeps its depth
gradient and Metatron keeps its short skeleton brighter than its long diagonals.
Trails are worked out once per figure and refilled in place; Metatron's are
rebuilt only when the set of pairs actually changes, recognised by a running
hash, because past three dimensions the edge set moves as the figure turns.

### Every layer can hold its own colour

Nine layers, each with a **Colour** dial that turns it around the hue circle on
top of the global one. Each holds a *pair* of inks rather than one, because most
layers already carry a gradient inside themselves — depth in the hypercube,
distance along an arm, one toroid strand against the next — and shifting the
pair together moves the layer as a whole while keeping its internal shape. At 0
a layer simply follows the palette, which is where they all start.

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

## Running somebody else's maths

Contributed geometry is untrusted code — written by a stranger, or by a model,
and either way capable of being wrong in ways nobody intended. It runs behind
two walls, and then in a worker behind those.

The outer wall is an iframe with `sandbox="allow-scripts"` and **no**
`allow-same-origin`, which gives the document an *opaque* origin: it belongs to
nobody, so it cannot reach this page's DOM, variables, storage or cookies. The
inner wall is a policy of `default-src 'none'` with `connect-src 'none'`, which
is what actually removes `fetch`, `XMLHttpRequest`, `sendBeacon` and
`WebSocket` — an extension can neither send out what it was given nor pull down
more code to run. Inside both, the extension runs in a worker, so a loop that
never ends blocks nothing anyone can see and can simply be terminated.

Measured rather than assumed:

| | |
|---|---|
| iframe origin | `null` |
| blob worker inside it | starts and replies |
| fetch / XHR / beacon / WebSocket | all four refused, four `connect-src` violations |
| parent DOM, storage, cookies | unreachable |
| endless loop | terminated at the 120 ms frame budget |
| `NaN` coordinate | refused before it reaches a buffer |
| 400,000 points | refused at the 60,000 cap |
| reaching for `parent` | *"parent is not defined"* — there is no parent in a worker |

**The harness is inlined, not fetched.** A document loaded into a sandboxed
iframe by `src` never runs its scripts — measured, with and without a policy,
while the same bytes as `srcdoc` run perfectly. So it is carried as a string.
That also removes a second file to keep in step and a path to resolve when the
site is served from a sub-path.

`new ExtensionSandbox().selftest()` reports on its own confinement from the
console, and is written to be honest about it: an earlier version called
`XMLHttpRequest` and `WebSocket` "allowed" because their constructors had not
thrown, when the policy was in fact refusing both a moment later.

### Metatron, organically

**Vertex surface** gives the thirteen points the same choice the lattice nodes
have: stars or pearl spheres. A star is a camera-facing billboard with a hard
bright core, a fast-falling haze and thin diffraction spikes — a sphere, however
translucent, always has a silhouette and a highlight, and reads as an object
where a point of light should.

**Curve** bows the edges instead of running them straight, which turns a diagram
into a membrane. The linework already took polylines rather than segments, so an
edge simply becomes eight points along a quadratic, and nothing downstream
changes — the trails are walks over *vertices*, so pulses keep turning corners
regardless.

The part that decides whether it looks alive is **which way each edge bows**. A
normal chosen per edge reads as noise: the figure looks crumpled. Every edge
bows *outward from the centre* instead, a direction the whole web agrees on, so
it opens like a jellyfish. The exception is an edge whose midpoint sits on the
centre — the long diagonals straight through the middle — where "outward" means
nothing and a perpendicular is used instead. The bow scales with each edge's own
length, so short edges stay taut while long diagonals swing, and **Breathe**
gives it a slow phase that runs along the trail, so the bend travels rather than
every edge pulsing at once.

Curving multiplies the segment count by the number of steps — measured, 156 to
1,248 — so the join layer's pool is sized for it up front.

### The contract

One function. Numbers in, numbers out. No imports, no `async`, no DOM, and
nothing about three.js — the host owns every object, pool and material, which is
how `src/geometry/*` already works, so this formalises the existing convention
rather than inventing one.

```js
{
  meta: {
    name: 'Rose',
    params: [{ key: 'petals', label: 'Petals', min: 2, max: 12, step: 1, value: 5 }],
  },
  build(p, t) {                     // p = your parameters, t = seconds
    const points = [];
    for (let i = 0; i <= 240; i++) { /* … */ points.push(x, y, z); }
    return { paths: [{ points, closed: true }], dots: [] };
  },
}
```

`meta.params` generates the sliders, so an extension describes its own controls
and the panel builds them. Flat arrays of three numbers per point are the whole
geometry vocabulary; the runtime copies them into pooled vectors and hands them
to the same linework everything else uses, so an extension gets the glow, the
travelling pulses, the beam and its own colour dial for nothing.

**Building is asynchronous, drawing is not.** The code runs behind an iframe and
a worker and answers by message, while the render loop must never wait for
anyone. So each frame draws the most recent result it has and requests a fresh
one only once the last has come back. An extension that takes 80 ms to think
updates less often than the frame rate; it never holds a frame up and never
queues work faster than it can be done.

One thing this does not do yet: an extension's parameters live with the
extension rather than in `state`, so a shared link carries the rest of the piece
but not them.

### Asking for it instead of writing it

Describe what you want and have the code written. Run the dev server, copy
`.env.example` to `.env.local`, point it at a local model, and an ask box
appears above the library.

It runs on your machine and nowhere else. The route is registered with Vite's
`apply: 'serve'`, so it exists only under `npm run dev` and is not in a built
bundle at all — checked, and the production bundle contains no endpoint, no key,
no model name and no provider. Nothing is paid per request, and no key ever
reaches a browser.

The default target is anything speaking the OpenAI chat-completions shape —
Ollama, LM Studio, llama.cpp's server, vLLM — which makes a self-hosted open
model the ordinary path rather than the fallback. `AI_PROVIDER=anthropic` uses
your own key through the official SDK instead.

**`docs/extensions.md` is the system prompt.** It is read fresh on every
request, so improving the documentation improves the generator: one description
of the contract, serving both the person and the model.

**The repair loop is the point.** A model small enough to run on a laptop will
often not get this right first time — points as objects rather than a flat
array, a missing `closed`, an `import` it was told not to use. So the code is
run in the sandbox immediately and, if it fails, the *exact* error goes back for
another attempt, up to twice. The error names the rule that was broken, which is
worth far more to the model than the request repeated. It is asked for a second
frame as well, because plenty of generated code works at `t = 0` and divides by
zero a moment later.

Nothing is saved and nothing is drawn until you say so: the code appears in the
box for you to read, and loading it is a separate, deliberate click.

The ask box only appears when a model actually answers — the health check probes
the endpoint rather than reporting itself well because the route exists, since a
button that fails when pressed is worse than no button.

### A shell has to be gone before it wraps

Emanation releases concentric shells from the centre and carries them out; when
one reaches the end of its journey it starts again from the middle. Its
brightness was `sin(uπ)`, which is symmetric — and therefore still at **19% at
94% of the way out, and 6% at 98%**. So a plainly visible ring of light reached
the rim and snapped back to the centre. That is what read as a jerk.

The curve now rises quickly, so a shell is still born at the centre, and reaches
zero at 93% of the journey — dark for the last stretch, so there is nothing left
to see when it wraps. The cost is that the figure does not reach quite as far.

Worth recording how nearly this was missed: sampling frames at sixty times speed
made *every* version look steppy, because each frame advanced the phase by 2% of
the cycle. The bug only became clear by evaluating the curve itself rather than
watching it.

### The solid and the star, together

A Platonic solid at each node used to *replace* the marker, which threw away the
best thing in the piece to show the second best. The star now sits inside the
solid and travels out with it, and the solid has its own size, transparency and
glow so it can be a lantern around the light rather than a lid over it. Size at
zero hides the star if you want only the solid.

## Stars

The node markers turned out to be the best thing in the piece — a hard core with
diffraction spikes reads as a point of light in a way no sphere ever does — but
they were tied to the lattice, so they could only appear where the figure
happened to have a vertex. **Stars** is the same spark freed from the figure:
thrown out of the centre in every direction and left to travel.

Directions come from `armDirection`, the emitter's own distribution, so one
control takes them from a flat ring in the mandala's plane to an even sphere.
Each star is given its place in the journey by the golden ratio rather than by
an even division — an even division makes them leave in ranks, which reads as a
machine, where an irrational step scatters them along the whole path at any
count and reads as a sky.

They reach full strength almost at once and dissolve at the rim. Fading in from
zero would make them appear a third of the way out and read as coming from a
shell rather than from the centre — the same mistake the emitter made, and the
same fix.

## The gallery

**Keep this** stores every parameter, the camera position and target, and a
picture of what that looked like. A list of names tells you nothing about work
made of light, so the gallery is a wall of thumbnails and the name sits under
each one. Twenty pieces at about 12 kB each is a quarter of a megabyte; the cap
is reported rather than quietly dropping the oldest, because losing something
you made without being told is worse than being refused a new one.

Loading only copies keys the current build still recognises, so an old save
cannot inject parameters that no longer exist, and it resets first — merging
onto whatever was on screen left the previous piece's leftovers underneath.
Camera *zoom* is deliberately not stored: the layout code owns it, shrinking the
view when the panel is open, so a restored value would just be overwritten. The
single-slot save older builds wrote is migrated in on first read, and its key is
left where it was so going back to an older build still finds it.

### Thumbnails are rendered, not screenshotted

A canvas only holds what was last *presented*, and presentation means
compositing — so a tab that is hidden, backgrounded or simply mid-frame hands
back a stale picture with no error to say so. Measured: two completely different
scenes, one with every layer switched off, produced **byte-identical** captures.
So the thumbnail is rendered into an offscreen target and read back, which owes
nothing to whether anyone is looking.

Two things had to be got right. WebGPU pads every row of a texture read up to a
multiple of 256 bytes: at 480 wide a row is 1920, padded to 2048, and reading it
as though it were tight shears the picture into diagonal streaks — which is
exactly what the first thumbnails were. Sizing the target to a multiple of 64
makes a row a multiple of 256 already, so there is nothing to account for. And
driving the bloom pipeline into an offscreen target never returns, so the
thumbnail is a straight render with the glow added back in two dimensions
afterwards — a blurred copy composited over itself. At 240 pixels wide that is
indistinguishable, and the piece looks wrong without any glow at all.

## What it opens on

The defaults are a composition, not a blank start — the lattice wrapped and
stacked three deep, Metatron just short of three dimensions, the hypercube
tethered to it, and one wide toroid turning slowly around the whole thing, seen
from a particular angle. Every value came off the panel and was pasted back into
`state.js`; the camera's opening position went with it, because an artwork here
is the settings and the viewpoint together.

Order of precedence on load is link, then save, then these. Someone who followed
a link came to see that position and should not have it replaced by whatever was
last saved on their device.

## Sharing a position

Every position is a link. The fragment carries only what differs from the
opening state, deflated and base64url'd — 138 to 328 characters for a real
composition, against about 1,350 if all 124 parameters were packed. The diff is
also what makes a link survive the build changing under it: a parameter added
later is simply absent and falls back to its default, and one removed is ignored
on the way in.

It rides in the fragment, which browsers never send to the host, so the origin
never sees what you made. Camera and target travel with it — an artwork here is
the settings and the angle together.

Your own uploaded pictures do not travel. An `emImage` naming a `mine:` id means
nothing to whoever opens the link, so the field is dropped and their copy falls
back to the shipped glyphs. Sending the picture would make this an image host.

A link is untrusted input. Decoding keeps only keys this build knows, only where
the type matches, and rejects non-finite numbers; anything unreadable returns
null rather than throwing, because a truncated paste is the normal case.

## Controls

**Visible** sits at the top and is sticky: nine chips, one per element. That is
the first thing to reach for — most compositions are about what you turn *off*.

Turned sideways, a phone gets three columns: the artwork, a rail of section
names, and that section's controls. A single scrolling column of fifteen
accordions in 400 points of height is mostly headings; the rail moves the
headings out of the way so the sliders get the full height of the screen.

It is the same DOM in both layouts. Every section lives in a wrapper that is
`display: contents` everywhere except landscape — so on a desktop and in
portrait the sections are still direct children of the panel and behave exactly
as they did, and the wrapper is not there as far as layout is concerned. The
landscape query is matched in JavaScript rather than in the stylesheet, and sets
a class: one definition drives both the panel's shape and the camera's view
offset, which is what keeps them from disagreeing about where the edge between
them is.

On a phone the readout shrinks to a 15px label and the description goes behind
the ⓘ beside it, taking the header from about 97px to 24px. A caption a quarter
the height of the screen is competing with the artwork rather than serving it,
and on a device that is mostly canvas the piece should be what is on screen
until something else is asked for. Desktop is unchanged — the button is not
rendered there and the description always shows, including when the phone's
open/closed state is still set, so resizing or rotating can never strand the
text hidden.

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
  lib/prism.js          dispersion and soft-glow billboard textures
  lib/sprites.js        the image particle library — folder, uploads, textures
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
- **The node glow is a spark, not a smudge.** It summed one wide gaussian and
  one wide skirt, giving a blob with no centre — grey and out of focus at any
  size. A point of light read at a distance is mostly a very small, very bright
  core, and it is the *contrast* between that and a faint, fast-falling haze
  that makes the eye read a spark at all. Thin diffraction spikes finish it: a
  bright point through a lens becomes a cross, and that is the single cue that
  says star rather than dot. The glow also takes the palette now — it was
  written with `setScalar`, which is why every node was grey whatever the
  colours were doing.
- **Sliders on a phone.** A touch starting on a slider was being claimed by the
  panel's own scrolling, so a drag scrolled the sheet and the value never moved,
  while a tap still worked — a tap is not a gesture anything competes for.
  `touch-action: pan-y` gives vertical movement to the scroller and horizontal
  movement to the slider. The lane and thumb also grow on touch screens, and the
  panel is no longer selectable, since a drag on a label was selecting text
  instead of scrolling.
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

A backgrounded tab throttles `requestAnimationFrame` to a crawl, so instance
counts and matrices read straight after a change are whatever the last real
frame left behind. That has repeatedly made a working change look broken and a
broken one look fine, so `window.sandbox.frame()` runs one update synchronously
and forces the state through. Frame rate itself still could not be measured this
way. What was measured: at the previous version's
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

Shareable links and WebXR are both done and have moved into the sections above.
What is left, roughly in the order it is likely to happen:

**From the plan** (`gallery, extensions, and a landscape UI`)

- ~~A local gallery~~ — done.
- ~~The extension sandbox~~ — done; the runtime that uses it is next.
- **A Cloudflare Worker for the gallery** — shared setups by short link, and a
  curated public gallery. Uploaded images stay local and never travel. The
  assistant half of the Worker is written; the gallery half is not.
- **User extensions** — a data-only contract (numbers in, points and edges out)
  run in a null-origin iframe with `connect-src 'none'`, so contributed maths
  can reach neither the page nor the network. The sandbox is the part to build
  first, because it is the part that can be wrong.
- ~~A local AI helper~~ — done.
- ~~`CLAUDE.md`~~ — done.

**Still open**

- **Audio** — the lattice ratios are intervals; the pulses already carry phase.

## Licence

MIT — see `LICENSE`. Use the maths for anything you like.

The geometry modules are the part worth taking: `hopf.js`, `metatron.js`,
`solidsFromMetatron.js`, `metatronSpiral.js` and `polytope4d.js` are pure
functions over numbers with no renderer dependency, and every claim in them was
checked numerically before it was written down. Where something is exact the
comments say so; where it is a designed morph rather than a derivation, they say
that too.
