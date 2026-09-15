// POST /api/admin/aliases/sync
// Refreshes the sitemap-kind aliases for the caller's project by scanning its
// published blog posts and programmatic pages. Manual aliases are untouched,
// and other projects' rows are never read or written.

import { json, audit } from '../../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { syncSitemapAliases } from '../../../_lib/links/aliases.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;

  const result = await syncSitemapAliases(env, pid);
  await audit(env, 'admin', 'aliases.sync', pid || '', JSON.stringify(result));
  return json(200, { ok: true, project_id: pid, ...result });
};
