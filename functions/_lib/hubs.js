// Hub-and-spoke spine for the programmatic archive.
//
// Every published post carries `topic_seed` — the keyword the generator
// started from. Grouping the archive by that seed turns a flat list of N
// pages into clusters, each with one /hubs/<pillar> index that links down
// to its entries while every entry links back up. That two-way topology
// is what makes an archive read as a structure instead of a scraper dump.
//
// No new table: `topic_seed` already exists on blog_posts and is already
// what internal_links.js orders its link-target pool by. A pillar is just
// a distinct topic_seed, so the hub and the link injector can never drift
// apart — both read the same column.

// Vietnamese folding before the ASCII filter: NFD does not decompose
// đ, so it has to be mapped by hand or every seeded post collapses into
// the same "-d" slug.
export function pillarSlug(seed) {
  return String(seed || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '') || 'general';
}

// Seed strings are keyword-shaped ("phan-mem-may-in-anh") or already
// human ("Phân mềm máy in ảnh"). Either way the label is the seed with
// separators turned back into spaces.
export function pillarLabel(seed) {
  const words = String(seed || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return 'Chung';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const PILLAR_SQL = `SELECT topic_seed AS seed, COUNT(*) AS n FROM blog_posts
   WHERE status = 'published' AND topic_seed IS NOT NULL AND topic_seed <> ''`;

// One grouped query gives every pillar and its size. Ordering is
// deterministic (size, then seed) because the numeric suffix on a
// colliding slug depends on it — a reshuffled list would orphan URLs
// that are already in the sitemap.
export async function listPillars(env, projectId = null) {
  if (!env?.DB) return [];
  const sql = projectId
    ? `${PILLAR_SQL} AND project_id = ? GROUP BY topic_seed ORDER BY n DESC, topic_seed ASC`
    : `${PILLAR_SQL} GROUP BY topic_seed ORDER BY n DESC, topic_seed ASC`;
  const stmt = projectId ? env.DB.prepare(sql).bind(projectId) : env.DB.prepare(sql);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  const seen = new Map();
  return (results || []).map((r) => {
    let slug = pillarSlug(r.seed);
    if (seen.has(slug)) {
      const n = seen.get(slug) + 1;
      seen.set(slug, n);
      slug = `${slug}-${n}`;
    } else {
      seen.set(slug, 1);
    }
    return { slug, seed: r.seed, label: pillarLabel(r.seed), count: r.n };
  });
}

// Slug -> seed has to travel through listPillars, because the collision
// suffix is positional. Resolving any other way would 404 on the second
// post of a two-seed collision.
export async function resolvePillar(env, slug, projectId = null) {
  if (!slug) return null;
  const wanted = String(slug).toLowerCase();
  const pillars = await listPillars(env, projectId);
  return pillars.find((p) => p.slug === wanted) || null;
}

export async function loadHubEntries(env, pillar, { limit = 50, offset = 0, projectId = null } = {}) {
  if (!env?.DB || !pillar) return [];
  const base = `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
      FROM blog_posts WHERE status = 'published' AND topic_seed = ?`;
  const sql = projectId
    ? `${base} AND project_id = ? ORDER BY published_at DESC LIMIT ? OFFSET ?`
    : `${base} ORDER BY published_at DESC LIMIT ? OFFSET ?`;
  const stmt = projectId
    ? env.DB.prepare(sql).bind(pillar.seed, projectId, limit, offset)
    : env.DB.prepare(sql).bind(pillar.seed, limit, offset);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return results || [];
}
