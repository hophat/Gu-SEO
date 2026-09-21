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

# ── Jev — a typed second opinion, recorded with score and confidence ────
# `evaluate` is the only mode whose exit code is the gate (0 proceed,
# 1 review, 2 stop — JEV.md); the triage paths use `ask` with the repo's own
# rubric and log the answer instead of gating on it, because that mode always
# exits 0. Jev sits behind a third-party API and is a dev tool: when it is
# unavailable the loop keeps the gates it already had (verifier verdict,
# tests, denylist) and says so in the log — never silent, and never a licence
# to skip a gate above it.
JEV_NOTE=""   # the answer, or why there is none
JEV_RC=3      # the gate: 0 proceed, 1 review, 2 stop, 3 unavailable

# jev_call <args…>: runs jev with --summary, leaving its answer in JEV_NOTE and
# its gate in JEV_RC (3 = missing or failed, which never fails the runner). With
# --summary the answer is the last line that is neither blank nor the JSON line.
jev_call() {
  local out err rc=0
  err="$(mktemp "${TMPDIR:-/tmp}/loop-jev.XXXXXX")"
  # stdout only: jev writes a judgement there and its reasons to stderr, and
  # merging them turns a failure message into something that reads like a
  # verdict.
  out="$(node scripts/jev.js "$@" --summary 2>"$err")" || rc=$?
  # The last stdout line that is neither blank nor the JSON line. awk rather
  # than `grep | tail`: with `set -o pipefail` a grep that matches nothing makes
  # the whole assignment non-zero, and `set -e` then kills the run.
  JEV_NOTE="$(awk 'NF && !/^\{/ {v=$0} END {print v}' <<<"$out")"
  if [ "$rc" -gt 2 ] || [ -z "$JEV_NOTE" ] || grep -q 'error=' <<<"$JEV_NOTE"; then
    # Nothing on stdout means jev never judged anything (no API key, bad flags,
    # a crash, a missing binary) — "unavailable", not a stop.
    [ -n "$JEV_NOTE" ] || JEV_NOTE="$(head -c 200 "$err" | tr '\n' ' ')" || true
    JEV_NOTE="unavailable — $JEV_NOTE"
    rc=3
  fi
  rm -f "$err"
  JEV_RC="$rc"
}

# jev_evaluate_diff <label> <diff-file>: the diff goes on stdin because `--file`
# only accepts the extensions jev knows (DOC_EXT) — a mktemp path has none and
# would be dropped, reading as "no documents" (exit 2, i.e. a stop).
jev_evaluate_diff() {
  jev_call evaluate --label "$1" --state - <"$2"
}

