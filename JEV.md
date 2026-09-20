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

`evaluate` scores each document on the dev dimensions in `DIMENSIONS`
(`scripts/jev.js`): `correctness, safety, rule_fit, security, scope, evidence,
clarity, reuse`, plus one `overall` choice of `proceed | review | stop`.

Output is a markdown table followed by one JSON line. Exit code is the decision:
**0 = proceed (act without a human), 1 = review (escalate), 2 = stop or error.**
A shell `&&` chain therefore stops on anything that is not `proceed`.

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

One call per document, all dimensions in that one request. Trim the input with
`--max-chars` (default 12000), send only the relevant slice (a diff, the changed
function), and use `--dimensions` when only a couple of dimensions matter.
