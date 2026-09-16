# Loop State — Gu-SEO

Tracker for loop engineering runs. Updated by each loop invocation.
Budget and cadence: see `LOOP.md` + `loop-budget.md`. Safety: see `gate.yaml`.
Binding rules: `loop-constraints.md` (loaded before every run).
Mode: `report-only` (L1, propose only) — flip to `mode: auto-fix` in `loop-constraints.md` after 10 stable runs to enable L2. `loop-pause-all` here stops all loops.

## Active patterns

| Pattern | Cadence | Risk | Readiness | Status |
|---|---|---|---|---|
| issue-triage | 2h–1d (`scripts/loop-run.sh issue-triage`) | low | L1 | active — reads/writes `issue-triage-state.md` |
| daily-triage | 1d (09:00 UTC) | low | L1 | active — merges issue-triage Top 5 into High Priority |
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
| 2026-09-16 17:54:00 UTC | manual-fix (ad-hoc, user-requested) | success + deployed | Brand admin fix e783b26: theme-color/logo UI added to Brand.jsx, save strips logo_url (fixes logo_url_is_server_assigned), voice_tone/target_audience mapping. Gate ✅. Pushed main, deployed https://51e130b6.gu-seo.pages.dev. Left uncommitted (not mine): App.jsx menu move, wrangler.toml name. |

## Next actions

- [ ] First `loop-triage` run to baseline open issues/PRs
- [ ] Verify cron/CI hooks for `ci-sweeper` (15m) and `pr-babysitter` (30m)
- [ ] Weekly cost report check per `loop-budget.md`
