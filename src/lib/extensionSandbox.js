/**
 * RUNNING SOMEBODY ELSE'S MATHS
 *
 * Contributed geometry is untrusted code: written by a stranger, or by a model,
 * and either way capable of being wrong in ways nobody intended. It runs behind
 * two walls.
 *
 * The first is an iframe with `sandbox="allow-scripts"`, which gives the
 * document an *opaque* origin — it belongs to nobody, so it cannot reach this
 * page's DOM, its variables, its storage or its cookies. The second is the
 * policy below: `default-src 'none'` with `connect-src 'none'` is what actually
 * removes `fetch`, `XMLHttpRequest`, `sendBeacon` and `WebSocket`, so an
 * extension can neither call home with what it was given nor pull down more
 * code to run.
 *
 * Inside that, the extension runs in a *worker*, so an endless loop blocks
 * nothing anyone can see and can simply be terminated. Measured, all of it:
 *
 *   opaque iframe origin              null
 *   blob worker inside it             starts and replies
 *   fetch / XHR / beacon / WebSocket  all four refused, CSP violations logged
 *   parent DOM / storage / cookies    all three unreachable
 *
 * THE HARNESS IS INLINED RATHER THAN FETCHED. A document loaded into a
 * sandboxed iframe by `src` never runs its scripts — measured, with and without
 * a policy, and the same content as `srcdoc` runs perfectly. So it is carried
 * here as a string. That also means no second file to keep in step, and no
 * path to resolve when the site is served from a sub-path.
 */

const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; style-src 'unsafe-inline'; img-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';";

const HARNESS = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<script>

