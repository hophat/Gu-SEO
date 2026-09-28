---
description: "pages-seo schema migration workflow — add a column/table/index through the two-phase model, regenerate the bundled schema, hand the CALLSITES list to the Functions layer, update the admin UI, and pass the drift check. Use for 'add a field to <table>', 'track X per project', 'no such column', or any change to schema/init.sql or migrations. Follow-ups: rerun, only the init.sql part, only the call sites."
argument-hint: "<table.column or table> — <what it stores>"
---

Run the pages-seo schema migration workflow for: **$@**

Use the `subagent` tool with **`agentScope: "both"`** on every call.

This workflow is a `chain` because each step consumes the previous step's exact output. D1 holds
every post ever generated — a wrong migration is unrecoverable, so the order is not negotiable.

## Phase 0: context check

- `_workspace/` exists and holds a prior migration plan → read it, confirm the plan still matches
  `$@`, and continue from the first incomplete phase.
- Otherwise create `_workspace/` and start at Phase 1.

## Phase 1: DDL (`schema-migrator`)

```json
{ "agent": "schema-migrator",
  "task": "Design and apply the DDL for: $@ . Load /skill:d1-schema-change. Decide the phase (init.sql, numbered migration, or both) and state why. Use only CREATE ... IF NOT EXISTS / ALTER TABLE ... ADD COLUMN / CREATE INDEX IF NOT EXISTS; every new column gets a DEFAULT. Run npm run bundle-schema. Produce the mandatory CALLSITES list of every file whose queries must change. Return the standard HANDOFF block." }
```

`schema-migrator` must return a **CALLSITES** list. If it does not, re-delegate before continuing —
without that list, step 2 becomes a guess.

## Phase 2: call sites (`functions-worker`)

```json
{ "agent": "functions-worker",
  "task": "Load /skill:pages-function-endpoint. Schema change is in place (previous output): {previous}. Update the query call sites listed in CALLSITES so the new column is selected/filtered/inserted correctly. Preserve each route's auth gate and cache policy exactly. Run node scripts/run-tests.js, and npm run build:functions since functions/ changed. Return the standard HANDOFF block." }
```

Do not let this step change the DDL. A disagreement about the schema goes back to step 1.

## Phase 3: admin surface (`admin-ui`)

Only if the new data is user-visible.

```json
{ "agent": "admin-ui",
  "task": "Load /skill:admin-ui-contract. Expose the new column in the relevant src/admin page. Extend src/admin/api.js rather than calling fetch in a component; add styles via styles/tokens.css tokens only. Run npm run admin:build (its output is gitignored — do not stage it), then check-jsx / check:contrast / check-public. Return the standard HANDOFF block." }
```

## Phase 4: verification (`release-engineer`)

```json
{ "agent": "release-engineer",
  "task": "Load /skill:ship-gate. Verify this schema change. Run npm test, npm run bundle-schema (confirm functions/_lib/schema.js and migrations_bundle.js diffs are generated-only), check-public, and build:functions. Then ASK BEFORE running node --no-warnings scripts/check-schema-drift.mjs — it queries the remote D1 read-only, so state that you need approval rather than running it. Do NOT run npm run db:migrate. Return the standard HANDOFF block with GATES and BLOCKED_ON." }
```

## Phase 5: report

State: the DDL per file, the phase and why, the bundle diff stat, the full CALLSITES list, gate
results, and — as an explicit pending item — the drift check and the migration-apply command,
both awaiting the user's approval.

## Hard stops

- Never run `npm run db:migrate` or any remote write.
- Never let a `DROP` appear anywhere in the diff. If a proposal needs a drop, stop and explain
  the additive alternative.
- Never silence `check-schema-drift.mjs`; it exists because a column shipped missing from
  `init.sql` and broke fresh installs.
- Never hand-edit `functions/_lib/schema.js` or `migrations_bundle.js`.
