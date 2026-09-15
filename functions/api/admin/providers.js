// Lists which AI providers are configured (have a key/binding) so the admin UI
// can populate a "preferred provider" dropdown.
//
// super_admin only: this is platform configuration, and both callers (the
// Settings tab and the legacy admin) are already super_admin-gated.
import { json } from '../../_lib/util.js';
import { requireSuperAdmin } from '../../_lib/auth.js';
import { listProviders } from '../../_lib/ai.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  return json(200, await listProviders(env));
};
