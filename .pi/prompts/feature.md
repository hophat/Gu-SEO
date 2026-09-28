---
description: "pages-seo feature workflow — triage, scope the affected layers, implement in the owning layer, review, and pass the ship gate. Use for any feature, refactor, or bug fix in this repo: new API route, admin page, schema column, renderer change, cover/video/publishing work. Also for follow-ups: 'rerun', 'just the admin part', 'improve the previous result'."
argument-hint: "<feature or bug description>"
---

Run the pages-seo feature workflow for: **$@**

Use the `subagent` tool with **`agentScope: "both"`** on every call — otherwise the project
agents in `.pi/agents/` are not discovered and only user-level agents load.

## Triage before delegating

Size the request first. Do not spin up a team for a one-line fix.

- **Small** (one file, one layer, obvious) — do it yourself in this session. No delegation.
- **Medium** (one layer, several files) — Phase 2 single-owner, then Phase 3.
- **Large** (spans layers) — full workflow below.

Owner map — route the work to the right agent rather than letting them touch each other's files:

| Layer | Owner | Skill |
|---|---|---|
| `functions/**`, `[project]` wrappers, `_lib` | `functions-worker` | `/skill:pages-function-endpoint` |
| `schema/init.sql`, migrations, `functions/_lib/schema.js` | `schema-migrator` | `/skill:d1-schema-change` |
| `src/admin/**`, `public/admin-dist`, `public/cover-editor.js` | `admin-ui` | `/skill:admin-ui-contract` |
| public SEO surface (read-only) | `seo-reviewer` | `/skill:seo-surface-review` |
| tests, builds, version, tag, deploy | `release-engineer` | `/skill:ship-gate` |

## Phase 0: context check (follow-up support)

1. Does `_workspace/` exist?
   - No → first run, create it.
   - Yes + partial-request ("only redo the admin part") → re-delegate only the named agent and
     overwrite only its artifact.
   - Yes + new input → move it to `_workspace_<YYYYMMDD_HHMMSS>/` and start clean.
2. Read `AGENTS.md` hard rules before planning. They are not advisory.

## Phase 1: scope (parallel)

Delegate to `subagent` in **parallel** mode, only for the layers the request actually touches.
Two to four tasks; skip layers that are irrelevant rather than padding the fan-out.

```json
tasks: [
  { "agent": "functions-worker", "task": "Read-only scope: which files under functions/** does '<request>' touch? Existing patterns to copy, gate shape needed, cache policy, call sites. Do NOT edit. Return a file list and a one-paragraph plan to _workspace/01_functions-worker_scope.md, summary inline." },
  { "agent": "admin-ui",         "task": "Read-only scope: which files under src/admin/** does '<request>' touch? Which api.js helper is needed? Return a plan to _workspace/01_admin-ui_scope.md, summary inline." },
  { "agent": "schema-migrator",  "task": "Read-only scope: does '<request>' need new persisted data? If yes, which table, column, type, default, and which phase (init.sql, migration, or both)? If no, say so explicitly. Return to _workspace/01_schema-migrator_scope.md, summary inline." }
]
```

## Phase 2: implement (owner agents, single, in dependency order)

Order matters: schema → functions → admin. Each agent returns a `## HANDOFF` block; read it and
carry the specifics into the next agent's task. Do not let agents re-derive a previous agent's
findings.

1. `schema-migrator` (only if Phase 1 said new data is needed) — must finish with a **CALLSITES**
   list. Pass it verbatim to the next step.
2. `functions-worker` — implement the route/helper, wire the gate, run
   `node scripts/run-tests.js` and `npm run build:functions` if wrappers changed.
3. `admin-ui` (only if the UI changed) — implement, `npm run admin:build` (its output is
   gitignored; do not stage it), then `check-jsx` / `check:contrast` / `check-public`.

## Phase 3: review (chain)

```json
mode: "chain",
agents: ["seo-reviewer", "release-engineer"]
```

`seo-reviewer` reviews the diff read-only: does this change the indexable surface — canonical,
robots, sitemap, internal links, metadata, programmatic page sets? Findings ranked, each with
`file:line`, symptom, minimal fix. If the change touches no public page, say so and stop there.

`release-engineer` then runs the gate: `npm test`, `check-jsx`, `check:contrast`, `check-public`,
plus the rebuilds owed by what changed, and reports failures verbatim. **No commits, no tags, no
deploy** — those need an explicit user instruction.

If the review finds real defects, delegate back to the owning agent for a bounded fix, then
re-run only the affected gate.

## Phase 4: report

- What changed, file by file.
- Gate results, verbatim.
- Open questions, and anything you deliberately did not touch.
- If the user asked to ship, present the exact commit/tag/deploy commands and **wait**.

## Error handling

- An agent fails: retry once. If it fails again, continue without it and name the gap in the
  report. Do not fabricate its result.
- Schema phase fails → stop. Do not let `functions-worker` write queries against a column that
  does not exist; that is a production 500.
- A gate fails → do not edit the check or the test. Report it and ask.
- Conflicting information between agents → surface the conflict with both sources; do not silently
  pick one.
