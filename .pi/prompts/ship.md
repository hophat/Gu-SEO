---
description: "pages-seo release workflow — run the full ship gate (tests, checks, rebuilds of functions_dist / public/admin-dist / schema bundles), verify secrets are not staged, prepare the version bump and CHANGELOG, and stop for explicit user approval before any commit, tag, or deploy. Use for 'ship it', 'release', 'deploy', 'cut a version', 'is this ready', 'CI is red', 'tests failing', 'functions_dist is stale'."
argument-hint: "<optional: what is being released>"
---

Run the pages-seo release gate for: **$@** (or the current working tree if no argument).

Use the `subagent` tool with **`agentScope: "both"`**.

## Phase 0: read before you touch anything

1. `AGENTS.md` — the hard rules are binding and they outrank anything in this prompt.
2. `git status` and `git diff --stat` — what is actually uncommitted? The release scope is that
   set, not what the user remembers.
3. Previous `_workspace/` release report, if one exists — re-verify only the gates whose inputs
   changed.

## Phase 1: gate (`release-engineer`, single)

```json
{ "agent": "release-engineer",
  "task": "Load /skill:ship-gate. Run the release gate for the current working tree. npm test; then npm run check-jsx, npm run check:contrast, npm run check-public. Rebuild what is owed: npm run build:functions if functions/ changed, npm run admin:build if src/admin/ changed, npm run bundle-schema if the schema changed. Confirm the generated bundles (functions/_lib/schema.js, migrations_bundle.js) contain generated content only. Inspect the staged/unstaged diff for secrets. Report every gate verbatim, pass or fail. Do NOT commit, tag, push, or deploy. Return the standard HANDOFF block." }
```

If a gate fails, stop here and report the real output. **Do not** edit a check script, a test, or a
threshold to make it pass — a check that cannot fail is not a gate. If the check itself is wrong,
say so and let the user decide.

## Phase 2: schema drift (approval-gated)

If the diff touches `schema/init.sql`, `functions/_lib/migrations.js`, or any query selecting a
new column:

```json
{ "agent": "schema-migrator",
  "task": "Load /skill:d1-schema-change. Re-derive the expected schema from init.sql plus migrations and report what should be in a fresh install. Confirm the bundle is in sync. Then ASK BEFORE running node --no-warnings scripts/check-schema-drift.mjs — it queries the remote D1 (read-only SELECTs) and needs explicit approval. Do NOT run npm run db:migrate. Return the standard HANDOFF block." }
```

## Phase 3: prepare the release metadata (only if the user asked to release)

1. Read the current `package.json` version and the top of `CHANGELOG.md`.
2. Propose the next version: **minor** for a feature, **patch** for a fix. Say which, and why.
3. Write the CHANGELOG entry under **Added / Fixed / Changed** — these three headings, no
   alternatives.
4. Update the `package.json` version and the `cloudflare` block's descriptions if the surface
   changed. Do not touch the D1/R2 ids in `wrangler.toml`; they are tracked on purpose, and the
   maintainer-local override is the gitignored `wrangler.live.toml`.

`/api/version` and `/api/health` are public contracts that uptime monitors and embed widgets
depend on. If the diff changes their shape, stop and ask before going further.

## Phase 4: hand the commands to the user — then stop

Present exactly this, in order, and wait for an explicit instruction before running any of it:

```
git add -A
git commit -m "feat: v<X.Y.Z> — <one-line headline>"
git tag -a v<X.Y.Z> -m "<release name>"
git push && git push --tags
npm run deploy          # deploy.sh → Pages + cron-worker
# then: mirror to upstream Benjamin-Bloch/pages-seo so /api/version pollers see the tag
# and create the GitHub Release with the changelog section as the body
```

Say what each command does and what it costs if it is wrong. A held release is a normal outcome;
proceeding without approval is not.

## Phase 5: post-deploy verification (after an approved deploy)

- `/api/version` and `/api/health` respond with their expected shape.
- A public project route renders (`/<slug>/blog`, `/<slug>/p/<slug>`, `/<slug>/feed.xml`,
  `/<slug>/sitemap.xml`).
- `/api/admin/login` still gates.

Report the result. If any check fails, name the failed route and the observed status.

## Error handling

- A gate fails → report verbatim, change nothing, ask.
- Drift check not approved → list it as a pending item with the exact command; do not run it.
- A secret is found staged → stop, name the file and the variable name (never the value), and do
  not proceed to commit.
- Anything that would delete a D1 database is refused outright, with the reason: D1 holds every
  post ever generated and there is no recovery path in this repo.
