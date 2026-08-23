import contract from '../../docs/extensions.md';
import {
  extractLiteral, quotaKey, secondsUntilMidnight, validate, buildMessages,
} from './lib.js';

/**
 * THE PUBLIC ASSISTANT
 *
 * The same thing the dev server does, on Cloudflare's edge, so the deployed
 * site can offer it too. It runs an open model through Workers AI, which means
 * no second vendor, no key to hold, and — at the size of request this makes —
 * a cost measured in fractions of a penny.
 *
 * Cheap per request is not the same as safe when hammered, so the controls
 * below are not optional extras. In order of how much they matter:
 *
 *   • a daily quota per visitor, counted against a *hashed* address
 *   • hard caps on how much can be asked for and how much comes back
 *   • a kill switch held in KV, so it can be turned off without a deploy
 *
 * `docs/extensions.md` is the system prompt, imported as text at build time —
 * one description of the contract serving the person, the dev server and this.
 */

const LIMITS = {
  wantChars: 400,      // a description, not an essay
  codeChars: 8000,     // enough for a repair round-trip
  maxTokens: 1400,     // an extension is small; anything longer is a runaway
  dailyPerVisitor: 25,
};

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...extra },
});

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Same-origin requests carry no Origin header and need no permission; this is
  // only for a site served from somewhere other than the Worker.
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  };
}

/** Off without a deploy: set `killswitch` to anything truthy in KV. */
async function switchedOff(env) {
  if (!env.QUOTA) return false;
  return Boolean(await env.QUOTA.get('killswitch'));
}

async function spend(env, request) {
  if (!env.QUOTA) return { ok: true, left: null };   // no store bound, no counting
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await quotaKey(address, env.QUOTA_SALT || 'sandbox');
  const used = Number(await env.QUOTA.get(key)) || 0;
  const limit = Number(env.DAILY_LIMIT) || LIMITS.dailyPerVisitor;
  if (used >= limit) return { ok: false, left: 0, limit };
  await env.QUOTA.put(key, String(used + 1), { expirationTtl: secondsUntilMidnight() });
  return { ok: true, left: limit - used - 1, limit };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/api/ai/health') {
      const off = await switchedOff(env);
      return json({
        ok: Boolean(env.AI) && !off,
        provider: 'workers-ai',
        model: env.AI_MODEL || '@cf/qwen/qwen2.5-coder-32b-instruct',
        endpoint: 'workers-ai',
        why: off ? 'the assistant is switched off' : (env.AI ? '' : 'no AI binding'),
      }, 200, headers);
    }

    if (url.pathname === '/api/ai/write') {
      if (request.method !== 'POST') return json({ error: 'post only' }, 405, headers);
      if (await switchedOff(env)) return json({ error: 'the assistant is switched off' }, 503, headers);
      if (!env.AI) return json({ error: 'no AI binding' }, 500, headers);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'expected JSON' }, 400, headers);
      }

      const asked = validate(body, LIMITS);
      if (asked.error) return json({ error: asked.error }, 400, headers);

      const quota = await spend(env, request);
      if (!quota.ok) {
        return json({ error: `that is ${quota.limit} for today — it resets at midnight UTC` }, 429, headers);
      }

      try {
        const reply = await env.AI.run(env.AI_MODEL || '@cf/qwen/qwen2.5-coder-32b-instruct', {
          messages: buildMessages(contract, asked.want, asked.previous, asked.failure),
          max_tokens: LIMITS.maxTokens,
        });
        const code = extractLiteral(reply.response || reply.result?.response || '');
        if (!code.startsWith('{')) {
          return json({ error: 'the model did not return an object literal' }, 502, headers);
        }
        return json({ code, model: env.AI_MODEL, left: quota.left }, 200, headers);
      } catch (err) {
        return json({ error: String(err.message || err) }, 502, headers);
      }
    }

    return json({ error: 'not found' }, 404, headers);
  },
};
