# Code Reviewer for Gu-SEO

## Overview
Automated code review for PRs in the Gu-SEO project.

## When to Use
- On demand for every open PR
- Before any merge to main
- After CI passes on a PR

## Goals
1. Analyze code changes for correctness
2. Check quality against project conventions
3. Provide actionable feedback

## Steps

### 1. Analyze Changes
- Review the diff file by file (`git diff` against base branch)
- Trace callers of changed Functions via shared helpers in `functions/_lib/`
- Flag changes to load-bearing files: `functions/_lib/auth.js`, `schema/init.sql`, `/api/version`, `/api/health`

### 2. Check Quality
- ESM only, `export const onRequestGet/Post` handlers start with `adminGate`
- Error responses go through `json(status, body)` from `functions/_lib/util.js`, never raw `Error`
- No `console.log` of passwords, magic-link URLs, or `Bearer` tokens
- No silent `try/catch`, no `as any` / `@ts-ignore` equivalents, no UUIDs (32-char hex via `newId()`)
- Mutating admin endpoints call `audit()` fire-and-forget

### 3. Provide Feedback
- Approve, request changes, or comment with file:line references
- Suggest minimal fixes following existing file patterns
- Escalate schema or auth changes to a human reviewer

## Safety Checks
- Never approve schema changes (`schema/init.sql`, `functions/_lib/schema.js`) without human review
- Never approve auth changes (`functions/_lib/auth.js`) without human review
- Never approve `wrangler.toml` changes (must target `wrangler.template.toml`)
- Always use `gate_check` before merging

## Success Criteria
- All PRs reviewed within 48 hours
- No silent catches or credential leaks merged
- Schema/auth changes always get human sign-off
