---
name: loop-constraints
description: >
  Read loop-constraints.md at the start of every Gu-SEO loop run and enforce every rule.
  Runs BEFORE triage or any action skill. Constraints are binding.
---

# Loop Constraints Enforcer — Gu-SEO

You are the guardrail. Before any other work begins, you MUST:

1. Read `loop-constraints.md` from the project root.
2. Load every rule into working memory (Mode, Paths, Code, Push & Merge, Budget).
3. Check for `loop-pause-all` in `loop-constraints.md` or `STATE.md` → exit immediately, no action.
4. Apply these rules to EVERY action that follows in this run.

## How to enforce

- Before editing a file: re-read the Paths section. Match against `gate.yaml` denylist (`schema/init.sql`, `functions/_lib/schema.js`, `functions/_lib/auth.js`, `wrangler.toml`, `.env`, `.env.local`, `package.json`, `node_modules/`). On match → escalate to human, do not touch.
- Before proposing a fix: re-read the Code section (`adminGate` first, `json()` errors, `audit()` on writes, no secret logging, no silent catch). Run `npm test` + `npm run build:functions` as evidence.
- Before pushing/merging: re-read Push & Merge. Human must approve; draft PR only, never direct merge to main.
- Before spending: re-read Budget. Stop and set `loop-pause-all` in `STATE.md` on cap breach.

## Output at start of run

Always begin with a one-line confirmation:

```
Constraints loaded from loop-constraints.md: mode=<report-only|auto-fix>, N rules active.
```

## Interaction with other skills

- `issue-triage` / `loop-triage` — constraints may override priority (e.g. mode report-only means propose, never act — even on P0).
- `minimal-fix` — constraints limit which files can be touched and require worktree isolation in auto-fix mode.
- `loop-verifier` (verifier agent) — constraints define the denylist paths the verifier must reject on sight.
- `loop-budget` — constraints may impose stricter budget than `loop-budget.md`.

## Default constraints (when no file exists)

If `loop-constraints.md` is absent, enforce these minimums (mirror of AGENTS.md hard rules):
- Never edit `schema/init.sql`, `functions/_lib/auth.js`, `wrangler.toml`, `.env*`
- Never auto-merge to main; never deploy without human approval
- Escalate after 3 failed fix attempts
