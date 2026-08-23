import { resetState } from '../state.js';

/**
 * THE GALLERY
 *
 * A saved piece is the whole instrument plus where the camera is standing plus
 * a picture of what that looked like. The settings alone are not enough to
 * recognise one from another — a list of names tells you nothing about a work
 * made of light — so every entry carries its own thumbnail and the gallery is
 * a wall of images rather than a menu.
 *
 * Storage is `localStorage`, which is a few megabytes and shared with
 * everything else this origin keeps. Thumbnails are the only heavy part, at
 * roughly 10 kB each, so the list is capped and the cap is reported rather than
 * silently dropping the oldest — losing a piece you made without being told is
 * worse than being refused a new one.
 */

const KEY = 'sacred-sandbox:gallery:v2';
const LEGACY_KEY = 'sacred-sandbox:setup:v1';

/** Twenty at ~10 kB of thumbnail each is ~250 kB — comfortable, and finite. */
export const MAX_ITEMS = 20;

const now = () => Date.now();
const newId = () => `g${now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.v === 2 && Array.isArray(data.items)) return data.items;
    }
  } catch (err) {
    console.warn('Could not read the gallery', err);
  }
  return null;
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, items }));
    return '';
  } catch (err) {
    // A full quota is the common case here, and it is worth naming: the caller
    // can tell the user to remove something rather than leaving them to wonder
    // why a save did not stick.
    console.warn('Could not write the gallery', err);
    return 'no room left in storage — remove a piece first';
  }
}

/**
 * The single slot this used to be, carried across the first time the gallery is
 * read. It keeps its own key rather than being deleted, so downgrading to an
 * older build finds its save exactly where it left it.
 */
function migrateLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const old = JSON.parse(raw);
    if (!old || old.v !== 1 || !old.state) return [];
    return [{
      id: newId(),
      name: 'Saved setup',
      at: old.at || now(),
      state: old.state,
      cam: old.cam || null,
      target: old.target || null,
      thumb: null,
    }];
  } catch (err) {
    console.warn('Could not migrate the old save', err);
    return [];
  }
}

let cache = null;

/** Every saved piece, newest first. */
export function listSetups() {
  if (cache) return cache;
  const stored = read();
  if (stored) {
    cache = stored;
  } else {
    cache = migrateLegacy();
    if (cache.length) write(cache);
  }
  return cache;
}

export function getSetup(id) {
  return listSetups().find((it) => it.id === id) || null;
}

/**
 * Keep the current position as a new piece. `thumb` is a data URL or null —
 * a gallery entry without a picture is still a gallery entry, and a browser
 * that refuses to read the canvas should not also refuse to save.
 */
export function saveSetup(state, camera, controls, { name, thumb } = {}) {
  const items = listSetups();
  if (items.length >= MAX_ITEMS) {
    return { error: `the gallery holds ${MAX_ITEMS} pieces — remove one first` };
  }
  const item = {
    id: newId(),
    name: (name || '').trim() || `Piece ${items.length + 1}`,
    at: now(),
    state: { ...state },
    cam: camera.position.toArray(),
    target: controls.target.toArray(),
    thumb: thumb || null,
  };
  items.unshift(item);
  const warn = write(items);
  if (warn) {
    // Rolled back rather than left in memory looking saved.
    items.shift();
    return { error: warn };
  }
  return { item };
}

export function renameSetup(id, name) {
  const item = getSetup(id);
  if (!item) return false;
  item.name = (name || '').trim() || item.name;
  write(listSetups());
  return true;
}

export function removeSetup(id) {
  const items = listSetups();
  const i = items.findIndex((it) => it.id === id);
  if (i < 0) return false;
  items.splice(i, 1);
  write(items);
  return true;
}

export function clearGallery() {
  cache = [];
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch (err) {
    console.warn('Could not clear the gallery', err);
  }
}

/**
 * Apply a saved payload. Reset first, then apply: merging onto whatever was on
 * screen meant anything the save did not mention survived underneath it, so
 * loading a spare piece over a busy one kept the busy one's leftovers and read
 * as the save being wrong rather than as two pieces being mixed.
 *
 * Only keys the current build still recognises are copied, so an old save
 * cannot inject parameters that no longer exist.
 */
export function applySetup(data, state, camera, controls) {
  if (!data || !data.state) return false;
  resetState(state);
  for (const k of Object.keys(state)) {
    if (Object.prototype.hasOwnProperty.call(data.state, k)) state[k] = data.state[k];
  }
  if (data.cam) camera.position.fromArray(data.cam);
  if (data.target) controls.target.fromArray(data.target);
  // Zoom is deliberately not stored: the layout code owns it, shrinking the
  // view when the panel is open, so a restored value would just be overwritten.
  camera.updateProjectionMatrix();
  controls.update();
  return true;
}

export function describeSetup(data) {
  if (!data) return 'nothing saved yet';
  const d = new Date(data.at);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
