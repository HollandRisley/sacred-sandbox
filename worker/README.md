# The public assistant

The same thing the dev server does, on Cloudflare's edge, so the deployed site
can offer it too. It runs an open model through **Workers AI** — no second
vendor, no key to hold, and at this size of request a cost measured in fractions
of a penny.

## Deploying

```bash
cd worker
npx wrangler kv namespace create QUOTA
```

Paste the id it prints into `wrangler.toml` under `[[kv_namespaces]]` and
uncomment that block. Then a secret for the address hashing, and deploy:

```bash
npx wrangler secret put QUOTA_SALT
npx wrangler deploy
```

If the site is served from a different origin to the Worker, set
`ALLOWED_ORIGINS` in `wrangler.toml` to the site's origin. Served from the same
origin — Cloudflare Pages with this Worker on `/api/*` — leave it empty and no
CORS is involved at all, which is the arrangement to prefer.

## What it costs

The free allowance is 10,000 Neurons a day. One generation of this size is
roughly 3,500 tokens in and 1,000 out; on a small model that is about 47
Neurons, so **a couple of hundred generations a day cost nothing**. Beyond the
allowance it is $0.011 per 1,000 Neurons — about **$0.0005 a generation**, or
50p for a thousand. A larger model costs several times that and still lands
under a penny each.

Check the current rates rather than trusting these: <https://developers.cloudflare.com/workers-ai/platform/pricing/>

## Not being ruined by it

Cheap per request is not the same as safe when hammered.

- **A daily quota per visitor**, counted against a *hashed* address. The Worker
  needs to count requests, not to know who made them, and a hashed key cannot be
  read back into an address by anyone who sees the store. It rolls at UTC
  midnight by construction and expires on its own — there is no cleanup job.
- **Caps** on the description (400 characters), on code sent for repair (8,000),
  and on what comes back (1,400 tokens).
- **A kill switch** in KV, so it can be turned off in seconds without a deploy:

```bash
npx wrangler kv key put --binding QUOTA killswitch 1
```

and to turn it back on:

```bash
npx wrangler kv key delete --binding QUOTA killswitch
```

## Changing the model

`AI_MODEL` in `wrangler.toml`. The default is a coder model; the list moves, so
check the current ids at <https://developers.cloudflare.com/workers-ai/models/>.
Some models need a paid plan.

## The client needs no changes

The browser calls `api/ai/write` as a **relative** path. Served from the same
origin as the site, this Worker answers it and everything works unchanged —
which is the reason to prefer Pages over a separate Worker domain.

`docs/extensions.md` is the system prompt, imported as text at build time, so
there is one description of the contract serving the reader, the dev server and
this.
