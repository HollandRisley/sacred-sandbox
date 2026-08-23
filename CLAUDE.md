# Working on Sacred Sandbox

A three.js art piece: sacred geometry in three and four dimensions, rendered as
glowing linework. Vanilla JS, Vite, no framework, one dependency (`three`).
Deployed to GitHub Pages on every push to `main`.

`README.md` is the design document — it explains *why* the maths and the visual
decisions are what they are, and it is worth reading before changing any of
them. This file is the short version of *how not to break it*.

## Layout

```
src/main.js        the only file that touches the renderer: scene, clock,
                   per-frame update, every layer's orchestration  (~2800 lines)
src/state.js       133 flat scalars, DEFAULTS, resetState, stateDiff, presets
src/ui.js          the panel, built from a declarative SPEC array
src/geometry/*     pure functions over numbers. No THREE objects created per
                   frame, no renderer dependency, no side effects.
src/lib/*          rendering helpers (energy, fields, prism, palettes) and
                   services (storage, share, sprites, extensions)
```

The geometry modules are the part worth protecting. Every claim in them was
checked numerically before it was written down; where something is exact the
comments say so, and where it is a designed morph rather than a derivation they
say that too. Do not weaken a comment into vagueness to make code easier to
change — correct the claim or change the code.

## The frame

`tick()` runs one update. Order matters and is commented in place:

```
computeFit → updateJoins → rebuildLattice → updateSolid → updatePolytope →
updateCore → updateMerkaba → updateToroid → updateFibonacci → updateEmitter →
updateExtensions → updateTethers → paintLattice → updateMetatronSpirals
```

Fit sizes Metatron; Metatron solves its points; the lattice and the bound solid
are then placed *onto* those points. The merkaba runs before the toroid because
the toroid's strands read its rotation. Moving a call is a behavioural change,
not a tidy-up.

## Invariants

Each of these was learned by breaking it.

1. **Switching a layer off must stop its *work*, not just its drawing.** Three
   separate layers once kept computing while invisible. Every `update*` returns
   early when its layer is hidden, and shared work (the lattice, the Metatron
   solve) is gated on whether *anything* still consumes it. With every chip off
   the scene draws zero instances — worth re-checking whenever a layer gains a
   new consumer.

2. **Nothing allocates per frame.** Every layer owns a pre-allocated pool of
   `Vector3`s sized to its worst case and writes into it. Overflow is *reported*
   in the readout, never silently truncated — a figure drawn half way reads as
   broken, where a figure drawn smaller reads as a choice.

3. **Lines are paths, not segments.** A pulse on a two-point path has one
   segment to live on: it appears, crosses, dies. Edges are chained into walks
   by `geometry/trails.js` so light enters a vertex on one edge and leaves on
   another. If you add a figure made of edges, run it through `weld` (if it
   arrives as loose point pairs) and `edgeTrails`, or its pulses will blink.

4. **WebKit gets the WebGL backend.** Safari ships WebGPU and it renders this
   scene to a canvas it then never composites — black, with no error anywhere.
   `pickBackend()` routes `navigator.vendor === 'Apple Computer, Inc.'` to
   WebGL. `?webgpu` forces it back on to test whether a later Safari has fixed
   it.

5. **The environment map rebuild is expensive.** It is gated on `HEAVY_KEYS`
   (`palette`, `hue`). Calling `onChange('*')` forces it — do not use `'*'` for
   anything that has not changed the palette; it is a visible hitch.

6. **Never call a model API from the browser.** There is no server and no key in
   the bundle. The Ask bar is a local keyword matcher. The planned AI helper is
   local-only, behind the dev server.

7. **Untrusted code runs in the sandbox, always.** `lib/extensionSandbox.js`:
   opaque-origin iframe, `connect-src 'none'`, worker inside it, hard time
   budget. Do not add `allow-same-origin` — that hands back this page's origin
   and every wall comes down at once.

## Adding a layer

Six registration points in `main.js`, plus state and UI. Follow an existing
layer — `updateExtensions` is the newest and smallest:

1. pool constants and the instanced objects (`EnergyLines`, `SphereField`, …),
   added to a `THREE.Group` on `rig` (or `world` for a fixed axis)
2. an `update*()` that fills paths and calls `setPaths` / `set`
3. its call in `tick()`, in the right place
4. an entry in `ALL_LINES` and in `BEAM_SPEEDS`
5. a tint in `applyLook()` and a `setLayer(...)` for its colour pair
6. `state.js` keys, a `VISIBILITY` chip, a SPEC group and a `CAPTIONS` entry

## Verifying

The app runs at `localhost:5180` (`npm run dev`, or the `sandbox` launch
config). Drive it from the console through `window.sandbox`:

```js
sandbox.apply({ … })   // patch state, refresh the panel, re-render
sandbox.frame()        // run one update synchronously
sandbox.capture()      // a thumbnail, rendered offscreen
```

**Measurement traps in this project, all of which have produced confidently
wrong conclusions:**

- **A hidden or backgrounded tab throttles `requestAnimationFrame`.** Instance
  counts and matrices read straight after a change are whatever the last real
  frame left behind. Use `sandbox.frame()`. Anything awaiting a rAF will simply
  never resolve.
- **A canvas only holds what was last *presented*.** `toDataURL` on a hidden tab
  returns a stale frame with no error — two entirely different scenes once gave
  byte-identical captures. Render to a target and read it back.
- **The console keeps errors from earlier mid-edit HMR states.** Check the
  `?t=` build id before believing an error is current.
- **Verify through the real UI, not the module.** A gallery test once "failed"
  because the cards on screen closed over items from a previous run.

Prove a visual claim with a screenshot or a measurement, not by reasoning about
the code. Several changes in this repo looked right and were not.

## Working style

- Commit locally as you go; **do not push without being asked.** A push to
  `main` deploys to the public site within about forty seconds.
- Write the *why* in the comment, especially where the obvious approach was
  tried and failed. Much of this codebase's value is in those notes.
- Match the surrounding prose: plain, specific, no exclamation marks, and
  British spelling.
