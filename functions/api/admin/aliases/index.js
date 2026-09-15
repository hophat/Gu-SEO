// Site aliases — named shortcuts the LLM uses inside markdown links.
//
// GET    /api/admin/aliases                → list (with reserved + sitemap)
// POST   /api/admin/aliases   {name,url,description}   → upsert manual
// PATCH  /api/admin/aliases   {name,url?,description?} → update
// DELETE /api/admin/aliases?name=…         → remove manual
// POST   /api/admin/aliases/sync           → refresh sitemap-kind rows
//
// Aliases are PROJECT-SCOPED. Before migration 002 the table had no
// project_id, so every project was served every other project's aliases —
// the AI writing for one tenant could be told to link to another tenant's
// pages. Every query here now filters on the tenant's project.
//
// Rows with project_id = '' are shared/legacy (copied forward by the
// migration) and stay visible to all projects so existing installs keep
// working until an operator re-syncs.
//
// Manual rows are operator-curated. Sitemap rows are auto-imported from
// published blog posts + programmatic pages. Reserved names (blog/home/rss/
// sitemap) are baked in and not stored — see _lib/links/aliases.js.

import { json, nowSec, audit } from '../../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { buildAliasMap, RESERVED_NAMES } from '../../../_lib/links/aliases.js';

const NAME_RX = /^[a-z0-9][a-z0-9_-]{0,40}$/;

function validUrl(u) {
  if (typeof u !== 'string') return false;
  const s = u.trim();
  if (!s) return false;
  if (s.startsWith('/')) return true;         // root-relative
  if (/^https?:\/\/.+/i.test(s)) return true; // absolute http(s)
  return false;
}

// Resolve the caller's project once per request.
async function tenantOf(env, request) {
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  return tenant?.activeProjectId || null;
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const pid = await tenantOf(env, request);

  const map = await buildAliasMap(env, pid);
  const items = Object.entries(map).map(([name, v]) => ({ name, ...v }));
  // Stable order: reserved first, then manual (alpha), then sitemap (alpha).
  const order = (i) => (i.kind === 'reserved' ? 0 : i.kind === 'manual' ? 1 : 2);
  items.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));

  // How many rows actually belong to this project, vs. inherited shared rows.
  // The Links page uses this to explain why a legacy alias is still visible.
  let owned = 0, shared = 0;
  if (pid) {
    const r = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN project_id = ? THEN 1 ELSE 0 END) AS owned,
         SUM(CASE WHEN project_id = ''  THEN 1 ELSE 0 END) AS shared
       FROM site_aliases`
    ).bind(pid).first().catch(() => null);
    owned = r?.owned || 0;
    shared = r?.shared || 0;
  }

  return json(200, { ok: true, project_id: pid, aliases: items, reserved: RESERVED_NAMES, counts: { owned, shared } });
};

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const pid = await tenantOf(env, request);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }
  const name = String(body?.name || '').trim().toLowerCase();
  const u    = String(body?.url || '').trim();
  const desc = String(body?.description || '').trim().slice(0, 300);
  if (!NAME_RX.test(name)) return json(400, { error: 'bad_name', detail: 'lowercase letters, digits, _ or -; up to 40 chars.' });
  if (RESERVED_NAMES.includes(name)) return json(409, { error: 'reserved_name', detail: 'Built-in alias; pick a different name.' });
  if (!validUrl(u))     return json(400, { error: 'bad_url', detail: 'Must be root-relative (/path) or absolute https://…' });

  const now = nowSec();
  // A shared ('') row with the same name would shadow this one on lookup only
  // if it sorted later, so upsert against the project's own row explicitly and
  // let the ordering in buildAliasMap() put project rows on top.
  await env.DB.prepare(
    `INSERT INTO site_aliases (id, project_id, name, url, description, kind, created_at, updated_at)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 'manual', ?, ?)
     ON CONFLICT(project_id, name) DO UPDATE SET
       url = excluded.url,
       description = excluded.description,
       kind = 'manual',
       updated_at = excluded.updated_at`
  ).bind(pid || '', name, u, desc || null, now, now).run();
  await audit(env, 'admin', 'aliases.upsert', name, JSON.stringify({ url: u, project_id: pid }));
  return json(200, { ok: true, name });
};

export const onRequestPatch = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const pid = await tenantOf(env, request);
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }
  const name = String(body?.name || '').trim().toLowerCase();
  if (!name) return json(400, { error: 'missing_name' });
  if (RESERVED_NAMES.includes(name)) return json(409, { error: 'reserved_name' });

  const sets = [];
  const args = [];
  if (body.url !== undefined) {
    if (!validUrl(body.url)) return json(400, { error: 'bad_url' });
    sets.push('url = ?'); args.push(body.url.trim());
  }
  if (body.description !== undefined) {
    sets.push('description = ?'); args.push(String(body.description || '').trim().slice(0, 300) || null);
  }
  if (!sets.length) return json(400, { error: 'nothing_to_update' });
  sets.push('updated_at = ?'); args.push(nowSec());

  // Only this project's own row is patchable — a shared/legacy row belongs to
  // nobody in particular, so editing it would silently affect every tenant.
  const r = await env.DB.prepare(
    `UPDATE site_aliases SET ${sets.join(', ')} WHERE name = ? AND project_id = ?`
  ).bind(...args, name, pid || '').run();
  if (!r?.meta?.changes) return json(404, { error: 'not_found_or_shared' });
  await audit(env, 'admin', 'aliases.update', name, JSON.stringify({ project_id: pid }));
  return json(200, { ok: true });
};

export const onRequestDelete = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const pid = await tenantOf(env, request);
  const name = (new URL(request.url).searchParams.get('name') || '').toLowerCase();
  if (!name) return json(400, { error: 'missing_name' });
  if (RESERVED_NAMES.includes(name)) return json(409, { error: 'reserved_name' });

  const r = await env.DB.prepare(
    `DELETE FROM site_aliases WHERE name = ? AND kind = 'manual' AND project_id = ?`
  ).bind(name, pid || '').run();
  if (!r?.meta?.changes) return json(404, { error: 'not_found_or_not_manual' });
  await audit(env, 'admin', 'aliases.delete', name, JSON.stringify({ project_id: pid }));
  return json(200, { ok: true });
};
