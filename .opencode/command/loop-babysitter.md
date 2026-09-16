---
description: Run the PR babysitter loop — monitor open PRs and shepherd them through review.
agent: build
---

Run the PR Babysitter loop per `patterns/pr-babysitter/SKILL.md`.

Scope: $ARGUMENTS (default: all open PRs).

Steps:
1. Read `patterns/pr-babysitter/SKILL.md` and follow it exactly.
2. List open PRs, check CI status, review comments and stalled PRs.
3. Suggest reviewers based on changed files; validate changes against gate rules.
4. Never auto-merge schema, auth, or `wrangler.toml` changes — request human review.
5. Summarize: PR statuses, actions taken, PRs needing human attention.