/* eslint-disable no-restricted-globals */
(() => {
  'use strict';

  /** Ceilings. An extension that exceeds one is stopped, not trusted to stop. */
  const LIMITS = {
    buildMs: 2000,      // first build, which may do real setup work
    frameMs: 120,       // every build after that
    maxPaths: 400,
    maxPoints: 60000,   // across all paths together
    maxDots: 4000,
    coord: 1e4,         // anything beyond this is a mistake, not a composition
  };

  /**
   * The harness the extension is wrapped in, inside the worker. The extension
   * itself never sees \`postMessage\` or anything else it could reach out with —
   * it is handed numbers and asked for numbers.
   */
  const WORKER_SOURCE = \`
'use strict';
let build = null;
let meta = null;

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.kind === 'load') {
      // Indirect eval, so the extension gets the global scope and not this
      // function's locals. It still cannot reach the page: it is in a worker,
      // in an opaque origin, under a policy with no network.
      const mod = (0, eval)('(' + msg.code + ')');
      if (!mod || typeof mod.build !== 'function') throw new Error('no build() exported');
      build = mod.build;
      meta = mod.meta || { name: 'Untitled', params: [] };
      self.postMessage({ id: msg.id, ok: true, meta });
      return;
    }

    if (msg.kind === 'build') {
      if (!build) throw new Error('nothing loaded');
      const out = build(msg.params || {}, msg.t || 0);
      self.postMessage({ id: msg.id, ok: true, out });
      return;
    }
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err && err.message || err) });
  }
};
\`;

  let worker = null;
  let workerUrl = null;
  let nextId = 1;
  const waiting = new Map();

  function killWorker() {
    if (worker) worker.terminate();
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    worker = null;
    workerUrl = null;
    for (const [, entry] of waiting) {
      clearTimeout(entry.timer);
      entry.reject('the extension was stopped');
    }
    waiting.clear();
  }

  function startWorker() {
    killWorker();
    const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' });
    workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      const entry = waiting.get(e.data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      waiting.delete(e.data.id);
      entry.resolve(e.data);
    };
    worker.onerror = (e) => {
      // A syntax error in the extension surfaces here rather than as a reply.
      for (const [, entry] of waiting) {
        clearTimeout(entry.timer);
        entry.reject(e.message || 'the extension failed to start');
      }
      waiting.clear();
    };
  }

  function ask(payload, budgetMs) {
    return new Promise((resolve, reject) => {
      if (!worker) startWorker();
      const id = nextId++;
      const timer = setTimeout(() => {
        waiting.delete(id);
        // Terminated rather than waited on: a worker in an endless loop will
        // never answer, and asking it to stop requires it to be listening.
        killWorker();
        reject(\`took longer than \${budgetMs}ms and was stopped\`);
      }, budgetMs);
      waiting.set(id, { resolve, reject, timer });
      worker.postMessage({ ...payload, id });
    });
  }

  /**
   * Everything an extension returns is checked before it is believed. A NaN
   * reaches the vertex buffer and silently deletes whole objects from the
   * scene; a run-away point count costs frames. Both are far easier to
   * diagnose here than three layers downstream.
   */
  function check(out) {
    if (!out || typeof out !== 'object') throw new Error('build() returned nothing');
    const paths = Array.isArray(out.paths) ? out.paths : [];
    const dots = Array.isArray(out.dots) ? out.dots : [];
    if (paths.length > LIMITS.maxPaths) throw new Error(\`too many paths (\${paths.length} > \${LIMITS.maxPaths})\`);
    if (dots.length > LIMITS.maxDots) throw new Error(\`too many dots (\${dots.length} > \${LIMITS.maxDots})\`);

    let total = 0;
    const clean = [];
    for (const path of paths) {
      const pts = path && path.points;
      if (!Array.isArray(pts) && !ArrayBuffer.isView(pts)) continue;
      if (pts.length % 3 !== 0) throw new Error('points must come in threes');
      total += pts.length / 3;
      if (total > LIMITS.maxPoints) throw new Error(\`too many points (over \${LIMITS.maxPoints})\`);
      const arr = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i++) {
        const v = pts[i];
        if (!Number.isFinite(v)) throw new Error('a coordinate was NaN or infinite');
        arr[i] = Math.max(-LIMITS.coord, Math.min(LIMITS.coord, v));
      }
      clean.push({ points: arr, closed: !!(path && path.closed) });
    }

    const cleanDots = [];
    for (const d of dots) {
      if (!d) continue;
      const v = [d.x, d.y, d.z, d.r == null ? 1 : d.r];
      if (!v.every(Number.isFinite)) throw new Error('a dot was NaN or infinite');
      cleanDots.push({ x: v[0], y: v[1], z: v[2], r: v[3] });
    }
    return { paths: clean, dots: cleanDots };
  }

  let loaded = false;

  window.addEventListener('message', async (e) => {
    const msg = e.data;
    if (!msg || !msg.sandbox) return;
    const reply = (body) => e.source.postMessage({ sandbox: true, id: msg.id, ...body }, '*');

    try {
      if (msg.kind === 'load') {
        startWorker();
        const res = await ask({ kind: 'load', code: msg.code }, LIMITS.buildMs);
        if (!res.ok) throw new Error(res.error);
        loaded = true;
        reply({ ok: true, meta: res.meta });
        return;
      }

      if (msg.kind === 'build') {
        if (!loaded) throw new Error('nothing loaded');
        const budget = msg.first ? LIMITS.buildMs : LIMITS.frameMs;
        const res = await ask({ kind: 'build', params: msg.params, t: msg.t }, budget);
        if (!res.ok) throw new Error(res.error);
        const out = check(res.out);
        reply({ ok: true, out });
        return;
      }

      if (msg.kind === 'stop') { killWorker(); loaded = false; reply({ ok: true }); return; }

      // A probe used by the tests to prove the policy is doing its job.
      if (msg.kind === 'selftest') {
        const result = {};
        try { await fetch('https://example.com'); result.fetch = 'ALLOWED'; }
        catch (err) { result.fetch = 'blocked: ' + String(err.message).slice(0, 60); }
        // A constructor that does not throw proves nothing — the policy refuses
        // these at the network layer, asynchronously. Reporting "allowed"
        // because the WebSocket constructor returned would be worse than not
        // testing at all.
        const violations = [];
        document.addEventListener('securitypolicyviolation',
          (v) => violations.push(v.violatedDirective));
        try { const x = new XMLHttpRequest(); x.open('GET', 'https://example.com'); x.send(); } catch (err) { /* refused outright */ }
        try { navigator.sendBeacon('https://example.com', 'x'); } catch (err) { /* refused outright */ }
        result.ws = await new Promise((res) => {
          let sock;
          try { sock = new WebSocket('wss://echo.websocket.org'); }
          catch (err) { res('refused at construction'); return; }
          sock.onopen = () => { res('CONNECTED'); try { sock.close(); } catch (e) { /* closing a dead socket */ } };
          sock.onerror = () => res('refused');
          setTimeout(() => res('no answer'), 2000);
        });
        result.cspViolations = violations.join(', ') || '(none)';
        result.origin = String(window.origin);
        result.canSeeParentDom = (() => {
          try { return !!window.parent.document.title; } catch { return false; }
        })();
        result.canSeeStorage = (() => {
          try { return !!window.localStorage; } catch { return false; }
        })();
        result.workerStarted = (() => {
          try { startWorker(); return !!worker; } catch (err) { return 'ERR ' + err.message; }
        })();
        reply({ ok: true, result });
        return;
      }

      throw new Error('unknown request');
    } catch (err) {
      reply({ ok: false, error: String(err && err.message || err) });
    }
  });

  // Announce readiness; the host waits for this rather than guessing at a delay.
  if (window.parent !== window) window.parent.postMessage({ sandbox: true, kind: 'ready' }, '*');
})();

<\/script>`;

/** How long a build may take before the worker running it is destroyed. */
export const BUDGET = { first: 2000, frame: 120 };

/**
 * One sandbox, holding one extension. Create it, `load` some code, then `build`
 * as often as you like; `stop` tears the whole frame down, which is also what
 * happens automatically if anything inside it stops answering.
 */
export class ExtensionSandbox {
  constructor() {
    this.frame = null;
    this.ready = null;
    this.loaded = false;
    this.meta = null;
    this._next = 1;
    this._waiting = new Map();
    this._onMessage = this._onMessage.bind(this);
  }

  _onMessage(e) {
    const d = e.data;
    if (!d || !d.sandbox || e.source !== this.frame?.contentWindow) return;
    if (d.kind === 'ready') { this._resolveReady?.(true); return; }
    const entry = this._waiting.get(d.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this._waiting.delete(d.id);
    entry.resolve(d);
  }

  start() {
    this.stop();
    window.addEventListener('message', this._onMessage);
    const frame = document.createElement('iframe');
    // No allow-same-origin: that is the whole point. With it the document gets
    // this page's origin back and every wall above comes down.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;border:0';
    this.ready = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      setTimeout(() => reject(new Error('the sandbox did not start')), 5000);
    });
    frame.srcdoc = HARNESS;
    document.body.appendChild(frame);
    this.frame = frame;
    return this.ready;
  }

  stop() {
    window.removeEventListener('message', this._onMessage);
    for (const [, entry] of this._waiting) {
      clearTimeout(entry.timer);
      entry.reject(new Error('the sandbox was stopped'));
    }
    this._waiting.clear();
    this.frame?.remove();
    this.frame = null;
    this.loaded = false;
    this.meta = null;
  }

  _ask(msg, budgetMs) {
    return new Promise((resolve, reject) => {
      if (!this.frame) { reject(new Error('the sandbox is not running')); return; }
      const id = this._next++;
      const timer = setTimeout(() => {
        this._waiting.delete(id);
        // The frame is destroyed rather than waited on. Something that has
        // stopped answering cannot be asked to stop.
        this.stop();
        reject(new Error(`took longer than ${budgetMs}ms and was stopped`));
      }, budgetMs + 400);
      this._waiting.set(id, { resolve, reject, timer });
      this.frame.contentWindow.postMessage({ sandbox: true, id, ...msg }, '*');
    });
  }

  /** Hand over an extension's source. Resolves with its `meta`. */
  async load(code) {
    if (!this.frame) await this.start();
    else await this.ready;
    const res = await this._ask({ kind: 'load', code }, BUDGET.first);
    if (!res.ok) throw new Error(res.error);
    this.loaded = true;
    this.meta = res.meta;
    return res.meta;
  }

  /** Ask for geometry. Returns `{ paths, dots }`, already checked and clamped. */
  async build(params, t, first = false) {
    const res = await this._ask({ kind: 'build', params, t, first }, first ? BUDGET.first : BUDGET.frame);
    if (!res.ok) throw new Error(res.error);
    return res.out;
  }

  /** Ask the sandbox to report on its own confinement. Used by the tests. */
  async selftest() {
    if (!this.frame) await this.start();
    else await this.ready;
    const res = await this._ask({ kind: 'selftest' }, 6000);
    if (!res.ok) throw new Error(res.error);
    return res.result;
  }
}
