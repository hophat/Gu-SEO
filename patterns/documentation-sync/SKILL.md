# Documentation Sync for Gu-SEO

## Overview
Keep documentation in sync with code for the Gu-SEO project.

## When to Use
- Daily at 09:00 UTC
- After any merged PR that changes behavior, routes, or config
- When `README.md`, `CHANGELOG.md`, or `AGENTS.md` drift from code

## Goals
1. Scan recent changes for doc impact
2. Update docs to match shipped behavior
3. Validate links and references

## Steps

### 1. Scan Changes
- Review merged commits since last sync (`git log` on `functions/`, `public/`, `schema/`, `cron-worker/`, `cli/`)
- Identify new admin endpoints, new env vars/secrets, schema columns, cron schedule changes
- Check per-task playbooks (`seo.benjaminb.xyz/api/ai-prompt`, `.github/prompts/`, `.claude/skills/pages-seo/SKILL.md`) for staleness

### 2. Update Docs
- Update `README.md` routes/endpoints tables and admin workflows
- Update `CHANGELOG.md` (Added / Fixed / Changed) and `AGENTS.md` if conventions changed
- Schema column added? Confirm `schema/init.sql` + regenerated `functions/_lib/schema.js` are both committed

## Safety Checks
- Never modify `schema/init.sql` without human approval
- Never modify `functions/_lib/auth.js` without human approval
- Never commit `wrangler.toml`
- Never invent endpoints or env vars — only document what the code actually does

### 3. Validate Links
- Check internal doc links and public URLs referenced in docs
- Verify playbook URLs and installer commands still resolve
- Fix or flag broken references

## Success Criteria
- Every behavior-changing PR reflected in docs within 24 hours
- No broken internal links
- CHANGELOG entries for all user-facing changes
