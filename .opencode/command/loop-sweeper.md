---
description: Run the CI sweeper loop — monitor CI status and fix failures fast.
agent: build
---

Run the CI Sweeper loop per `patterns/ci-sweeper/SKILL.md`.

Scope: $ARGUMENTS (default: latest CI runs on main and open PRs).

Steps:
1. Read `patterns/ci-sweeper/SKILL.md` and follow it exactly.
2. Check Cloudflare Pages build status, GitHub Actions, and `npm run build:functions`.
3. Analyze failures: transient (retry max 3x) vs real regression (minimal fix or escalate).
4. Never roll back or touch the production database without human approval.
5. Summarize: CI statuses, root causes, fixes applied, escalations.
