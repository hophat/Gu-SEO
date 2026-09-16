# Loop State — Gu-SEO

Tracker for loop engineering runs. Updated by each loop invocation.
Budget and cadence: see `LOOP.md` + `loop-budget.md`. Safety: see `gate.yaml`.

## Active patterns

| Pattern | Cadence | Risk | Readiness | Status |
|---|---|---|---|---|
| daily-triage | 1d (09:00 UTC) | low | L1 | active |
| pr-babysitter | 30m (business hours) | medium | L2 | active |
| ci-sweeper | 15m | high | L2 | active |
| dependency-updater | 1d | medium | L1 | active |
| code-reviewer | on_demand | low | L2 | active |
| test-runner | on_demand | low | L1 | active |
| documentation-sync | 1d | low | L1 | active |

## Budget (from loop-budget.md)

- Daily token cap: 100,000 — monthly: 3,000,000 — per-loop: 10,000
- Kill switch: enabled (daily cap exceeded / 5 consecutive failed loops / provider rate limits). Auto-recovery: disabled, manual intervention required.
- Cost: $50/day hard stop, alert at $40/day. Alert at 80% of daily tokens. Weekly cost reports.

## Gate summary (from gate.yaml)

Denied paths: `schema/init.sql`, `functions/_lib/schema.js`, `functions/_lib/auth.js`, `wrangler.toml`, `.env`, `.env.local`, `package.json`, `node_modules/`.
Human approval required for: database changes, auth changes, production deploys. Auto-merge: disabled.

## Run log

Format: `[YYYY-MM-DD HH:MM:SS UTC] {pattern-name} - {status} - {details}`
(Full history: `loop-run-log.md`.)

| Timestamp (UTC) | Pattern | Status | Details |
|---|---|---|---|
| — | — | — | No runs yet since OpenCode setup |

## Next actions

- [ ] First `loop-triage` run to baseline open issues/PRs
- [ ] Verify cron/CI hooks for `ci-sweeper` (15m) and `pr-babysitter` (30m)
- [ ] Weekly cost report check per `loop-budget.md`
