/**
 * The parts of the assistant that are just logic, kept apart from the Worker so
 * they can be run and tested without a Cloudflare account.
 */

/**
 * Models wrap code in fences and add preamble whatever they are told, so the
 * object literal is dug out rather than hoped for.
 */
export function extractLiteral(text) {
  let out = String(text || '').trim();
  const fence = out.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
  if (fence) out = fence[1].trim();
  const first = out.indexOf('{');
  const last = out.lastIndexOf('}');
  if (first >= 0 && last > first) out = out.slice(first, last + 1);
  return out.trim();
}

/**
 * A day-stamped key per visitor. The address is hashed with a secret rather
 * than stored: the Worker needs to count requests, not to know who made them,
 * and a hashed key cannot be read back into an address by anyone who sees the
 * store. It rolls at UTC midnight by construction — no cleanup job, because the
 * key for yesterday is simply never asked for again and expires on its own.
 */
export async function quotaKey(address, salt, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${salt}:${address}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hash = [...new Uint8Array(digest)].slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `q:${day}:${hash}`;
}

/** Seconds until UTC midnight, so a counter expires exactly when it stops counting. */
export function secondsUntilMidnight(now = new Date()) {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((midnight - now.getTime()) / 1000));
}

/** What the caller asked for, or a reason it will not be accepted. */
export function validate(body, limits) {
  if (!body || typeof body !== 'object') return { error: 'expected an object' };
  const want = String(body.want || '').trim();
  if (!want) return { error: 'say what you want to see' };
  if (want.length > limits.wantChars) return { error: `keep it under ${limits.wantChars} characters` };

  const previous = body.previous ? String(body.previous) : '';
  const failure = body.error ? String(body.error) : '';
  if (previous.length > limits.codeChars) return { error: 'that code is too long to repair' };
  return { want, previous: previous.slice(0, limits.codeChars), failure: failure.slice(0, 400) };
}

/** The messages sent to the model, contract first so it can be cached. */
export function buildMessages(contract, want, previous, failure) {
  const system = `You write small geometry generators for a three.js art piece.

${contract}

Answer with the object literal and nothing else. No prose, no explanation, and
no markdown fence. It must start with { and end with }. Prefer something that
moves with t and has two or three parameters worth turning.`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Write an extension: ${want}` },
  ];
  if (previous && failure) {
    messages.push({ role: 'assistant', content: previous });
    messages.push({
      role: 'user',
      content: `That failed with: ${failure}\n\nFix it and return the whole object literal again, nothing else.`,
    });
  }
  return messages;
}
