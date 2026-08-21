import * as THREE from 'three/webgpu';

/**
 * THE SPRITE LIBRARY
 *
 * Images the emitter can throw. Two sources, one list:
 *
 *   • the folder — `public/particles/`, listed by `manifest.json`. Drop a file
 *     in, add a line, and it is pickable. Shipped as SVG so the set costs a few
 *     kilobytes and can be edited in any text editor.
 *   • yours — anything added through the panel. Downscaled to 256px and kept in
 *     `localStorage`, under its own key rather than the setup's, so clearing a
 *     saved artwork does not throw the pictures away with it.
 *
 * Textures are cached by id and built lazily, so a library of thirty images
 * costs nothing until one is actually emitted.
 */

const KEY = 'sacred-sandbox:sprites:v1';
const MAX_USER = 16;
const THUMB = 256;

const listeners = new Set();
const textures = new Map();

/** @type {Array<{id: string, name: string, url: string, mine: boolean}>} */
export const spriteLibrary = [];

export function onSpritesChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce() {
  for (const fn of listeners) fn();
}

/**
 * Resolve against the document rather than the origin: the build is served from
 * a sub-path on GitHub Pages, so an absolute '/particles/...' would miss.
 */
function assetUrl(file) {
  return new URL(`particles/${file}`, document.baseURI).href;
}

function readMine() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Could not read the sprite library', err);
    return [];
  }
}

function writeMine() {
  const mine = spriteLibrary.filter((s) => s.mine).map(({ id, name, url }) => ({ id, name, url }));
  try {
    localStorage.setItem(KEY, JSON.stringify(mine));
    return '';
  } catch (err) {
    // Data URLs are bulky and the quota is a few megabytes. Say so rather than
    // silently dropping the picture the moment the page reloads.
    console.warn('Could not save the sprite library', err);
    return 'no room left in storage — this image will not survive a reload';
  }
}

/**
 * Load the shipped folder. A missing or malformed manifest is not an error: the
 * library simply starts with whatever the user has added.
 */
export async function loadSpriteFolder() {
  let list = [];
  try {
    const res = await fetch(assetUrl('manifest.json'), { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      list = Array.isArray(data) ? data : (data.images || []);
    }
  } catch (err) {
    console.warn('No particle folder manifest', err);
  }

  for (const entry of list) {
    const file = typeof entry === 'string' ? entry : entry.file;
    if (!file) continue;
    const name = (typeof entry === 'string' ? null : entry.name) || file.replace(/\.[^.]+$/, '');
    spriteLibrary.push({ id: `folder:${file}`, name, url: assetUrl(file), mine: false });
  }

  for (const s of readMine()) {
    if (s && s.id && s.url) spriteLibrary.push({ id: s.id, name: s.name || 'image', url: s.url, mine: true });
  }

  announce();
  return spriteLibrary;
}

/**
 * Take a file from the panel into the library.
 *
 * Downscaled to 256px on the long edge before it is stored: a phone photo is
 * several megabytes, the quota is about five, and a particle is thirty pixels
 * on screen. Transparency is preserved by going out as PNG.
 */
export function addSprite(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      resolve({ error: 'that is not an image' });
      return;
    }
    if (spriteLibrary.filter((s) => s.mine).length >= MAX_USER) {
      resolve({ error: `the library holds ${MAX_USER} of your images — remove one first` });
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => resolve({ error: 'could not read that file' });
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve({ error: 'could not decode that image' });
      img.onload = () => {
        const scale = Math.min(1, THUMB / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        const item = {
          id: `mine:${file.name}:${spriteLibrary.length}:${Math.round(performance.now())}`,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 24),
          url: canvas.toDataURL('image/png'),
          mine: true,
        };
        spriteLibrary.push(item);
        const warn = writeMine();
        announce();
        resolve({ item, warn });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function removeSprite(id) {
  const i = spriteLibrary.findIndex((s) => s.id === id);
  if (i < 0 || !spriteLibrary[i].mine) return false;
  const [gone] = spriteLibrary.splice(i, 1);
  const tex = textures.get(gone.id);
  if (tex) { tex.dispose(); textures.delete(gone.id); }
  writeMine();
  announce();
  return true;
}

/**
 * The texture for one sprite, built once and kept. Anisotropy is left to the
 * renderer's maximum by the caller if it wants it; the default is fine for
 * something a few dozen pixels across.
 */
export function spriteTexture(id) {
  if (textures.has(id)) return textures.get(id);
  const item = spriteLibrary.find((s) => s.id === id);
  if (!item) return null;
  const tex = new THREE.TextureLoader().load(item.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  textures.set(id, tex);
  return tex;
}

/**
 * Which sprites a given selection resolves to. An empty selection means the
 * whole library, which is how "all of them" is expressed — the emitter then
 * deals the images out across its arms.
 */
export function resolveSprites(selection) {
  if (!spriteLibrary.length) return [];
  if (!selection) return spriteLibrary.slice();
  const one = spriteLibrary.find((s) => s.id === selection);
  // A saved artwork can name an image that has since been removed. Falling back
  // to the whole library keeps the piece rendering rather than emitting nothing.
  return one ? [one] : spriteLibrary.slice();
}
