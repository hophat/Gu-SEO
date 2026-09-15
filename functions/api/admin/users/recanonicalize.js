// POST /api/admin/users/recanonicalize
//
// Recomputes `users.email_canonical` for every row using the shared rule in
// _lib/email_rules.js.
//
// Two reasons this exists rather than doing it in the migration:
//
//   1. The collapse rule (Gmail ignores dots, +tag is a subaddress) expressed
//      in SQL would be a second implementation, free to drift from the one the
//      app uses. This runs the same function.
//   2. If the rule ever changes — a new provider that ignores dots, say — the
//      stored keys have to be recomputed. Doing that from the Worker keeps one
//      source of truth instead of shipping a data migration each time.
//
// Idempotent: it recomputes rather than appending, so running it twice is a
// no-op. super_admin only.

import { json, audit } from '../../../_lib/util.js';
import { requireSuperAdmin } from '../../../_lib/auth.js';
import { canonicalEmail } from '../../../_lib/email_rules.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  if (!env?.DB) return json(500, { error: 'no_db' });

  const { results } = await env.DB.prepare(
    'SELECT id, email, email_canonical FROM users'
  ).all().catch(() => ({ results: [] }));

  let changed = 0;
  const sample = [];
  for (const row of (results || [])) {
    const next = canonicalEmail(row.email);
    if (next === row.email_canonical) continue;
    await env.DB.prepare('UPDATE users SET email_canonical = ? WHERE id = ?')
      .bind(next, row.id).run();
    changed++;
    // Only the shape, never the address — enough to see what was collapsed.
    if (sample.length < 5) {
      sample.push({ id: row.id, was_canonical: row.email_canonical === row.email, now_canonical: next === row.email });
    }
  }

  // A duplicate can appear after canonicalisation: two rows that were distinct
  // strings but are one mailbox. Report it rather than silently merging —
  // deleting an account is the operator's call, not this endpoint's.
  const dupes = ((await env.DB.prepare(
    `SELECT email_canonical, COUNT(*) AS n FROM users
      WHERE email_canonical IS NOT NULL
      GROUP BY email_canonical HAVING COUNT(*) > 1`
  ).all().catch(() => ({ results: [] }))).results) || [];

  audit(env, 'admin', 'users_recanonicalize', null, { scanned: (results || []).length, changed, duplicates: dupes.length });

  return json(200, {
    ok: true,
    scanned: (results || []).length,
    changed,
    duplicates: dupes.length,
    // Which keys collide — the operator needs to know who to look at. These are
    // already-collapsed keys, not real addresses, so no address is leaked.
    duplicate_keys: dupes.slice(0, 10).map((d) => d.email_canonical),
  });
};
