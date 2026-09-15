// Internal link aliases the AI is told about. The prompt mentions these by
// name; the sanitiser expands them at insert time.
//
// Aliases are PROJECT-SCOPED (migration 002). Without that, buildAliasMap()
// returned every row to every project, so the AI writing for project A was
// told it could link to project B's pages — a cross-tenant content leak, not
// just a cosmetic one.
//
// Rows in the `site_aliases` table:
//   project_id = '<id>'  owned by that project
//   project_id = ''      shared/legacy — copied forward by migration 002 from
//                        the pre-scoping table, visible to every project so
//                        existing installs keep working until re-synced
//
//   kind = 'manual'   operator-curated (login → /login, "user sign-in")
//   kind = 'sitemap'  auto-imported from published blog / prog pages
//
// On lookup, manual wins if both rows share the same name.

import { nowSec } from '../util.js';

// Reserved names — protected pages every install owns. We always include them
// with sensible defaults so the LLM has a baseline vocabulary even when the
// operator hasn't curated anything yet.
const RESERVED = {
  blog:    { url: '/blog',         description: 'The main blog index of this site.' },
  home:    { url: '/',             description: 'The homepage of this site.' },
  rss:     { url: '/feed.xml',     description: 'The RSS feed.' },
  sitemap: { url: '/sitemap.xml',  description: 'The XML sitemap.' },
};

export const RESERVED_NAMES = Object.keys(RESERVED);

// Which rows may a given project see? Its own, plus the shared ('') rows that
// predate scoping. With no projectId (single-tenant callers) everything is
// visible, preserving the old behaviour.
function scopeClause(projectId, alias = '') {
  const col = alias ? `${alias}.project_id` : 'project_id';
  return projectId ? `(${col} = ? OR ${col} = '')` : '1=1';
}

function scopeArgs(projectId) {
  return projectId ? [projectId] : [];
}

// Build the resolved alias map for a project.
//   { name: { url, description, kind } }
// Order of precedence (later overrides earlier):
//   reserved → shared rows → project rows
export async function buildAliasMap(env, projectId = null) {
  const map = Object.fromEntries(
    Object.entries(RESERVED).map(([k, v]) => [k, { ...v, kind: 'reserved' }])
  );
  if (!env?.DB) return map;

  const r = await env.DB.prepare(
    `SELECT name, url, description, kind, project_id FROM site_aliases
      WHERE ${scopeClause(projectId)}
      ORDER BY
        CASE kind WHEN 'sitemap' THEN 1 WHEN 'manual' THEN 2 ELSE 3 END,
        CASE WHEN project_id = '' THEN 0 ELSE 1 END`
  ).bind(...scopeArgs(projectId)).all().catch(() => ({ results: [] }));

  for (const row of (r.results || [])) {
    map[String(row.name || '').toLowerCase()] = {
      url: row.url,
      description: row.description || '',
      kind: row.kind || 'manual',
    };
  }
  return map;
}

// Flat { name: url } shape — keeps the existing sanitiser happy.
export async function buildAliases(env, projectId = null) {
  const m = await buildAliasMap(env, projectId);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.url]));
}

// Human-readable list for inclusion in the AI prompt. Includes the
// description column so the LLM knows what each link is for.
export async function aliasesForPrompt(env, projectId = null) {
  const m = await buildAliasMap(env, projectId);
  return Object.entries(m).map(([name, v]) => {
    const desc = v.description ? ` — ${v.description}` : '';
    return `- "${name}" → ${v.url}${desc}`;
  }).join('\n');
}

// Refresh the sitemap-kind rows for one project from its published content.
// Removes stale entries (hidden/deleted posts) and adds new ones with a
// generated short description. Manual rows are untouched, and other projects'
// rows are never read or written.
export async function syncSitemapAliases(env, projectId = null) {
  if (!env?.DB) return { added: 0, removed: 0 };
  const now = nowSec();
  const pid = projectId || '';
  const postScope = projectId ? 'AND project_id = ?' : '';
  const postArgs = projectId ? [projectId] : [];

  const [posts, progs, existing] = await Promise.all([
    env.DB.prepare(
      `SELECT slug, title, meta_description FROM blog_posts
        WHERE status='published' ${postScope}
        ORDER BY published_at DESC LIMIT 500`
    ).bind(...postArgs).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT slug, title, meta_description FROM prog_pages
        WHERE status='published' ${postScope}
        ORDER BY published_at DESC LIMIT 500`
    ).bind(...postArgs).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT name FROM site_aliases WHERE kind='sitemap' AND project_id = ?`
    ).bind(pid).all().catch(() => ({ results: [] })),
  ]);

  // Desired set of sitemap-kind rows. Name is the slug (lowercased).
  // If a slug collides with a manual row, the manual row wins on lookup so
  // it's safe to insert ours.
  const desired = new Map();
  for (const p of (posts.results || [])) {
    const name = String(p.slug || '').toLowerCase();
    if (!name) continue;
    desired.set(name, {
      url: `/blog/${p.slug}`,
      description: `Blog post: ${(p.meta_description || p.title || '').slice(0, 160)}`,
    });
  }
  for (const p of (progs.results || [])) {
    const name = String(p.slug || '').toLowerCase();
    if (!name) continue;
    if (desired.has(name)) continue;
    desired.set(name, {
      url: `/p/${p.slug}`,
      description: `Landing page: ${(p.meta_description || p.title || '').slice(0, 160)}`,
    });
  }

  const existingNames = new Set((existing.results || []).map((r) => r.name));
  const desiredNames = new Set(desired.keys());

  const toAdd = [...desiredNames].filter((n) => !existingNames.has(n));
  const toRemove = [...existingNames].filter((n) => !desiredNames.has(n));

  const batch = [];
  for (const name of toAdd) {
    const v = desired.get(name);
    batch.push(env.DB.prepare(
      `INSERT INTO site_aliases (id, project_id, name, url, description, kind, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 'sitemap', ?, ?)
       ON CONFLICT(project_id, name) DO UPDATE SET
         url = excluded.url,
         description = excluded.description,
         updated_at = excluded.updated_at
       WHERE site_aliases.kind = 'sitemap'`
    ).bind(pid, name, v.url, v.description, now, now));
  }
  if (toRemove.length) {
    const placeholders = toRemove.map(() => '?').join(',');
    batch.push(env.DB.prepare(
      `DELETE FROM site_aliases
        WHERE kind='sitemap' AND project_id = ? AND name IN (${placeholders})`
    ).bind(pid, ...toRemove));
  }
  if (batch.length) await env.DB.batch(batch);
  return { added: toAdd.length, removed: toRemove.length, total: desired.size };
}

export { RESERVED };
