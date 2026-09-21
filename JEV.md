# JEV.md — typed decisions with TypeSafe during development

`scripts/jev.js` calls TypeSafe's System One API (model `jev-latest`) to get a
**typed answer plus a calibrated confidence** for a judgement call. It exists so
a reversible, in-repo decision can be settled with one small API call instead of
a human round-trip or a long reasoning pass.

This is a developer tool, not a product feature — nothing under `functions/`,
`public/`, `cli/` or `cron-worker/` imports it.

## When to use it

- **Pick between options** — two or more defensible approaches and the choice is
  reversible: `decide`.
- **Gate a change** — a diff, file, plan, or log is about to be acted on:
  `evaluate`. Run it before reporting work as done.
- **Yes/no judgement** — "does this diff weaken `adminGate`?", "is this a real
  duplicate?": `verdict`.
- **Rate against a rubric** — severity, quality, risk: `score`.

## When NOT to use it

- Anything in the human-gated set below, no matter how confident the answer is.
- Taste and product calls (copy, brand voice, visual design) — those belong to
  the operator.
- Facts you can check directly: run the test, read the file, query D1. Jev
  judges; it does not verify. Never treat its output as evidence that something
  works.

## Commands

In-session (after an opencode restart) the `typesafe` MCP server exposes the same
two surfaces as tools — `jev_decide` and `jev_ask` — with identical gate
semantics. Use them when you already have the state in context; use the CLI when
the state is a file, a diff, or a D1 row.

```bash
node scripts/jev.js decide  --question "Which fix first?" --option a="…" --option b="…"
git diff | node scripts/jev.js evaluate --label "uncommitted change" --state -
node scripts/jev.js evaluate --file <path|dir> [--dimensions scope,evidence,rule_fit]
node scripts/jev.js verdict --question "Does this change break the daily fan-out?" --state "$(cat file)"
node scripts/jev.js score   --question "How risky?" --level low --level mid --level high --state "…"
```

`--file` only accepts the extensions listed in `DOC_EXT`; a diff on a path with
no extension (a `mktemp` file, a process substitution) is dropped silently, so
pipe it through `--state -` instead.

`TYPESAFE_API_URL` overrides the endpoint (default
`https://api.typesafe.ai/v1/systemone`). It is for tests — `npm test` points the
real client at a loopback stub to pin the wire contract without spending a
request — not a knob to run against anything else.

`evaluate` scores each document on the dev dimensions in `DIMENSIONS`
(`scripts/jev.js`): `correctness, safety, rule_fit, security, scope, evidence,
clarity, reuse`, plus one `overall` choice of `proceed | review | stop`.

Output is a markdown table followed by one JSON line. Exit code is the decision:
**0 = proceed (act without a human), 1 = review (escalate), 2 = stop or error.**
A shell `&&` chain therefore stops on anything that is not `proceed` — but that
holds for `evaluate` only. `decide`, `verdict`, `score` and `ask` exit 0 whenever
the API answered at all: their answer is the `gate` object in the JSON, which
exists only when you pass `--min-confidence`. Read `gate.<key>.act` there and
never treat those modes' exit code as a green light.

`--summary` replaces the table with one line — every score with its confidence,
and `!` after an answer the gate did not clear — printed *before* the JSON line
(so `tail -n 1` is still the JSON). It is what `scripts/loop-run.sh` records in
the run log:

```bash
git diff | node scripts/jev.js evaluate --label "uncommitted change" --state - --summary
printf '%s\n' "$top" | node scripts/jev.js ask --state - --min-confidence 0.6 \
  --questions skills/issue-triage/jev-questions.json --summary
```

## How to act on an answer

- `act_without_human: true` (or exit 0) → proceed; say which decision you made
  and why, quoting the score and confidence.
- exit 1 → ask the operator, with the failing dimensions and their scores.
- exit 2 → stop; do not act on the document.
- Always report the confidence next to the score. A high score with low
  confidence is not a green light — that is what the gate is for. Raise
  `--min-confidence` for riskier calls; the default is 0.6.

## Hard limit — Jev never authorises these

Production deploys (`wrangler deploy`, `npm run deploy`), D1 writes, schema
changes (`schema/init.sql`, `functions/_lib/schema.js`), auth changes
(`functions/_lib/auth.js`), secret changes, deleting data, or anything else
irreversible. These follow `gate.yaml` / `loop-constraints.md` and need the
operator's explicit approval, whatever `scripts/jev.js` returns.

## Keeping it cheap

**You are billed for input tokens only** ($0.042 per Mtok; output is free, per
`docs.typesafe.ai/models`). There is one model — `jev-1.13.0`, alias
`jev-latest` — so there is no cheaper tier to switch to. Every lever is about
input: send less, or do not call at all.

Where the input actually goes, measured on this repo:

- **The question block costs ~0.7–1k tokens on every call** (9 questions, each
  with its 3-level `criteria`). For a 600-character document that is most of the
  bill — a 613-char file scored in 975 tokens. The levels are therefore kept
  terse on purpose: rewriting the prose wording as short phrases took the block
  from **1868 to 1577 characters (−15.6 %)**, paid on *every* call, without
  changing the three-step shape or its meaning.
- **A real diff dominates.** The autofix gate on an actual working-tree diff
  measured ~4.5k tokens; the state is ~80% of it. `--max-chars` and
  `--dimensions` are the only knobs that matter there.
- **Never pay to judge a build artifact.** `functions_dist/`, `package-lock.json`,
  `node_modules/`, `dist/` and `build/` are derived from source that is in the
  same diff, so `evaluate` drops them — from a `--file` walk and, for a piped
  `git diff`, section by section before the state is sent. Measured on this
  repo's multi-platform branch: **381 700 → 118 651 characters (−68.9 %)**, with
  every source file still judged. Asking `--file` for a generated path alone
  therefore exits 2 with `no documents` — correct, since there is nothing there
  that is not already in the source it was built from.
- **Batching several documents saves time, not tokens.** `evaluate` sends one
  document per call and N documents in one call (state = `documents[]` with
  named fields, question keys prefixed `d<i>_`) — the fan-out shape the docs
  recommend. Measured on 4 real files (613–9804 chars): 4 calls → 1 call,
  7271 → 7289 input tokens, **4.67 s → 1.40 s wall clock (3.3×)**. The docs'
  12.2× figure is for *one* state asked across many calls, which is what
  `--state -` plus several questions already does — do not expect it from
  disjoint documents.

Limits to respect when batching (same models page): 64k tokens per request,
**32k for the state plus the longest question**, and accuracy drifts as the state
grows. Keep a batch to a handful of documents — the loop never needs more than
the single diff it is gating.

Do not buy a judgement there is nothing to judge: with no documents `evaluate`
exits 2 and makes no request, and `scripts/loop-run.sh` skips the gate entirely
when the branch changes no files (the row says `nothing to judge`). Every
`--summary` line ends with `in=<tokens>`, so what each gate cost is in
`loop-run-log.md` next to the decision it produced.
