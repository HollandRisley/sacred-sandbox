import { DEFAULTS, stateDiff } from '../state.js';

/**
 * A POSITION IN A LINK
 *
 * An artwork here is the settings and the angle together, and both fit in a URL
 * — so sharing one needs no server, no account and no storage. The whole thing
 * travels in the fragment, which browsers never send to the host, so even the
 * page's own origin never sees what you made.
 *
 * What goes in is the *difference from the opening state*, not the state. A
 * typical composition moves twenty or thirty of the hundred-odd parameters, so
 * the payload is a fraction of the whole and stays readable while it is being
 * built. It also survives the build changing underneath it: a key added later
 * is simply absent and falls back to its default, and a key removed is ignored
 * on the way in. A packed binary encoding would be shorter by a third and would
 * break on both counts.
 *
 * Compressed with `deflate-raw` and encoded base64url, which is the alphabet
 * that survives being pasted into a chat window, a QR code or a mail client.
 */

const PREFIX = 's=';

/** Shipped sprites travel; your own do not — see `carrySprite`. */
const FOLDER_SPRITE = /^folder:/;

/**
 * Your own uploaded pictures live in your browser and nowhere else, so an id
 * naming one is meaningless to whoever opens the link. Rather than send them a
 * broken reference, the field is dropped and their copy falls back to the
 * shipped glyphs. Sharing the picture itself would make this an image host.
 */
function carrySprite(value) {
  return typeof value === 'string' && FOLDER_SPRITE.test(value) ? value : undefined;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

function bytesToBase64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(text) {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function squeeze(text, mode) {
  const stream = mode === 'deflate'
    ? new CompressionStream('deflate-raw')
    : new DecompressionStream('deflate-raw');
  const blob = new Blob([text]);
  const packed = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(packed).arrayBuffer());
}

/**
 * Encode the live state and camera into the fragment payload.
 * Returns a string, or null if the browser has no CompressionStream.
 */
export async function encodeSetup(state, camera, controls) {
  if (typeof CompressionStream === 'undefined') return null;

  const diff = stateDiff(state);
  const sprite = carrySprite(diff.emImage);
  if (diff.emImage !== undefined && sprite === undefined) delete diff.emImage;
  if (sprite) diff.emImage = sprite;

  const payload = {
    v: 1,
    s: diff,
    c: camera.position.toArray().map(round3),
    t: controls.target.toArray().map(round3),
  };

  const bytes = await squeeze(JSON.stringify(payload), 'deflate');
  return PREFIX + bytesToBase64url(bytes);
}

/**
 * Decode a fragment payload back to `{ state, cam, target }` in the shape
 * `applySetup` already expects, so a link and a save load by the same path.
 * Returns null for anything unreadable — a truncated paste is the normal case,
 * not an exceptional one, and it should not take the piece down.
 */
export async function decodeSetup(fragment) {
  if (!fragment) return null;
  const text = fragment.startsWith(PREFIX) ? fragment.slice(PREFIX.length) : fragment;
  if (!text) return null;

  try {
    const json = new TextDecoder().decode(await squeeze(base64urlToBytes(text), 'inflate'));
    const payload = JSON.parse(json);
    if (!payload || payload.v !== 1 || typeof payload.s !== 'object') return null;

    // Only keys this build still knows about, and only of the type it expects.
    // A link is untrusted input: it arrives from wherever it was pasted from.
    const clean = {};
    for (const [k, val] of Object.entries(payload.s)) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      if (typeof val !== typeof DEFAULTS[k]) continue;
      if (typeof val === 'number' && !Number.isFinite(val)) continue;
      if (k === 'emImage' && carrySprite(val) === undefined) continue;
      clean[k] = val;
    }

    const vec3 = (a) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) ? a : null);
    return { v: 1, at: Date.now(), state: clean, cam: vec3(payload.c), target: vec3(payload.t) };
  } catch (err) {
    console.warn('Could not read that link', err);
    return null;
  }
}

/** The full shareable URL for the current position. */
export async function shareLink(state, camera, controls) {
  const fragment = await encodeSetup(state, camera, controls);
  if (!fragment) return null;
  const url = new URL(window.location.href);
  url.hash = fragment;
  return url.toString();
}

/**
 * The payload in the address bar, if there is one. The fragment is cleared as
 * it is read: a link is a starting point, not a mode, and leaving it in place
 * means a reload silently throws away everything done since.
 */
export async function takeIncomingLink() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith(PREFIX)) return null;
  const data = await decodeSetup(hash);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return data;
}
