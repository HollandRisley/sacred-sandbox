import { ExtensionSandbox } from './extensionSandbox.js';

/**
 * ASKING FOR MATHS
 *
 * Describe what you want and have the code written. The model is reached
 * through the dev server, never from here — there is no endpoint and no key in
 * the built bundle, and on the deployed site this simply reports itself absent.
 *
 * THE REPAIR LOOP IS THE POINT. A model small enough to run on a laptop will
 * often not get this right first time: a missing `closed`, points as objects
 * rather than a flat array, an `import` it was told not to use. Rather than
 * hand that to the user as a failure, the code is run in the sandbox
 * immediately and, if it fails, the *exact* error goes back for another
 * attempt. The error names the rule that was broken, which is far more useful
 * to the model than the original request repeated.
 *
 * Nothing is saved and nothing is drawn until the caller says so. The code is
 * shown first.
 */

const HEALTH = 'api/ai/health';
const WRITE = 'api/ai/write';

/** Two repairs. A third rarely helps and the waiting becomes the experience. */
export const MAX_REPAIRS = 2;

let cached = null;

/**
 * Whether an assistant is reachable. On the deployed site the route does not
 * exist, so this is a 404 and the panel says to run it locally.
 */
export async function assistantAvailable() {
  if (cached !== null) return cached;
  try {
    const res = await fetch(new URL(HEALTH, document.baseURI), { cache: 'no-store' });
    if (!res.ok) { cached = false; return cached; }
    const info = await res.json();
    // The route existing is not the same as a model answering.
    cached = info.ok ? info : false;
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * How long to wait before giving up. Generous, because a local model that has
 * been idle reloads its weights before it writes a word — measured at 51
 * seconds for a twenty-gigabyte model on a warm machine — but not unbounded,
 * because a request that will never answer should say so rather than leave a
 * button disabled forever.
 */
export const PATIENCE = 300_000;

async function askOnce(want, previous, error) {
  const res = await fetch(new URL(WRITE, document.baseURI), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ want, previous, error }),
    signal: AbortSignal.timeout(PATIENCE),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `the assistant answered ${res.status}`);
  return data.code;
}

/**
 * Ask for an extension and keep asking until it actually runs.
 *
 * `onStep` is called with a short line of what is happening, because a local
 * model can take twenty seconds and a silent panel looks broken.
 *
 * Resolves with `{ code, attempts, meta, points }`, or throws with the last
 * error if it could not be made to work.
 */
export async function writeExtension(want, onStep = () => {}) {
  let previous = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_REPAIRS + 1; attempt++) {
    onStep(attempt === 1 ? 'writing…' : `fixing (${attempt - 1} of ${MAX_REPAIRS})…`);
    let code;
    try {
      code = await askOnce(want, previous, lastError);
    } catch (err) {
      // A timeout is not the model being wrong, it is the model being absent
      // or overwhelmed, and it needs saying differently.
      if (err.name === 'TimeoutError') throw new Error('the model did not answer in five minutes — is it still running?');
      throw err;
    }

    onStep('testing…');
    const probe = new ExtensionSandbox();
    try {
      const meta = await probe.load(code);
      const params = {};
      for (const p of meta.params || []) params[p.key] = Number(p.value ?? p.min ?? 0);
      const out = await probe.build(params, 0, true);
      const points = out.paths.reduce((n, path) => n + path.points.length / 3, 0);
      if (!points && !out.dots.length) throw new Error('it ran but drew nothing');
      // Asked for a second frame as well: plenty of generated code works at
      // t = 0 and divides by zero a moment later.
      await probe.build(params, 1.7, false);
      return { code, attempts: attempt, meta, points };
    } catch (err) {
      lastError = err.message;
      previous = code;
      onStep(`attempt ${attempt} failed: ${lastError}`);
    } finally {
      probe.stop();
    }
  }

  throw new Error(`could not get it working: ${lastError}`);
}
