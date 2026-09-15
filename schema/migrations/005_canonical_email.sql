-- 005: canonical email, for duplicate detection.
--
-- Gmail ignores dots in the local part and treats `+tag` as a subaddress, so
-- `g.u.l.a.g.i@gmail.com`, `gulagi+shop@gmail.com` and `gulagi@gmail.com` are
-- one mailbox. Without this column the sign-up check compared raw strings and
-- let the same person register unlimited accounts by adding dots.
--
-- `users.email` is UNCHANGED and remains the real address — the one that gets
-- mailed. `email_canonical` is a comparison key only: collapsing is lossy, so
-- it must never be used to send anything.
--
-- Backfill is deliberately CONSERVATIVE: `lower(email)` only. Expressing the
-- dot/plus collapse in SQL here would be a second implementation of the same
-- rule, free to drift from functions/_lib/email_rules.js — the exact failure
-- that made three copies of the provider dispatch. `lower(email)` is already
-- correct for every non-Google domain, and the Google rows are corrected by
-- POST /api/admin/users/recanonicalize, which runs the same JS the app uses.
--
-- A wrong canonical only causes a MISSED duplicate (a second account gets
-- created), never a lockout: existing users keep signing in with `email`.

ALTER TABLE users ADD COLUMN email_canonical TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_canonical ON users(email_canonical);

UPDATE users
   SET email_canonical = lower(email)
 WHERE email_canonical IS NULL;
