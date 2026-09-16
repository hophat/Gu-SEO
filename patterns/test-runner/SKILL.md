# Test Runner for Gu-SEO

## Overview
Run and analyze test results for the Gu-SEO project.

## When to Use
- On demand for every PR and before deploys
- After dependency updates
- When CI reports failures

## Goals
1. Run the full test suite
2. Analyze failures to root cause
3. Report failures with reproduction steps

## Steps

### 1. Run Tests
- Run `node scripts/run-tests.js && node --no-warnings scripts/run-platform-tests.js` (aka `npm test`)
- Run `npm run build:functions` to catch broken Pages Function imports (wrong relative depth in `functions/[project]/` wrappers only fails at deploy time otherwise)
- Run `node --no-warnings scripts/check-schema-drift.mjs` when schema files changed

### 2. Analyze Results
- Parse failure output: which script, which file, first failing assertion
- Distinguish transient failures (AI provider timeouts, network) from real regressions
- Check whether failures pre-exist on main before blaming the PR

### 3. Report Failures
- Report file, command, and minimal reproduction steps
- Attach relevant log excerpts (scrubbed of tokens/passwords)
- Suggest the smallest fix consistent with existing patterns; never delete failing tests to "pass"

## Safety Checks
- Never modify `schema/init.sql` without human approval
- Never modify `functions/_lib/auth.js` without human approval
- Never commit `wrangler.toml`
- Never log admin passwords, magic-link URLs, or `Bearer` tokens
- Always use `gate_check` before committing fixes

## Success Criteria
- Full suite green before merge
- Transient failures retried max 3 times, then escalated
- Pre-existing failures explicitly noted, not silently fixed
