# PR Babysitter for Gu-SEO

## Overview
Monitor and shepherd PRs through the review process for the Gu-SEO project.

## When to Use
- Every 30 minutes during business hours
- When PRs are open and need attention
- After CI failures

## Goals
1. Monitor all open PRs
2. Request appropriate reviews
3. Follow up on stalled PRs
4. Resolve merge conflicts
5. Ensure CI passes before merge

## Steps

### 1. Monitor PRs
- List all open PRs
- Check CI status for each PR
- Review comments and feedback
- Identify PRs needing attention

### 2. Request Reviews
- Assign reviewers based on file changes
- Use `gate_check` to validate changes
- Request review from domain experts
- Set appropriate labels

### 3. Follow Up
- Ping reviewers after 24 hours
- Resolve blocking comments
- Update PR descriptions
- Rebase if needed

## Safety Checks
- Use `gate_check` before merging
- Never auto-merge schema changes
- Never auto-merge auth changes
- Always require approval for `wrangler.toml`

## Success Criteria
- All PRs reviewed within 48 hours
- No stale PRs > 7 days
- CI passes before merge
- No merge conflicts