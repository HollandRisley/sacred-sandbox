import { ExtensionSandbox } from './extensionSandbox.js';

/**
 * THE EXTENSION RUNTIME
 *
 * A library of contributed maths, of which several can run at once. Each one
 * that is running gets its own sandbox, its own pair of instanced pools, and
 * its own section in the panel — so they layer over each other the way the
 * built-in layers do, rather than taking turns.
 *
 * The ceiling is four. Each running extension is an iframe, a worker and two
 * instanced meshes, and beyond four the round-trips start competing for the
 * frame more than the result is worth.
 *
 * Building geometry is *asynchronous* — the code runs behind an iframe and a
 * worker, and answers arrive by message — while the render loop is synchronous
 * and must not wait for anyone. So the two are decoupled: each frame draws the
 * most recent result it has, and a fresh build is requested only when the last
 * one has come back. An extension that takes 80ms to think simply updates less
 * often than the frame rate; it never holds a frame up.
 */

const KEY = 'sacred-sandbox:extensions:v2';
const LEGACY_KEY = 'sacred-sandbox:extensions:v1';
export const MAX_EXTENSIONS = 12;
export const MAX_ACTIVE = 4;

/** @type {Array<{id, name, code, params, settings}>} */
export const extLibrary = [];

const listeners = new Set();
export function onExtensionsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const announce = () => { for (const fn of listeners) fn(); };

