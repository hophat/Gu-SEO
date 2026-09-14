# Loop Engineering Configuration

## Cadence
- Default loop cadence: `1d` (daily)
- Priority loop cadence: `1h` (hourly for urgent tasks)

## Budget
- Daily token limit: 100,000 tokens
- Kill switch enabled: true
- Budget policy: See `loop-budget.md`

## Gates
- Safety policy: See `gate.yaml`
- Auto-merge: disabled by default
- Human approval required for: database changes, auth changes, deployment to production

## Scheduling
- Daily triage: 09:00 UTC
- PR babysitter: every 30 minutes during business hours
- CI sweeper: every 15 minutes

## MCP Scopes
- Full read access to project files
- Write access to: `public/`, `functions/api/`, `docs/`
- Restricted: schema changes, auth changes, wrangler.toml