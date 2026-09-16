# Loop Constraints — Gu-SEO (binding)

Binding rules every loop run must never break. The `loop-constraints` skill
(`skills/loop-constraints/SKILL.md`) reads this file at the start of every run
and enforces each rule below. Comments are allowed; the loop treats every line
under a section as a binding rule. If a rule is ambiguous, the human rewrites
it — the loop never second-guesses.

## Mode

- `mode: report-only` — propose and report only. Never edit source, never label/close/comment on issues. (Default. Week 1.)
- `mode: auto-fix` — one minimal single-file fix per run, inside a git worktree, verifier must APPROVE, human merges. (Week 3+, only after 10 stable report-only runs.)
- `loop-pause-all` — when present anywhere in this file or `STATE.md`, the loop exits immediately without acting.

mode: report-only

## Paths (never touch without human approval)

- Never modify `schema/init.sql` — D1 holds every post ever generated.
- Never modify `functions/_lib/schema.js` by hand — regenerate via `node scripts/bundle-schema.js`.
- Never modify `functions/_lib/auth.js` (weakening `adminGate` breaks every admin endpoint).
- Never commit `wrangler.toml` (real account ids, gitignored) — edit `wrangler.template.toml` instead.
- Never touch `.env`, `.env.local`, `node_modules/`, `package.json` (dependency bumps go through the dependency-updater pattern as a PR).
- Schema changes are additive only: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`. No DROP, no NOT NULL on populated columns.

## Code

- ESM only. Admin endpoints start with `adminGate`, errors via `json()` from `functions/_lib/util.js`, never raw `Error`.
- Mutating admin writes call `audit()` fire-and-forget (don't await).
- Never `console.log` passwords, magic-link URLs, or `Bearer` tokens.
- Never add a `try/catch` that swallows errors silently — fix upstream or rethrow with context.
- IDs are 32-char hex via `newId()` — no UUIDs.
- One fix per run. Minimal diff. Run `npm test` + `npm run build:functions` as evidence.

## Push & Merge

- Never push without telling the human first. Always run tests first.
- Never auto-merge to main. Draft PR + explicit human review, especially on denylisted paths.
- Never deploy to production (`wrangler pages deploy`, `wrangler deploy`) without human approval.
- Never delete a D1 database, never roll back production without human approval.
- Escalate after 3 failed fix attempts; escalate auth/security/payments-adjacent items immediately.

## Budget (from loop-budget.md)

- Daily token cap 100,000, per-loop 10,000, cost hard stop $50/day (alert $40/day).
- On cap breach: stop acting, log to `loop-run-log.md`, set `loop-pause-all` in `STATE.md`.
