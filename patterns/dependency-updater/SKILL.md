# Dependency Updater for Gu-SEO

## Overview
Keep dependencies up to date securely for the Gu-SEO project.

## When to Use
- Daily at 09:00 UTC
- After security advisories for npm / Cloudflare packages
- When `npm audit` reports high-severity issues

## Goals
1. Check for outdated dependencies
2. Audit for security vulnerabilities
3. Create update PRs with test evidence

## Steps

### 1. Check Updates
- Run `npm outdated` and review major bumps (vite, wrangler, react, antd)
- Check Cloudflare Workers / Pages changelog for breaking changes
- Skip updates that touch the deploy chain without human approval

### 2. Security Audit
- Run `npm audit` and triage high/critical first
- Verify no secrets or tokens are embedded in lockfile diffs
- Confirm D1/R2 bindings are unaffected by the bump

### 3. Create PRs
- One PR per dependency group (build vs runtime vs Cloudflare)
- Include before/after `npm test` output in the PR body
- Run `npm run build:functions` to catch broken Pages Function imports

## Safety Checks
- Never modify `schema/init.sql` without human approval
- Never modify `functions/_lib/auth.js` without human approval
- Never commit `wrangler.toml` (edit `wrangler.template.toml` instead)
- Never delete a D1 database in any script or instruction
- Always use `gate_check` before committing

## Success Criteria
- No critical vulnerabilities open > 24 hours
- All PRs include test + build evidence
- No broken deploys caused by dependency bumps
