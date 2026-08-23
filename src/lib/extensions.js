import { ExtensionSandbox } from './extensionSandbox.js';

/**
 * THE EXTENSION RUNTIME
 *
 * A library of contributed maths, of which one is drawn at a time. Many at once
 * would mean many sandboxes, many instanced pools and many round-trips a frame,
 * for a feature nobody has asked to stack yet — so the library holds as many as
 * you like and exactly one is active.
 *
 * The awkward part is that building geometry is *asynchronous* — the code runs
 * behind an iframe and a worker, and answers arrive by message — while the
 * render loop is synchronous and must not wait for anyone. So the two are
 * decoupled: each frame draws the most recent result it has, and a fresh build
 * is requested only when the last one has come back. An extension that takes
 * 80ms to think simply updates less often than the frame rate; it never holds a
 * frame up, and it never queues work faster than it can be done.
 */

const KEY = 'sacred-sandbox:extensions:v1';
export const MAX_EXTENSIONS = 12;

/** @type {Array<{id: string, name: string, code: string, params: object}>} */
export const extLibrary = [];

const listeners = new Set();
export function onExtensionsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const announce = () => { for (const fn of listeners) fn(); };

const newId = () => `x${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/* ------------------------------------------------------------------ storage */

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(extLibrary));
    return '';
  } catch (err) {
    console.warn('Could not save the extension library', err);
    return 'no room left in storage';
  }
}

export function loadExtensionLibrary() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      for (const it of list) {
        if (it && it.id && typeof it.code === 'string') {
          extLibrary.push({ id: it.id, name: it.name || 'Untitled', code: it.code, params: it.params || {} });
        }
      }
    }
  } catch (err) {
    console.warn('Could not read the extension library', err);
  }
  announce();
  return extLibrary;
}

/* ------------------------------------------------------------------- active */

const active = {
  id: null,
  sandbox: null,
  meta: null,
  params: {},
  geometry: null,     // the most recent { paths, dots }
  error: null,
  building: false,
  builds: 0,
};

export function activeExtension() {
  return {
    id: active.id,
    meta: active.meta,
    params: active.params,
    error: active.error,
    builds: active.builds,
  };
}

export function isActive(id) {
  return active.id === id;
}

/** Default values for whatever the extension declared. */
function defaultParams(meta) {
  const out = {};
  for (const p of (meta && meta.params) || []) {
    if (p && typeof p.key === 'string') out[p.key] = Number(p.value ?? p.min ?? 0);
  }
  return out;
}

export function setParam(key, value) {
  active.params[key] = value;
  const item = extLibrary.find((it) => it.id === active.id);
  if (item) { item.params = { ...active.params }; persist(); }
}

export function deactivate() {
  active.sandbox?.stop();
  active.id = null;
  active.sandbox = null;
  active.meta = null;
  active.params = {};
  active.geometry = null;
  active.error = null;
  active.building = false;
  active.builds = 0;
  announce();
}

/**
 * Start an extension. Any failure — bad syntax, no `build`, a first build that
 * never returns — surfaces as an error on the extension rather than as an
 * exception here, because a broken contribution must not take the piece down.
 */
export async function activate(id) {
  const item = extLibrary.find((it) => it.id === id);
  if (!item) return 'that extension has gone';
  deactivate();

  active.id = id;
  active.sandbox = new ExtensionSandbox();
  try {
    const meta = await active.sandbox.load(item.code);
    active.meta = meta;
    active.params = { ...defaultParams(meta), ...(item.params || {}) };
    active.error = null;
    announce();
    return `running "${meta.name || item.name}"`;
  } catch (err) {
    active.error = err.message;
    announce();
    return `${item.name}: ${err.message}`;
  }
}

/**
 * Called every frame. Returns the geometry to draw — which is the last thing
 * the extension produced, not the thing it is producing now — and quietly
 * starts the next build if the previous one has finished.
 */
export function extensionGeometry(t) {
  if (!active.sandbox || !active.meta || active.error) return null;

  if (!active.building) {
    active.building = true;
    const first = active.builds === 0;
    active.sandbox.build({ ...active.params }, t, first)
      .then((out) => {
        active.geometry = out;
        active.builds++;
        active.error = null;
      })
      .catch((err) => {
        // A build that fails stops the layer rather than repeating the failure
        // sixty times a second. The message is kept so the panel can show it.
        active.error = err.message;
        active.geometry = null;
        announce();
      })
      .finally(() => { active.building = false; });
  }

  return active.geometry;
}

/* ------------------------------------------------------------------ library */

/**
 * Take some code into the library, checking first that it loads and builds.
 * A contribution that cannot produce geometry is refused now rather than
 * saved and discovered later.
 */
export async function addExtension(name, code) {
  if (extLibrary.length >= MAX_EXTENSIONS) {
    return { error: `the library holds ${MAX_EXTENSIONS} — remove one first` };
  }
  const probe = new ExtensionSandbox();
  try {
    const meta = await probe.load(code);
    const out = await probe.build(defaultParams(meta), 0, true);
    const points = out.paths.reduce((n, p) => n + p.points.length / 3, 0);
    if (!points && !out.dots.length) {
      return { error: 'it loaded, but built nothing to draw' };
    }
    const item = {
      id: newId(),
      name: (name || meta.name || 'Untitled').trim().slice(0, 40),
      code,
      params: defaultParams(meta),
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
  if (active.id === id) deactivate();
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