# jev_triage_note: scores the Top 5 the triage run just wrote, against the
# rubric the issue-triage skill documents.
jev_triage_note() {
  local top
  top="$(awk '/^## Top 5/{f=1;next} f&&/^## /{f=0} f' issue-triage-state.md 2>/dev/null)" || true
  # A real item, not the file's own placeholder (`- (empty — populated by the
  # next run)`): scoring the placeholder returns a confident, meaningless
  # answer, which is worse than no answer at all.
  if ! grep -qE '^- [^(]' <<<"$top"; then
    JEV_NOTE="nothing to score — Top 5 is empty"; JEV_RC=3
  else
    # The state goes in as an argument, not a pipe: every stage of a pipeline
    # runs in a subshell, so JEV_NOTE set inside jev_call would be lost.
    jev_call ask --state "$top" --min-confidence 0.6 \
      --questions "$(cat skills/issue-triage/jev-questions.json)"
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
    jev_triage_note
    log_run "issue-triage" "ok" "proposed only — nothing labelled, commented, closed or edited; top 5 in issue-triage-state.md; jev: $JEV_NOTE"
    ;;
  triage)
    pause_check
    opencode run \
      "Run skills/loop-constraints/SKILL.md. Then run the loop-triage skill (patterns/daily-triage/SKILL.md). Read STATE.md and issue-triage-state.md first. Merge top issue-triage items into High Priority. Update Last run timestamp. Do not edit source code. End with a 5-line summary." \
      --title "Daily triage — Gu-SEO"
    jev_triage_note
    log_run "triage" "ok" "merged top issue-triage items into STATE.md (High Priority); no source edits; jev: $JEV_NOTE"
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
    # Commit what the implementer left BEFORE taking the diff, so the file the
    # gates read is exactly the bytes a merge would land. A working-tree diff
    # misses anything the implementer committed itself, which would show every
    # gate an empty diff while the branch really did change files.
    git -C "$WORKTREE" add -A
    git -C "$WORKTREE" diff --cached --quiet || git -C "$WORKTREE" commit -m "loop(fix-$FIX_ID): automated fix"
    DIFF_FILE="$(mktemp "${TMPDIR:-/tmp}/loop-diff.XXXXXX")"
    git -C "$WORKTREE" diff main...HEAD > "$DIFF_FILE"
    VERDICT="$(with_timeout opencode run "Review this diff against AGENTS.md and loop-constraints.md denylist plus test evidence. APPROVE or REJECT only." \
      --agent verifier --file "$DIFF_FILE" --title "Verify loop fix $FIX_ID" || true)"
    if ! grep -qi "APPROVE" <<<"$VERDICT" || grep -qi "REJECT" <<<"$VERDICT"; then
      if [ "$DRY_RUN" = "1" ]; then print_diff; fi
      log_run "autofix $FIX_ID$DRY_TAG" "rejected" "verifier did not approve; branch $BRANCH, diff at $DIFF_FILE"
      exit 1
    fi
    # Denylisted paths stay human-gated even when the verifier approves.
    if git -C "$WORKTREE" diff --name-only main...HEAD | grep -Eq '^(schema/init\.sql|functions/_lib/schema\.js|functions/_lib/auth\.js|wrangler\.toml|\.env($|\.)|package\.json)$'; then
      if [ "$DRY_RUN" = "1" ]; then print_diff; fi
      log_run "autofix $FIX_ID$DRY_TAG" "escalated" "denylisted path in diff — not merged; branch $BRANCH, diff at $DIFF_FILE"
      exit 1
    fi
    # Gate the merge on tests + build.
    if ! ( cd "$WORKTREE" && npm test && npm run build:functions ); then
      if [ "$DRY_RUN" = "1" ]; then print_diff; fi
      log_run "autofix $FIX_ID$DRY_TAG" "failed" "tests/build failed; branch $BRANCH kept at $WORKTREE"
      exit 1
    fi
    # Jev reads the diff as a typed second opinion between the tests and the
    # merge. Only a `proceed` merges; an unavailable Jev does not block, since
    # the verifier, the tests and the denylist check above all still hold.
    # A branch that changes nothing is not worth a paid call: say so instead.
    if [ -s "$DIFF_FILE" ]; then
      jev_evaluate_diff "loop fix $FIX_ID" "$DIFF_FILE"
    else
      JEV_NOTE="nothing to judge — the branch changes no files"; JEV_RC=3
    fi
    if [ "$JEV_RC" = "1" ] || [ "$JEV_RC" = "2" ]; then
      if [ "$DRY_RUN" = "1" ]; then print_diff; fi
      log_run "autofix $FIX_ID$DRY_TAG" "escalated" "Jev did not proceed (jev: $JEV_NOTE) — verifier APPROVE + tests pass, but the diff is not merged; branch $BRANCH, worktree $WORKTREE, diff $DIFF_FILE"
      exit 1
    fi
    if [ "$DRY_RUN" = "1" ]; then
      # Everything passed, but a human decides whether this one merges.
      print_diff
      echo "dry-run: verifier APPROVE + tests pass — branch $BRANCH left at $WORKTREE for manual merge."
      log_run "autofix $FIX_ID$DRY_TAG" "dry-run (would merge)" "verifier APPROVE + tests pass; no merge performed; branch $BRANCH, worktree $WORKTREE, diff $DIFF_FILE; jev: $JEV_NOTE"
      exit 0
    fi
    git merge --ff-only "$BRANCH"
    git worktree remove "$WORKTREE" --force
    git branch -d "$BRANCH"
    log_run "autofix $FIX_ID" "merged" "branch $BRANCH ff-merged to main; worktree removed; jev: $JEV_NOTE"
    ;;
  *)
    echo "Unknown mode: $MODE (issue-triage|triage|autofix)"
    exit 1
    ;;
esac
