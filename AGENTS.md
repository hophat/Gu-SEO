# pages-seo · agent guidance

Self-hosted programmatic-SEO + daily-AI-blog toolkit for Cloudflare
Pages. Workers AI by default; 8 cloud providers as fallback. D1 for
storage, R2 for images. Source:
<https://github.com/Benjamin-Bloch/pages-seo>.

This file is loaded automatically by code-agent tools (ChatGPT Codex
reads `AGENTS.md`; Claude Code reads `CLAUDE.md` — they're linked).
Treat it as the canonical operating manual for any change in this
repo.

---

## What lives where

| Path | Role |
|---|---|
| `functions/api/**.js` | Cloudflare Pages Functions (HTTP routes) |
| `functions/_lib/**.js` | Shared helpers — auth, util, settings, schema, dedup, etc. |
| `functions/_lib/cover_spec.js` | The cover policy in one place: what counts as a paintable template (`isRenderableSpec`), the canvas size, spec normalisation and the branded starter card (`fallbackCoverSpec`). Server callers import it; the browser clients receive it from `/api/admin/cover/templates` (each row carries `renderable` + a normalised `spec`, the payload carries `starter_spec`). |
| `public/**` | Static assets (HTML, CSS, JS for /admin, /docs, and the 404) |
| `schema/init.sql` | Authoritative D1 schema. **Must stay additive.** |
| `functions/_lib/schema.js` | Bundled output of `schema/init.sql`. Regenerate with `node scripts/bundle-schema.js`. Never edit by hand. |
| `functions/[project]/**` | Per-project public routes on a shared host (`/<slug>/blog`, `/<slug>/p/<slug>`, `/<slug>/feed.xml`, `/<slug>/sitemap.xml`). Thin wrappers that delegate to the root renderers with `projectSlug` + `basePath`. |
| `cron-worker/` | Separate Cloudflare Worker (`gulagi-cron-worker`) that POSTs one call per schedule to `/api/admin/cron/tick`, which fans the task out across every active project |
| `deploy.sh` | The only deploy path: Pages + cron-worker, no-ops under Workers Builds. `npm run deploy` calls it. |
| `wrangler.template.toml` | Template shipped in the repo for a fresh setup. `wrangler.toml` is **checked in on purpose** with this deployment's real D1/R2 ids; maintainers keep a different machine's ids in the gitignored `wrangler.live.toml`. |

## Hard rules — never violate

- ❌ Do not commit secrets into `wrangler.toml`. The file is tracked, but
  only with ids for this deployment. Anything from `.dev.vars` or a live
  token stays out of git.
- ❌ Do not delete a D1 database in any script or instruction. D1
  holds every post ever generated.
- ❌ Do not weaken `adminGate` in `functions/_lib/auth.js`. Every
  admin endpoint must call it before doing anything.
- ❌ Do not `console.log` anything containing the admin password or
  `Bearer` tokens.
- ❌ Do not edit `functions/_lib/schema.js` directly. Edit
  `schema/init.sql` and re-bundle.
- ❌ Do not introduce destructive schema migrations (DROP TABLE,
  DROP COLUMN, NOT NULL on populated columns). Use
  `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN`.
- ❌ Do not add a `try/catch` that swallows the error silently. If
  you must catch, either fix the upstream cause or rethrow with
  more context.

## Style + conventions

- ESM only. Cloudflare Pages Functions are `.js` files with
  `export const onRequestGet`, `onRequestPost`, etc.
- Error responses go through `json(status, body)` in
  `functions/_lib/util.js`. The helper scrubs raw `Error` objects
  via a JSON.stringify replacer — never embed a raw Error.
- Cache headers: personalised content → `cache-control: no-store`.
  Public content → `public, max-age=<short>, s-maxage=<longer>, stale-while-revalidate=…`.
- IDs are 32-char hex (`newId()` in util.js). Don't introduce UUIDs.
- Use `audit(env, actor, action, targetId, details)` from util.js
  for any admin write. Fire-and-forget (don't await).
- Cover policy — "can this template paint anything?" and the branded
  card used when it can't — lives only in
  `functions/_lib/cover_spec.js`. Server code imports it; the React
  Covers page and the unbundled `public/cover-editor.js` (no bundler,
  so it cannot import) read the same rule and card from the templates
  API payload. Never paste the card or the rule into a client.

## Common change patterns

### Adding a new admin endpoint
1. Create `functions/api/admin/<name>.js`.
2. Start with `const gate = await adminGate(env, request); if (gate) return gate;`.
3. Validate input. Return via `json()`.
4. Log via `audit()` if it mutates anything.

### Adding a project served under /<slug>/
Projects on a shared host are addressed as `https://<host>/<slug>/…`. To
wire one up:
1. Set `projects.publishing_url` to the full public base, e.g.
   `https://seo.gulagi.com/<slug>`; set `site_name` / `site_description`
   / `logo_url` for public branding.
2. The root renderers accept `projectSlug` + `basePath`; add a thin
   wrapper under `functions/[project]/` that resolves the slug and
   delegates. Wrapper import depth is `../../<file>.js` from
   `[project]/` and `[project]/<dir>/`.
3. Verify with `npm run build:functions` — a wrong relative import in a
   wrapper only fails at deploy time otherwise.

### Adding a schema column
1. Edit `schema/init.sql` with `ALTER TABLE … ADD COLUMN <name> <type> DEFAULT …`.
   (Cloudflare D1 SQLite supports this since 2024.)
2. Run `node scripts/bundle-schema.js` to regenerate
   `functions/_lib/schema.js`.
3. Commit both files.
4. The next `/api/setup` call (or a fresh install on another account) applies it idempotently.

### Adding an AI provider
1. New module at `functions/_lib/providers/<name>.js` exporting
   `{ id, label, env_required, generate(prompt, opts) }`.
2. Register in the provider index.
3. Add `<name>_API_KEY` to the secrets a fresh setup asks for
   (optional — providers without keys are skipped).

## Release flow

1. Bump `package.json` version.
2. Update `CHANGELOG.md` (sections: Added / Fixed / Changed).
3. Commit with message `feat: v<x.y.z> — <one-line headline>`.
4. Tag: `git tag -a v<x.y.z> -m "<release name>"` and push the tag.
5. Mirror to the upstream `Benjamin-Bloch/pages-seo` repo so
   `/api/version` external pollers see the new tag.
6. Create a GitHub Release on the upstream repo with the changelog
   section as the body.

## Deploying

One path, and it is the only one: `npm run deploy` → `deploy.sh` →
Pages + cron-worker. It reads the project name out of `wrangler.toml`,
so there is nothing to keep in sync by hand, and it no-ops when
`CF_PAGES` is set so wiring it as a Workers Builds command is harmless.

`functions_dist/` is the compiled Functions bundle. Rebuild it with
`npm run build:functions` and commit the result — a stale bundle
deploys routes the source no longer has.

## When you're unsure

- Schema or auth change → ask before editing. Both are load-bearing.
- Upstream API contract change (`/api/version`, `/api/health`) →
  ask. Uptime monitors and embed widgets depend on the shape.
- A "small fix" that requires editing `wrangler.toml` → it doesn't.
  Edit `wrangler.template.toml` instead.
