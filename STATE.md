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
| 2026-09-16 18:05:00 UTC | manual-feature (ad-hoc, user-requested) | success + deployed (2fb90cc) | Calendar "Tạo bài ngay": per-slot button (scheduled/draft only) in drawer runs blog chain start(calendar_slot_id)→text→image→publish with progress modal. Backend reused as-is (start claims slot, publish marks published). Files: src/admin/pages/Calendar.jsx (+rel=noopener fix). Gate ✅. Pushed main, deployed https://d78cf961.gu-seo.pages.dev. |
| 2026-09-16 18:15:00 UTC | manual-fix (ad-hoc, user-requested) | success + deployed (25f4ed1) | Move "Bài đăng mạng xã hội" menu item from Phân phối group to Bài viết group (src/admin/App.jsx, pre-existing local change). Gate ✅. Pushed main, deployed https://81f6ab34.gu-seo.pages.dev. Still uncommitted (do-not-commit): wrangler.toml name. |
| 2026-09-17 09:30:00 UTC | manual-fix (ad-hoc, user-requested) | success + deployed (95b7fe6, 7c65575) | Custom-domain approval 502 root-caused: `CF_API_TOKEN` was valid but missing `Cloudflare Pages: Edit` → 403 code 10000 on `pages/{project}/domains`. Deleted 4 empty secrets that caused the earlier misdiagnoses (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`), filled `CF_D1_ID` + `CF_R2_NAME`, reverted the dead global-key fallback in `cloudflare_domains.js`, added an attach-failure log (hostname + CF error, no secrets) in `domains/requests.js`. Approved `blogs.gurouter.com` via wrangler OAuth attach + D1 flip + `audit_log` row, verified live; token later granted `Pages: Edit` and approve returned 200 (`cf_status: initializing`). Temp diagnostic `cf-check.js` added then removed. Gate ✅. |
| 2026-09-17 15:00:00 UTC | manual-feature (ad-hoc, user-requested) | success + deployed (1f70cec) | Brand language selector controls AI output language. `projects.language` is the single source of truth: `brand-dna` GET returns it and PUT validates against a 20-code allowlist (the field lands in the prompt, so free text was a prompt-injection vector); `ai.js` resolves it per `projectId` inside `generateContent`, so blog/programmatic/refresh all obey it, and `preview-sample` was missing `projectId` so previews now match too. UI select in `Brand.jsx`. E2E: `language=en` → 2694-word English preview with 0 Vietnamese diacritics; injection attempt → 400. Gate ✅. Pushed main, deployed https://b4079176.gu-seo.pages.dev. |

## Next actions

- [ ] First `loop-triage` run to baseline open issues/PRs
- [ ] Verify cron/CI hooks for `ci-sweeper` (15m) and `pr-babysitter` (30m)
- [ ] Weekly cost report check per `loop-budget.md`