const newId = () => `x${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** How the layer is drawn, as opposed to what the maths says. Per extension. */
const defaultSettings = () => ({ scale: 1, spin: 0.05, dotSize: 0.06, dotLook: 0, hue: 0 });

/* ------------------------------------------------------------------ storage */

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(extLibrary.map(
      ({ id, name, code, params, settings }) => ({ id, name, code, params, settings }),
    )));
    return '';
  } catch (err) {
    console.warn('Could not save the extension library', err);
    return 'no room left in storage';
  }
}

export function loadExtensionLibrary() {
  const take = (list) => {
    for (const it of list) {
      if (!it || !it.id || typeof it.code !== 'string') continue;
      extLibrary.push({
        id: it.id,
        name: it.name || 'Untitled',
        code: it.code,
        params: it.params || {},
        settings: { ...defaultSettings(), ...(it.settings || {}) },
      });
    }
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) take(list);
    } else {
      // Everything kept under the single-extension build comes across, gaining
      // the per-layer settings it never had.
      const old = localStorage.getItem(LEGACY_KEY);
      if (old) {
        const list = JSON.parse(old);
        if (Array.isArray(list)) { take(list); persist(); }
      }
    }
  } catch (err) {
    console.warn('Could not read the extension library', err);
  }
  announce();
  return extLibrary;
}

/* ------------------------------------------------------------------ running */

/** id → { item, sandbox, meta, params, geometry, error, building, builds } */
const running = new Map();

export function activeExtensions() {
  return [...running.values()];
}

export function isActive(id) {
  return running.has(id);
}

export function activeCount() {
  return running.size;
}

function defaultParams(meta) {
  const out = {};
  for (const p of (meta && meta.params) || []) {
    if (p && typeof p.key === 'string') out[p.key] = Number(p.value ?? p.min ?? 0);
  }
  return out;
}

export function setParam(id, key, value) {
  const run = running.get(id);
  if (!run) return;
  run.params[key] = value;
  run.item.params = { ...run.params };
  persist();
}

/** The drawing settings — scale, spin, dots, colour — as opposed to the maths. */
export function setSetting(id, key, value) {
  const item = extLibrary.find((it) => it.id === id);
  if (!item) return;
  item.settings[key] = value;
  persist();
}

export function settingsOf(id) {
  const item = extLibrary.find((it) => it.id === id);
  return item ? item.settings : defaultSettings();
}

export function deactivate(id) {
  const run = running.get(id);
  if (!run) return;
  run.sandbox.stop();
  running.delete(id);
  announce();
}

export function deactivateAll() {
  for (const id of [...running.keys()]) deactivate(id);
}

/**
 * Start an extension alongside whatever else is running. Any failure — bad
 * syntax, no `build`, a first build that never returns — surfaces as an error
 * on that extension rather than as an exception here, because one broken
 * contribution must not take the others down with it.
 */
export async function activate(id) {
  const item = extLibrary.find((it) => it.id === id);
  if (!item) return 'that extension has gone';
  if (running.has(id)) return `"${item.name}" is already running`;
  if (running.size >= MAX_ACTIVE) return `${MAX_ACTIVE} at once is the limit — stop one first`;

  const run = {
    id,
    item,
    sandbox: new ExtensionSandbox(),
    meta: null,
    params: {},
    geometry: null,
    error: null,
    building: false,
    builds: 0,
  };
  running.set(id, run);

  try {
    const meta = await run.sandbox.load(item.code);
    run.meta = meta;
    run.params = { ...defaultParams(meta), ...(item.params || {}) };
    announce();
    return `running "${meta.name || item.name}"`;
  } catch (err) {
    run.error = err.message;
    announce();
    return `${item.name}: ${err.message}`;
  }
}

/**
 * Called every frame. Returns what each running extension last produced —
 * never what it is producing now — and quietly starts the next build for any
 * that have finished the last.
 */
export function extensionFrames(t) {
  const out = [];
  for (const run of running.values()) {
    if (!run.meta || run.error) continue;

    if (!run.building) {
      run.building = true;
      const first = run.builds === 0;
      run.sandbox.build({ ...run.params }, t, first)
        .then((geo) => { run.geometry = geo; run.builds++; run.error = null; })
        .catch((err) => {
          // A build that fails stops that layer rather than repeating the
          // failure sixty times a second. The message is kept for the panel.
          run.error = err.message;
          run.geometry = null;
          announce();
        })
        .finally(() => { run.building = false; });
    }

    if (run.geometry) out.push({ id: run.id, geometry: run.geometry, settings: run.item.settings });
  }
  return out;
}

/* ------------------------------------------------------------------ library */

export async function addExtension(name, code) {
  if (extLibrary.length >= MAX_EXTENSIONS) {
    return { error: `the library holds ${MAX_EXTENSIONS} — remove one first` };
  }
  const probe = new ExtensionSandbox();
  try {
    const meta = await probe.load(code);
    const out = await probe.build(defaultParams(meta), 0, true);
    const points = out.paths.reduce((n, p) => n + p.points.length / 3, 0);
    if (!points && !out.dots.length) return { error: 'it loaded, but built nothing to draw' };

    const item = {
      id: newId(),
      name: (name || meta.name || 'Untitled').trim().slice(0, 40),
      code,
      params: defaultParams(meta),
      settings: defaultSettings(),
    };
    extLibrary.unshift(item);
    const warn = persist();
    if (warn) { extLibrary.shift(); return { error: warn }; }
    announce();
    return { item, points, dots: out.dots.length };
  } catch (err) {
    return { error: err.message };
  } finally {
    probe.stop();
  }
}

export function removeExtension(id) {
  const i = extLibrary.findIndex((it) => it.id === id);
  if (i < 0) return false;
  deactivate(id);
  extLibrary.splice(i, 1);
  persist();
  announce();
  return true;
}

/** A worked example, so the panel is never an empty box with no clue in it. */
export const EXAMPLE = `{
  meta: {
    name: 'Rose',
    params: [
      { key: 'petals', label: 'Petals', min: 2, max: 12, step: 1, value: 5 },
      { key: 'lift',   label: 'Lift',   min: 0, max: 2,  step: 0.01, value: 0.4 },
    ],
  },

  // p holds your parameters, t is seconds. Return flat arrays of numbers:
  // three per point. No imports, no async, no DOM — just maths.
  build(p, t) {
    const points = [];
    for (let i = 0; i <= 240; i++) {
      const a = (i / 240) * Math.PI * 2;
      const r = Math.cos(p.petals * a) * 2;
      points.push(r * Math.cos(a), r * Math.sin(a), Math.sin(a * 3 + t) * p.lift);
    }
    return { paths: [{ points, closed: true }], dots: [] };
  },
}`;
