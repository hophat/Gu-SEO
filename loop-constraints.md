# Loop Constraints — Gu-SEO (binding)

Binding rules every loop run must never break. The `loop-constraints` skill
(`skills/loop-constraints/SKILL.md`) reads this file at the start of every run
and enforces each rule below. Comments are allowed; the loop treats every line
under a section as a binding rule. If a rule is ambiguous, the human rewrites
it — the loop never second-guesses.

## Mode

- `mode: report-only` — propose and report only. Never edit source, never label/close/comment on issues. (Default. Week 1.)
- `mode: auto-fix` — one minimal single-file fix per run, inside a git worktree on a `loop/fix-*` branch. The implementer runs `npm test` + `npm run build:functions`; a separate verifier must APPROVE; then the loop fast-forward merges the branch into `main` and logs the run. A REJECT, a failed test/build, or a diff touching a denylisted path escalates to the human instead of merging. (Week 3+, only after 10 stable report-only runs.)
- `autofix --dry-run` — the same pipeline with no merge: implementer + verifier + tests run, the diff prints, the run logs, and the `loop/fix-*` branch/worktree are left for a human. Trial auto-fix with this before trusting the automatic merge.
- `loop-pause-all` — a line BEGINNING with `loop-pause-all` in this file or `STATE.md` makes the loop exit immediately without acting. A prose mention does not arm it (both files document the token inline).

mode: auto-fix

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

## Decisions (Jev)

- A reversible, in-repo decision — classification, priority, dedupe, which of
  several implementation options to take — may be settled by `scripts/jev.js`
  (operating manual: `JEV.md`) without asking the human first.
- Act on that answer only when its confidence clears the threshold (default 0.6)
  and the answer does not escalate. Otherwise list the item under "needs human"
  and say which dimension failed and at what confidence.
- Jev never satisfies the approval requirements above: deploys, D1 writes, schema,
  auth, secrets, merges, deletions, and security/payments items stay human-gated
  however confident the answer is.
- The runner consults Jev itself: `autofix` merges only on `evaluate`'s
  `proceed` (a review/stop escalates and keeps the branch), and both triage paths
  log the rubric's answer with its score and confidence in `loop-run-log.md`.
- An unavailable Jev (no key, no network) is logged as unavailable and does not
  block — it never replaces a gate above it (verifier, tests, denylist).
- Record the score and confidence in the run output. Never cite a Jev answer as
  evidence that something works — run the test, read the file, query D1.

## Push & Merge

- Never push without telling the human first. Always run tests first.
- In `auto-fix`, auto-merge ONLY a `loop/fix-*` branch whose verifier APPROVEd and whose tests + build passed, fast-forward only. Any diff touching a denylisted path (`schema/init.sql`, `functions/_lib/schema.js`, `functions/_lib/auth.js`, `wrangler.toml`, `.env*`, `package.json`) or any REJECT escalates with the branch and diff left in place — never merged.
- Never deploy to production (`wrangler pages deploy`, `wrangler deploy`) without human approval.
- Never delete a D1 database, never roll back production without human approval.
- Escalate after 3 failed fix attempts; escalate auth/security/payments-adjacent items immediately.
- Every run appends one line to `loop-run-log.md` and one row to the Run log table in `STATE.md`: timestamp, pattern, status, and the commit hash + files changed.

## Budget (from loop-budget.md)

- Daily token cap 100,000, per-loop 10,000, cost hard stop $50/day (alert $40/day).
- On cap breach: stop acting, log to `loop-run-log.md`, set `loop-pause-all` in `STATE.md`.
