---
name: ship-gate
description: "How to verify and release pages-seo — run the full test suite, rebuild the committed functions_dist and public/admin-dist bundles, check schema drift, bump the version, write CHANGELOG.md entries, tag, and deploy through deploy.sh. Use for 'ship it', 'release', 'deploy', 'version bump', 'CI is red', 'tests failing', 'functions_dist is stale', 'is this ready to merge', or before any change that touches functions/, src/admin/, or the schema."
---

# Ship gate

One deploy path exists: `npm run deploy` → `deploy.sh` → Pages + cron-worker. It reads the project
name from `wrangler.toml` and no-ops under Workers Builds, so wiring it as a build command is
harmless. There is no second path; if a change appears to need one, it needs a conversation, not
a workaround.

## Two build artifacts, two different rules

| Artifact | Rebuilt by | Tracked in git? |
|---|---|---|
| `functions_dist/` | `npm run build:functions` | **yes** — a stale bundle **deploys routes the source no longer has** |
| `public/admin-dist/` | `npm run admin:build` | **no** — gitignored; `src/admin/**` is the canonical tracked source |
| `functions/_lib/schema.js`, `migrations_bundle.js` | `npm run bundle-schema` | yes — generated, never hand-edited |

Any change under `functions/` without `npm run build:functions` is a release blocker. A change
under `src/admin/` without `npm run admin:build` leaves local dev running a stale panel — rebuild
it, but do not try to commit it (`git add public/admin-dist` will be refused by design).

## The gate, in order

```bash
npm run check:contrast                     # token contrast
node scripts/run-tests.js                  # core
node --no-warnings scripts/run-platform-tests.js
node --no-warnings scripts/run-admin-hook-tests.mjs
node --no-warnings scripts/run-video-agent-tests.mjs
node --no-warnings scripts/run-loop-tests.mjs
# or all of the above:
npm test

npm run check-jsx                          # JSX imports resolve
npm run check-public                       # no symlinks in public/, no stale mirrors
npm run build:functions                    # → functions_dist
npm run admin:build                        # → public/admin-dist   (if src/ changed)
npm run bundle-schema                      # → schema.js + migrations_bundle.js (if schema changed)
```

`npm run check:drift` → `node --no-warnings scripts/check-schema-drift.mjs` compares live D1
against a fresh install of `schema/init.sql` plus the migrations. It catches the class of bug that
matters most here: a column that exists in production but not in the file, so a fresh install
silently ships a broken schema. **It queries the remote database (read-only `SELECT`s) — get
permission before running it**, and report the command if you do not have it.

## When a gate fails

Report the failing command and its real output. Never edit a check script, a test, or a threshold
to turn a gate green — a check that cannot fail is not a gate. If the check itself is wrong, say
so explicitly and let the user decide.

## What you may not do without an explicit, current instruction

- `npm run deploy`, `deploy.sh`, `wrangler pages deploy`, `wrangler deploy`
- `git commit`, `git tag`, `git push`
- `npm run db:migrate` or any `wrangler d1 execute … --remote` that writes
- any D1 delete — there is no recovery, D1 holds every post ever generated
- mirroring to upstream `Benjamin-Bloch/pages-seo`, or creating a GitHub Release

Prepare the exact command, state what it does, and wait. A held release is a normal outcome.

## Secrets

`wrangler.toml` is tracked **on purpose**, with this deployment's real D1/R2 ids; the
maintainer-local override is the gitignored `wrangler.live.toml`. Do not "fix" that by blanking
the ids. Everything from `.dev.vars` — `ADMIN_TOKEN`, provider API keys, a live Wrangler token —
stays out of git. Before a commit, check the staged diff for values, not just filenames.

## Release sequence

1. Bump `package.json` version — minor for a feature, patch for a fix.
2. `CHANGELOG.md`, with **Added / Fixed / Changed** sections.
3. `git commit -m "feat: v<x.y.z> — <one-line headline>"`
4. `git tag -a v<x.y.z> -m "<release name>"`, then push the tag.
5. Mirror to upstream `Benjamin-Bloch/pages-seo` so `/api/version` external pollers see the tag.
6. GitHub Release on upstream, changelog section as the body.

Steps 3–6 are user-gated: prepare, then ask. `package.json` has a `cloudflare` block with
descriptions surfaced by Deploy to Cloudflare — keep it accurate when the version moves.

## Post-deploy verification

`/api/version` and `/api/health` are public contracts that uptime monitors and embed widgets
depend on. Do not change their shape without asking. After a deploy, confirm both respond and
that a public project route still renders.

## Checklist

- [ ] `npm test` green, or failures reported verbatim
- [ ] `check-jsx`, `check:contrast`, `check-public` green
- [ ] `functions_dist` rebuilt if `functions/` changed
- [ ] `public/admin-dist` rebuilt if `src/admin/` changed (not committed — it is gitignored)
- [ ] `bundle-schema` run if the schema changed; bundles contain generated content only
- [ ] Drift check run with approval, or command reported
- [ ] Staged diff free of secrets
- [ ] Version + CHANGELOG prepared; commit/tag/deploy **awaiting user approval**
