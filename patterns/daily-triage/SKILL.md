# Daily Triage for Gu-SEO

## Overview
Review and prioritize issues, PRs, and tasks for the Gu-SEO project.

## When to Use
- Daily at 09:00 UTC
- After new deployments
- When backlog grows beyond 20 items

## Goals
1. Review all open issues and PRs
2. Prioritize by impact and urgency
3. Assign to appropriate team members
4. Identify blockers and dependencies
5. Update project status

## Steps

### 1. Gather Issues
- List all open GitHub issues
- List all open PRs
- Check Cloudflare Pages deployment status
- Review recent build failures

### 2. Prioritize
- Critical: Production bugs, security issues
- High: Feature requests from customers, performance issues
- Medium: Documentation, UI improvements
- Low: Nice-to-have features, cleanup

### 3. Assign
- Critical: Assign immediately with SLA
- High: Assign within 24 hours
- Medium: Assign within 3 days
- Low: Backlog for next sprint

## Safety Checks
- Never modify `schema/init.sql` without human approval
- Never modify `functions/_lib/auth.js` without human approval
- Never deploy to production without review
- Always use `gate_check` before committing

## Success Criteria
- All critical issues assigned within 4 hours
- No critical bugs in production > 24 hours
- Backlog review completed daily
- All PRs reviewed within 48 hours