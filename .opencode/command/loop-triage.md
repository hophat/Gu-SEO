---
description: Run the daily triage loop — review and prioritize open issues and PRs.
agent: build
---

Run the Daily Triage loop per `patterns/daily-triage/SKILL.md`.

Scope: $ARGUMENTS (default: all open issues and PRs).

Steps:
1. Read `patterns/daily-triage/SKILL.md` and follow it exactly.
2. List open GitHub issues and PRs, check Cloudflare Pages deploy status.
3. Prioritize (Critical / High / Medium / Low) and propose assignments.
4. Never modify `schema/init.sql`, `functions/_lib/auth.js`, or `wrangler.toml` — flag them for human review instead.
5. Summarize: triaged items, priorities, blockers, suggested next actions.
