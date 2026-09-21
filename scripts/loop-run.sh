#!/bin/bash
# Gu-SEO loop runner for cron/systemd (headless, no TUI).
# Adapted from cobusgreyling/loop-engineering examples/opencode.
#
# Usage:
#   scripts/loop-run.sh issue-triage   # L1: scan issues, propose top 5 (default, every 2h)
#   scripts/loop-run.sh triage         # L1: daily triage merge into STATE.md (1d)
#   scripts/loop-run.sh autofix        # L2: ONE minimal fix in a worktree + verifier + auto-merge (requires mode: auto-fix)
#   scripts/loop-run.sh autofix --dry-run   # run implementer + verifier + tests, print the diff, log — never merge
#
# Cron examples:
#   0 */2 * * * cd /Users/macbookpro/Gulagi/kd-outsource/Gu-SEO && ./scripts/loop-run.sh issue-triage
#   0 9 * * *   cd /Users/macbookpro/Gulagi/kd-outsource/Gu-SEO && ./scripts/loop-run.sh triage
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-issue-triage}"
# Dry-run: `autofix --dry-run` (or LOOP_DRY_RUN=1) runs the whole autofix
# pipeline but stops before the merge, prints the diff, and keeps the
# branch/worktree for a human to inspect and merge by hand.
DRY_RUN=0
if [ "${2:-}" = "--dry-run" ] || [ "${LOOP_DRY_RUN:-}" = "1" ]; then
  DRY_RUN=1
fi
DRY_TAG=""
if [ "$DRY_RUN" = "1" ]; then DRY_TAG=" (dry-run)"; fi

# A hung model provider must not hang the loop forever. `timeout` is GNU
# (Linux), `gtimeout` is its Homebrew name (macOS); without either we run
# unguarded rather than fail. Override the budget with LOOP_AGENT_TIMEOUT.
AGENT_TIMEOUT="${LOOP_AGENT_TIMEOUT:-900}"
with_timeout() {
  if command -v timeout >/dev/null 2>&1; then timeout "$AGENT_TIMEOUT" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$AGENT_TIMEOUT" "$@"
  else "$@"; fi
}

pause_check() {
  # Match a directive LINE, not a prose mention — both files document the
  # token inline, so a bare substring grep would always arm the kill switch.
  if grep -Eq '^[[:space:]]*loop-pause-all([[:space:]:]|$)' loop-constraints.md STATE.md 2>/dev/null; then
    echo "loop-pause-all active — exiting."
    exit 0
  fi
}

# Append a run line to loop-run-log.md and a row to STATE.md's Run log table
# (inserted before the "## Next actions" section so it stays inside the table).
log_run() {
  local ts
  ts="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  printf '\n[%s] %s - %s - %s\n' "$ts" "$1" "$2" "$3" >> loop-run-log.md
  awk -v row="| $ts | $1 | $2 | $3 |" '
    /^## Next actions/ && !done { print row; print ""; done = 1 }
    { print }
  ' STATE.md > STATE.md.tmp && mv STATE.md.tmp STATE.md
}

# Print the captured working-tree diff. Used by --dry-run and by every exit
# that keeps the branch for a human instead of merging.
print_diff() {
  echo "── autofix diff ──────────────────────────────"
  cat "${DIFF_FILE:-/dev/null}" 2>/dev/null || true
  echo "── end diff ──────────────────────────────────"
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
    BRANCH="loop/fix-$FIX_ID"
    git worktree add "$WORKTREE" -b "$BRANCH"
    if ! with_timeout opencode run \
      "Run skills/loop-constraints/SKILL.md. Then read issue-triage-state.md and pick ONE top single-file bugfix. Implement the minimal fix, run npm test and npm run build:functions, write a summary plus diff path. Escalate ambiguous or denylisted paths." \
      --agent implementer --dir "$WORKTREE" --title "Loop autofix $FIX_ID"; then
      log_run "autofix $FIX_ID$DRY_TAG" "failed" "implementer failed or timed out (${AGENT_TIMEOUT}s); branch $BRANCH kept at $WORKTREE"
      exit 1
    fi
    DIFF_FILE="$(mktemp "${TMPDIR:-/tmp}/loop-diff.XXXXXX")"
    git -C "$WORKTREE" diff > "$DIFF_FILE"
    VERDICT="$(with_timeout opencode run "Review this diff against AGENTS.md and loop-constraints.md denylist plus test evidence. APPROVE or REJECT only." \
      --agent verifier --file "$DIFF_FILE" --title "Verify loop fix $FIX_ID" || true)"
    if ! grep -qi "APPROVE" <<<"$VERDICT" || grep -qi "REJECT" <<<"$VERDICT"; then
      if [ "$DRY_RUN" = "1" ]; then print_diff; fi
      log_run "autofix $FIX_ID$DRY_TAG" "rejected" "verifier did not approve; branch $BRANCH, diff at $DIFF_FILE"
      exit 1
    fi
    # Denylisted paths stay human-gated even when the verifier approves.
    if git -C "$WORKTREE" diff --name-only | grep -Eq '^(schema/init\.sql|functions/_lib/schema\.js|functions/_lib/auth\.js|wrangler\.toml|\.env($|\.)|package\.json)$'; then
      if [ "$DRY_RUN" = "1" ]; then print_diff; fi
      log_run "autofix $FIX_ID$DRY_TAG" "escalated" "denylisted path in diff — not merged; branch $BRANCH, diff at $DIFF_FILE"
      exit 1
    fi
    # Commit whatever the implementer left, then gate the merge on tests + build.
    git -C "$WORKTREE" add -A
    git -C "$WORKTREE" diff --cached --quiet || git -C "$WORKTREE" commit -m "loop(fix-$FIX_ID): automated fix"
    if ! ( cd "$WORKTREE" && npm test && npm run build:functions ); then
      if [ "$DRY_RUN" = "1" ]; then print_diff; fi
      log_run "autofix $FIX_ID$DRY_TAG" "failed" "tests/build failed; branch $BRANCH kept at $WORKTREE"
      exit 1
    fi
    if [ "$DRY_RUN" = "1" ]; then
      # Everything passed, but a human decides whether this one merges.
      print_diff
      echo "dry-run: verifier APPROVE + tests pass — branch $BRANCH left at $WORKTREE for manual merge."
      log_run "autofix $FIX_ID$DRY_TAG" "dry-run (would merge)" "verifier APPROVE + tests pass; no merge performed; branch $BRANCH, worktree $WORKTREE, diff $DIFF_FILE"
      exit 0
    fi
    git merge --ff-only "$BRANCH"
    git worktree remove "$WORKTREE" --force
    git branch -d "$BRANCH"
    log_run "autofix $FIX_ID" "merged" "branch $BRANCH ff-merged to main; worktree removed"
    ;;
  *)
    echo "Unknown mode: $MODE (issue-triage|triage|autofix)"
    exit 1
    ;;
esac
