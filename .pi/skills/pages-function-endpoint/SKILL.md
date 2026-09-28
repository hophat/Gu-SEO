---
name: pages-function-endpoint
description: "How to add, edit, or debug a Cloudflare Pages Function in pages-seo. Covers the three admin auth gate shapes, json()/audit()/newId() contracts, cache-header policy, tenant/project scoping, [project] wrapper rules, and the deploy-time import failure that only build:functions catches. Use whenever the task names functions/, an API route, an admin endpoint, a public renderer, a sitemap or feed route, a 401/503 from an admin call, or functions_dist build errors."
---

# Pages Function route — the contract

A Pages Function is not a generic handler. The repo has three gate shapes, one response helper,
and one audit contract; getting any of them wrong is a security or correctness bug, not a style
nit. This file is the procedure. `functions/_lib/` is the executable source of truth — when this
file and the code disagree, the code wins and this file is wrong.

## 1. Pick the auth gate by intent

`functions/_lib/auth.js` exports three. Choose deliberately; do not substitute one for another
to make a request pass.

| Intent | Shape |
|---|---|
| Admin route that does not read or write project data | `const gate = await adminGate(env, request); if (gate) return gate;` |
| Any route reading/writing project-scoped rows (posts, topics, projects, links, embeds, covers, calendar) | `const auth = await requireAdminAsync(env, request); if (!auth) return json(401, {error:'unauthorized'}); const tenant = await resolveTenantContext(env, request, auth);` |
| User management / role boundaries only | `requireSuperAdmin(env, request)` — a tenant admin could otherwise mint accounts for projects it was never granted |

`adminGate` also returns **503** when required config is missing (`missingConfig`). A 503 is a
correct, intentional response — do not "fix" it by relaxing the gate.

The gate is the **first** thing the handler does, before parsing a body or touching `env.DB`.
A bearer token and a session cookie are both accepted by `requireAdminAsync`; `auth.via` tells you
which. Super-admin detection is `auth.via === 'bearer' || auth.role === 'super_admin'`.

## 2. Respond only through `json()`

```js
import { json } from '../../_lib/util.js';
return json(200, { ok: true, data });
return json(400, { error: 'slug_required' });
return json(401, { error: 'unauthorized' });
return json(503, { configError: ['ADMIN_TOKEN'] });
```

`json()` installs a `JSON.stringify` replacer that scrubs raw `Error` objects. Returning a
hand-built `new Response(JSON.stringify({ error: e }))` bypasses that scrub and can leak a stack
into an API response. Personalised responses should carry `cache-control: no-store` (pass it as
the third argument, or set it in the `json()` call site per the file's neighbours).

Machine-readable error codes (`'slug_required'`, not `'bad request'`) are the convention — the
admin client branches on them.

## 3. Audit every admin write

```js
import { audit } from '../../_lib/util.js';
await env.DB.prepare('UPDATE …').bind(…).run();
audit(env, actor, 'blog.publish', postId, { slug });   // no await
```

Fire and forget on purpose: the write already succeeded, and a failed audit row must not turn a
successful publish into a 500. `actor` is whatever the auth context exposes; `action` is
`domain.verb`; `details` is small JSON. Never pass the password, a token, or a full post body.

## 4. Identifiers and errors

- `newId()` from `_lib/util.js` — 32-char hex. Never `crypto.randomUUID()`.
- Never `try { … } catch {}`. If you must catch to add context, rethrow or convert to a
  `json(5xx, …)` with a real code. A silent catch hides the upstream cause until production.
- Never `console.log(env)` or log a `Bearer` header — both dump secrets.

## 5. Project scoping on a shared host

Public routes come in two shapes:

- **Root renderers** (`functions/blog/**`, `functions/hubs/**`, `functions/docs/**`) accept
  `projectSlug` + `basePath` from the caller.
- **Wrappers** (`functions/[project]/**`) resolve the slug from the path segment and delegate to
  a root renderer with those two values. A wrapper is thin: no business logic, no duplicated
  markup.

Project data isolation comes from `projects.publishing_url` (full public base, e.g.
`https://seo.gulagi.com/<slug>`), `site_name`, `site_description`, `logo_url`.

**Import depth is the trap:** from `functions/[project]/x.js` it is `../../_lib/y.js`-style two
levels; from `functions/[project]/blog/page/x.js` it is three. A wrong depth resolves fine
locally against the source tree and only fails during `wrangler pages functions build` — so run:

```bash
npm run build:functions
```

after any wrapper change. The repo's own guidance: a wrong relative import "only fails at deploy
time otherwise".

## 6. Cache headers

| Content | Header |
|---|---|
| Anything personalised (admin, tenant-scoped, per-user) | `cache-control: no-store` |
| Public pages, feeds, sitemaps | `public, max-age=<short>, s-maxage=<longer>, stale-while-revalidate=…` — or the `edgeCached(request, waitUntil, build, sMaxAge)` helper in `_lib/util.js` |

Default to `no-store` when unsure. A cached personalised response leaks one tenant's data to
another.

## 7. Verify

```bash
node scripts/run-tests.js          # fast, offline
npm run build:functions            # after adding a route or editing a [project] wrapper
```

Report which you ran. Do not run `npm run deploy` — that is user-gated.

## Checklist

- [ ] Gate is the first statement, and the shape matches the intent
- [ ] Every response goes through `json()`, errors carry stable codes
- [ ] Admin write calls `audit()` un-awaited
- [ ] IDs from `newId()`; no silent catch; no secret logging
- [ ] Cache header matches the content's personal/public nature
- [ ] New public route reachable from sitemap/internal links, or intentionally excluded
- [ ] `npm run build:functions` green if `functions/` changed
