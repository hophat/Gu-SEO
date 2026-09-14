# Loop Budget Configuration

## Token Limits
- Daily token cap: 100,000 tokens
- Monthly token cap: 3,000,000 tokens
- Per-loop limit: 10,000 tokens

## Kill Switch Policy
- Enabled: true
- Trigger conditions:
  - Exceed daily token cap
  - 5 consecutive failed loops
  - Rate limit errors from AI providers
- Auto-recovery: disabled (requires manual intervention)

## Spending Limits
- Cost threshold: $50/day
- Alert threshold: $40/day
- Over-spend policy: Stop all loops

## Monitoring
- Log token usage per loop
- Alert at 80% of daily limit
- Weekly cost reports