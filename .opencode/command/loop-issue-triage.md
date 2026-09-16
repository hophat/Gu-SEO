---
description: Run issue triage — auto-scan open issues/PRs, classify bug/feature/task, propose top 5.
agent: build
---

Run Issue Triage per `skills/issue-triage/SKILL.md` (constraints from `skills/loop-constraints/SKILL.md` first).

Scope: $ARGUMENTS (default: all open issues and PRs).

Steps:
1. Read `skills/loop-constraints/SKILL.md`, confirm mode. If `loop-pause-all` → stop immediately.
2. Read `skills/issue-triage/SKILL.md` and follow it exactly (L1: propose only — never label, close, comment, or edit code).
3. Update `issue-triage-state.md`: Top 5 (bug/feature/task + P0–P3), proposed labels, possible duplicates, noise.
4. End with a 5-line summary: open actionable count, new items, top priority, needs-human items, next suggested action.
