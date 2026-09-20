---
name: issue-triage
description: >
  Scan Gu-SEO open GitHub issues and PRs. Classify bug/feature/task, dedupe, score P0-P3,
  propose labels. Updates issue-triage-state.md. L1 propose-only — never auto-label, close, or comment.
---

# Issue Triage Skill — Gu-SEO

You are the backlog health agent. Your job: keep the queue legible so the daily
loop and humans always know the top five actionable items — bugs, features, and
tasks alike. Constraints (`skills/loop-constraints/SKILL.md`) run BEFORE this skill.

## Inputs

- Open GitHub issues and PRs: `gh issue list --state open --limit 50`, `gh pr list --state open --limit 30` (repo: `Benjamin-Bloch/pages-seo` + this fork). Fall back to `loop-run-log.md` context if `gh` is unavailable.
- `issue-triage-state.md` from the previous run (diff against it for "new since last run").
- Signals: age, author, labels, comments, reactions, linked PRs; Cloudflare Pages deploy status for bug reports.

## Output — update `issue-triage-state.md`

```markdown
# Issue Triage State
Last run: <ISO timestamp UTC>
Open actionable: N (was M)
New since last run: K
Needs human: H

## Top 5 (by loop score)
- #NNN (bug, p1, 2d old) — "one-line summary" — suggested: bug, needs-repro, area:blog

## Proposed Labels (not applied in L1)
- #NNN: `bug`, `needs-repro`

## Possible Duplicates (human confirm)
- #NNN — possible duplicate of #MMM

## Noise / Ignored
- brief list
```

## Classification (Gu-SEO areas)

| Type | Meaning | Area labels |
|---|---|---|
| bug | Broken behavior, build/CI failure, deploy breakage | `area:blog`, `area:prog`, `area:admin`, `area:installer`, `area:cron`, `area:infra` |
| feature | New capability, provider, endpoint, UI | same areas + `enhancement` |
| task | Chore, docs, deps, cleanup | `chore`, `docs` |

## Scoring (P0–P3)

| Priority | Signals |
|----------|---------|
| P0 | Security, prod breakage, data loss (D1/R2), auth bypass |
| P1 | High impact + clear repro or deploy blocked |
| P2 | Valid feature/bug, not urgent |
| P3 | Nice-to-have, docs, polish |
| needs-info | Unclear spec, missing repro or environment |
| duplicate? | Title/body overlap — conservative, human confirms |

## Classify and score with Jev

One call per issue replaces deliberating over type, area, priority and duplicates
(`scripts/jev.js`, see `JEV.md`). The rubric lives in `jev-questions.json` so it
stays identical between runs:

```bash
{ gh issue view <N> --json number,title,body,labels,createdAt,comments;
  printf '\nOPEN ITEMS:\n'; gh issue list --state open --limit 30 --json number,title,labels \
    --jq '.[] | "#\(.number) (\(.labels|map(.name)|join(","))) — \(.title)"';
} | node scripts/jev.js ask --state - --min-confidence 0.6 \
    --questions "$(cat skills/issue-triage/jev-questions.json)"
```

Read the answer with the gate:

- `type`, `area`, `priority`, `duplicate` — settle the classification when their
  `act` is true (confidence ≥ 0.6). Use the answer's `choice` / `score` directly
  in the state file instead of re-deciding it yourself.
- `priority` not settled → put the issue in "needs human" and quote the score and
  confidence; do not pick P1 vs P2 by hand.
- `escalate` ≥ 0.5 → needs human (auth/schema/prod-deploy/security path).
- `needs_info` ≥ 0.5 → suggest `needs-info`.
- `duplicate` ≥ 0.5 → "possible duplicate of #NNN (human confirm)", never auto-close.
- Always record the confidence next to the priority. A P1 with 0.5 confidence is a
  question for the human, not a decision.

This changes nothing about L1: labels stay proposals, and no comment, close, or
edit happens.

## Rules

- **L1 (mode report-only):** Propose labels and priority only. Never apply labels, comment, close, or edit code.
- Escalate to "needs human": `schema/init.sql`, `functions/_lib/auth.js`, `wrangler.toml`, production deploys, security, public API contract (`/api/version`, `/api/health`).
- Duplicate matching: conservative — "possible duplicate of #NNN", never auto-close.
- Prune closed issues from state each run. Be concise — this may run every 2h.
- Never duplicate full issue bodies into `STATE.md` — reference numbers only.

## Allowlisted labels (auto-fix mode only, after verifier)

`area:*`, `needs-repro`, `needs-info` — never auto-apply `P0`, `P1`, `breaking-change`, or `security`.

## Pairing with Daily Triage

Daily Triage (`loop-triage`) reads `issue-triage-state.md` and merges the Top 5
into `STATE.md` High Priority. This skill never writes to `STATE.md` directly.
