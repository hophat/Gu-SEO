# CI Sweeper for Gu-SEO

## Overview
Monitor and fix CI failures for the Gu-SEO project.

## When to Use
- Every 15 minutes
- After deployments
- When CI fails

## Goals
1. Monitor CI status
2. Analyze failures
3. Attempt automated fixes
4. Escalate to humans if needed

## Steps

### 1. Monitor CI
- Check Cloudflare Pages build status
- Check GitHub Actions
- Check wrangler build status
- Monitor for flaky tests

### 2. Analyze Failures
- Parse error messages
- Identify root cause
- Check for transient failures
- Review recent changes

### 3. Attempt Fix
- Retry transient failures
- Fix simple syntax errors
- Update dependencies if needed
- Rollback if critical

## Safety Checks
- Never rollback without human approval
- Never modify production database
- Always use `gate_check` before fixes
- Escalate complex issues

## Success Criteria
- CI fixed within 30 minutes
- No transient failures > 3 retries
- Human escalation within 15 minutes for complex issues