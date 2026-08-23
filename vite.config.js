import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

/**
 * THE LOCAL MATHS ASSISTANT
 *
 * Describe what you want to see and have the code written for you. It runs on
 * your machine and nowhere else: `apply: 'serve'` means this middleware exists
 * only under `npm run dev` and is not in the built bundle at all. There is no
 * hosted endpoint, nothing is paid for per request, and no key ever reaches a
 * browser — the model is reached from here, in Node, using values from
 * `.env.local`, which git ignores.
 *
 * The default target is anything speaking the OpenAI chat-completions shape,
 * because Ollama, LM Studio, llama.cpp's server and vLLM all do. That makes a
 * self-hosted open model the ordinary path rather than the fallback. Setting
 * `AI_PROVIDER=anthropic` uses your own key through the official SDK instead.
 *
 * `docs/extensions.md` is the system prompt. It is read fresh on every request,
 * so improving the documentation improves the generator — one description of
 * the contract, serving both the person and the model.
 */
function localAssistant(env) {
  const endpoint = env.AI_ENDPOINT || 'http://localhost:11434/v1/chat/completions';
  const provider = (env.AI_PROVIDER || 'openai').toLowerCase();
  const model = env.AI_MODEL || (provider === 'anthropic' ? 'claude-opus-5' : 'qwen2.5-coder:14b');
  const key = env.AI_KEY || '';

  const read = (req) => new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 200_000) reject(new Error('too much'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

  const send = (res, code, obj) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  /** The contract, plus how to answer. */
  function systemPrompt() {
    let contract = '';
    try {
      contract = readFileSync('docs/extensions.md', 'utf8');
    } catch {
      contract = 'Return a single JavaScript object literal with meta and build(p, t).';
    }
    return `You write small geometry generators for a three.js art piece.

${contract}

Answer with the object literal and nothing else. No prose, no explanation, and
no markdown fence. It must start with { and end with }. Prefer something that
moves with t and has two or three parameters worth turning.`;
  }

  /** Models like to wrap code in fences and preamble whatever they are told. */
  function extract(text) {
    let out = String(text || '').trim();
    const fence = out.match(/```(?:js|javascript)?\s*([\s\S]*?)```/);
    if (fence) out = fence[1].trim();
    const first = out.indexOf('{');
    const last = out.lastIndexOf('}');
    if (first >= 0 && last > first) out = out.slice(first, last + 1);
    return out.trim();
  }

  async function callOpenAICompatible(messages) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ model, messages, temperature: 0.7, stream: false }),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async function callAnthropic(messages) {
    let Anthropic;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch {
      throw new Error('AI_PROVIDER=anthropic needs the SDK: npm i -D @anthropic-ai/sdk');
    }
    const client = new Anthropic({ apiKey: key || undefined });
    const [system, ...rest] = messages;
    const reply = await client.messages.create({
      model,
      max_tokens: 16000,
      // The contract is long, fixed and sent on every request — exactly what
      // caching is for.
      system: [{ type: 'text', text: system.content, cache_control: { type: 'ephemeral' } }],
      thinking: { type: 'adaptive' },
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    });
    return reply.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  return {
    name: 'local-assistant',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/ai/health', async (req, res) => {
        // Actually check something is there. Reporting healthy because the
        // route exists would put a button on screen that fails when pressed,
        // which is worse than no button.
        let reachable = provider === 'anthropic' ? Boolean(key) : false;
        if (provider !== 'anthropic') {
          try {
            const models = endpoint.replace(/\/chat\/completions\/?$/, '/models');
            const probe = await fetch(models, { signal: AbortSignal.timeout(1500) });
            reachable = probe.ok;
          } catch {
            reachable = false;
          }
        }
        send(res, 200, {
          ok: reachable,
          provider,
          model,
          endpoint: provider === 'anthropic' ? 'anthropic' : endpoint,
          why: reachable ? '' : (provider === 'anthropic' ? 'no AI_KEY set' : `nothing answering at ${endpoint}`),
        });
      });

      server.middlewares.use('/api/ai/write', async (req, res) => {
        if (req.method !== 'POST') { send(res, 405, { error: 'post only' }); return; }
        try {
          const { want, previous, error } = JSON.parse(await read(req) || '{}');
          if (!want) { send(res, 400, { error: 'say what you want to see' }); return; }

          const messages = [{ role: 'system', content: systemPrompt() }];
          messages.push({ role: 'user', content: `Write an extension: ${want}` });
          if (previous && error) {
            // The repair round. The exact message from the sandbox is worth far
            // more than a paraphrase — it names the rule that was broken.
            messages.push({ role: 'assistant', content: previous });
            messages.push({
              role: 'user',
              content: `That failed with: ${error}\n\nFix it and return the whole object literal again, nothing else.`,
            });
          }

          const text = provider === 'anthropic'
            ? await callAnthropic(messages)
            : await callOpenAICompatible(messages);
          const code = extract(text);
          if (!code.startsWith('{')) { send(res, 502, { error: 'the model did not return an object literal' }); return; }
          send(res, 200, { code, model });
        } catch (err) {
          send(res, 502, { error: String(err.message || err) });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Everything, not just VITE_ — these never reach the client.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    // three/webgpu, three/tsl and the addons must resolve to one module instance,
    // or the node system ends up with two registries and materials fail to build.
    resolve: { dedupe: ['three'] },
    plugins: [localAssistant(env)],
    server: {
      host: true,
      // Honour an assigned PORT when one is supplied, so a second instance can be
      // launched alongside a dev server already holding the default.
      port: Number(process.env.PORT) || 5180,
    },
    build: { target: 'es2022' },
  };
});
