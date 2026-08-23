# Writing an extension

An extension is one function that turns numbers into geometry. The host draws
whatever it returns, using the same glowing linework everything else in the
piece is made of.

## The shape

```js
{
  meta: {
    name: 'Rose',
    params: [
      { key: 'petals', label: 'Petals', min: 2, max: 12, step: 1, value: 5 },
      { key: 'lift',   label: 'Lift',   min: 0, max: 2,  step: 0.01, value: 0.4 },
    ],
  },

  build(p, t) {
    const points = [];
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * Math.PI * 2;
      const r = Math.cos(p.petals * a) * 2;
      points.push(r * Math.cos(a), r * Math.sin(a), Math.sin(a * 3 + t) * p.lift);
    }
    return { paths: [{ points, closed: true }], dots: [] };
  },
}
```

The whole thing is a **single object literal** — no `export`, no `import`, no
statements around it. It is evaluated as an expression.

## What you get

- `p` — your parameters, by the `key` you declared in `meta.params`.
- `t` — seconds since the piece started, as a float. Use it for movement.

## What you return

```
{
  paths: [ { points: [x,y,z, x,y,z, …], closed: false } , … ],
  dots:  [ { x, y, z, r } , … ],
}
```

- **`paths`** are polylines. `points` is one flat array of numbers, three per
  point — not an array of objects. `closed: true` joins the last point back to
  the first. Each path is drawn as a glowing tube with light travelling along
  it, and because the light walks the whole path rather than each segment, a
  path that turns corners will be traced round them.
- **`dots`** are markers. `r` is a relative radius, where 1 is the size the
  panel's own slider is set to.
- Both are optional. Return `{ paths: [] , dots: [] }` if there is nothing to
  draw this frame.

Sensible scale is roughly **-3 to 3** in each axis; that fills the view alongside
the rest of the piece. There is a Scale slider, so being out by a factor of two
is not a problem — being out by a factor of a thousand is.

## Rules

- **No `import`, no `require`, no `export`.** `Math` is there; nothing else is.
- **No `async`, no promises, no timers.** `build` must return its geometry
  directly.
- **No DOM, no network, no storage.** They are not merely discouraged — the
  sandbox removes them, and reaching for one throws.
- **`build` must be fast.** It runs every frame with a budget of 120ms, and
  something slower is terminated. A few thousand points is comfortable.
- **No `NaN` and no `Infinity`.** A single one is refused, because a bad
  coordinate silently deletes whole objects from a scene rather than erroring.

## Limits

| | |
|---|---|
| points, across all paths | 60,000 |
| paths | 400 |
| dots | 4,000 |
| coordinate | ±10,000 |
| build time | 2s the first time, 120ms after |

## Two more examples

A **lissajous knot** — a single closed path, moving with `t`:

```js
{
  meta: { name: 'Knot', params: [
    { key: 'a', label: 'A', min: 1, max: 9, step: 1, value: 3 },
    { key: 'b', label: 'B', min: 1, max: 9, step: 1, value: 2 },
  ]},
  build(p, t) {
    const points = [];
    for (let i = 0; i <= 400; i++) {
      const u = (i / 400) * Math.PI * 2;
      points.push(
        Math.sin(p.a * u + t * 0.3) * 2,
        Math.sin(p.b * u) * 2,
        Math.cos(u * 3) * 1.2,
      );
    }
    return { paths: [{ points, closed: true }], dots: [] };
  },
}
```

A **kaleidoscope** — many paths from one loop, which is the usual way to make
something look complicated without being complicated:

```js
{
  meta: { name: 'Kaleidoscope', params: [
    { key: 'arms',  label: 'Arms',  min: 3, max: 24, step: 1, value: 9 },
    { key: 'twist', label: 'Twist', min: -3, max: 3, step: 0.01, value: 1.1 },
  ]},
  build(p, t) {
    const paths = [];
    for (let a = 0; a < p.arms; a++) {
      const base = (a / p.arms) * Math.PI * 2;
      const points = [];
      for (let i = 0; i <= 90; i++) {
        const u = i / 90;
        const ang = base + u * p.twist + Math.sin(t * 0.4 + base) * 0.25;
        points.push(Math.cos(ang) * u * 2.4, Math.sin(ang) * u * 2.4, Math.sin(u * Math.PI * 3 + t) * 0.5 * u);
      }
      paths.push({ points, closed: false });
    }
    return { paths, dots: [] };
  },
}
```

## Where it runs

In an iframe with an opaque origin, under a policy with no network, inside a
worker that can be terminated. It cannot reach the page, its storage, its
cookies, or anything outside the browser. That is not a courtesy — it is why
running somebody else's maths is safe, and it is why the rules above are
enforced rather than requested.
