#!/bin/bash
# Gu-SEO loop runner for cron/systemd (headless, no TUI).
# Adapted from cobusgreyling/loop-engineering examples/opencode.
#
# Usage:
#   scripts/loop-run.sh issue-triage   # L1: scan issues, propose top 5 (default, every 2h)
#   scripts/loop-run.sh triage         # L1: daily triage merge into STATE.md (1d)
#   scripts/loop-run.sh autofix        # L2: ONE minimal fix in a worktree + verifier (requires mode: auto-fix)
#
# Cron examples:
#   0 */2 * * * cd /Users/macbookpro/Gulagi/kd-outsource/Gu-SEO && ./scripts/loop-run.sh issue-triage
#   0 9 * * *   cd /Users/macbookpro/Gulagi/kd-outsource/Gu-SEO && ./scripts/loop-run.sh triage
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-issue-triage}"

pause_check() {
  if grep -q "loop-pause-all" loop-constraints.md STATE.md 2>/dev/null; then
    echo "loop-pause-all active — exiting."
    exit 0
  fi
}

case "$MODE" in
  issue-triage)
    pause_check
    opencode run \
      "Run skills/loop-constraints/SKILL.md. Then run skills/issue-triage/SKILL.md. Read issue-triage-state.md first. Scan open issues and PRs since last run. Update issue-triage-state.md with top 5 (bug/feature/task, P0-P3), proposed labels, duplicates for human confirm. Propose only — never label, close, comment, or edit code." \
      --title "Issue triage — Gu-SEO"
    ;;
  triage)
    pause_check
    opencode run \
      "Run skills/loop-constraints/SKILL.md. Then run the loop-triage skill (patterns/daily-triage/SKILL.md). Read STATE.md and issue-triage-state.md first. Merge top issue-triage items into High Priority. Update Last run timestamp. Do not edit source code. End with a 5-line summary." \
      --title "Daily triage — Gu-SEO"
    ;;
  autofix)
    pause_check
    if ! grep -q "^mode: auto-fix" loop-constraints.md; then
      echo "auto-fix requires 'mode: auto-fix' in loop-constraints.md — exiting."
      exit 1
    fi
    FIX_ID="$(date +%Y%m%d%H%M%S)"
    WORKTREE="../wt-loop-fix-$FIX_ID"
    git worktree add "$WORKTREE" -b "loop/fix-$FIX_ID"
    opencode run \
      "Run skills/loop-constraints/SKILL.md. Then read issue-triage-state.md and pick ONE top single-file bugfix. Implement the minimal fix, run npm test and npm run build:functions, write a summary plus diff path. Escalate ambiguous or denylisted paths." \
      --agent implementer --dir "$WORKTREE" --title "Loop autofix $FIX_ID"
    DIFF_FILE="$(mktemp /tmp/loop-diff.XXXXXX.patch)"
    git -C "$WORKTREE" diff > "$DIFF_FILE"
    opencode run "Review this diff against AGENTS.md and loop-constraints.md denylist plus test evidence. APPROVE or REJECT only." \
      --agent verifier --file "$DIFF_FILE" --title "Verify loop fix $FIX_ID"
    echo "Diff kept at: $DIFF_FILE (merge manually after APPROVE)"
    ;;
  *)
    echo "Unknown mode: $MODE (issue-triage|triage|autofix)"
    exit 1
    ;;
esac
