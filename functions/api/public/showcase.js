// GET /api/public/showcase
//
// Public conversion proof for the landing page. Only active projects with a
// live custom domain are eligible. Responses expose published article metadata,
// completed non-carousel video URLs, and public brand fields — never account,
// email, user, project ID, billing, or internal job data.
import { json } from '../../_lib/util.js';

const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PUBLIC_PROJECT_FILTER = `
  p.status = 'active'
  AND p.custom_domain IS NOT NULL
  AND TRIM(p.custom_domain) != ''
  AND COALESCE(p.custom_domain_status, 'live') = 'live'
`;

function publicDomain(value) {
  let host = String(value || '').trim().toLowerCase();
  if (!host) return null;
  try {
    if (host.includes('://')) host = new URL(host).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.split('/')[0].split(':')[0].replace(/\.$/, '');
  if (!HOST_PATTERN.test(host)) return null;
  return host;
}

function publicAssetPath(value) {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  try {
    const url = new URL(raw, 'https://public.invalid');
    if (url.origin !== 'https://public.invalid') return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function storagePath(value) {
  const raw = String(value || '').trim().replaceAll('\\', '/').replace(/^\/+/, '');
  if (!raw || raw.includes('..') || !/^[a-z0-9/_.-]+$/i.test(raw)) return null;
  return `/image/${raw.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

function text(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function shopFromRow(row) {
  const domain = publicDomain(row?.custom_domain);
  if (!domain) return null;
  const name = text(row?.site_name || row?.name || row?.slug, 100) || domain;
  return {
    name,
    domain,
    url: `https://${domain}/`,
    logo_url: publicAssetPath(row?.logo_url),
    description: text(row?.site_description, 180),
    blog_count: Number(row?.blog_count || 0),
    video_count: Number(row?.video_count || 0),
  };
}

function diversify(rows, limit, maxPerShop) {
  const groups = new Map();
  for (const row of rows) {
    const key = row?.shop?.domain || row?.custom_domain;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const selected = [];
  const usedByShop = new Map();
  let added = true;
  while (selected.length < limit && added) {
    added = false;
    for (const bucket of groups.values()) {
      if (selected.length >= limit) break;
      const row = bucket.shift();
      if (!row) continue;
      const key = row?.shop?.domain || row?.custom_domain;
      const used = usedByShop.get(key) || 0;
      if (used >= maxPerShop) continue;
      selected.push(row);
      usedByShop.set(key, used + 1);
      added = true;
    }
  }

  if (selected.length < limit) {
    const chosen = new Set(selected);
    for (const row of rows) {
      if (selected.length >= limit) break;
      if (!chosen.has(row)) {
        selected.push(row);
        chosen.add(row);
      }
    }
  }
  return selected;
}

export const onRequestGet = async ({ env }) => {
  if (!env?.DB) {
    return json(200, {
      ok: true,
      available: false,
      shops: [],
      posts: [],
      videos: [],
    }, {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    });
  }

  try {
    const shopResult = await env.DB.prepare(
      `SELECT
         p.slug,
         p.name,
         p.site_name,
         p.custom_domain,
         p.site_description,
         p.logo_url,
         (SELECT COUNT(*)
            FROM blog_posts bp
           WHERE bp.project_id = p.id AND bp.status = 'published') AS blog_count,
         (SELECT COUNT(*)
            FROM video_jobs v
           WHERE v.project_id = p.id
             AND v.status = 'done'
             AND v.video_key IS NOT NULL
             AND TRIM(v.video_key) != ''
             AND v.kind != 'carousel') AS video_count
       FROM projects p
       WHERE ${PUBLIC_PROJECT_FILTER}
       ORDER BY (blog_count + video_count) DESC,
                COALESCE(p.updated_at, p.created_at) DESC
       LIMIT 24`
    ).all();

    const postResult = await env.DB.prepare(
      `SELECT
         bp.title,
         bp.slug,
         bp.meta_description,
         bp.published_at,
         bp.hero_image_key,
         p.site_name,
         p.name,
         p.custom_domain
       FROM blog_posts bp
       JOIN projects p ON p.id = bp.project_id
       WHERE bp.status = 'published'
         AND ${PUBLIC_PROJECT_FILTER}
       ORDER BY bp.published_at DESC
       LIMIT 60`
    ).all();

    const videoResult = await env.DB.prepare(
      `SELECT
         v.kind,
         v.slug,
         v.video_key,
         v.updated_at,
         bp.title AS post_title,
         bp.slug AS post_slug,
         bp.hero_image_key AS poster_key,
         p.site_name,
         p.name,
         p.custom_domain
       FROM video_jobs v
       JOIN projects p ON p.id = v.project_id
       LEFT JOIN blog_posts bp
         ON bp.id = v.blog_post_id AND bp.status = 'published'
       WHERE v.status = 'done'
         AND v.video_key IS NOT NULL
         AND TRIM(v.video_key) != ''
         AND v.kind != 'carousel'
         AND (v.kind != 'post' OR bp.id IS NOT NULL)
         AND ${PUBLIC_PROJECT_FILTER}
       ORDER BY v.updated_at DESC
       LIMIT 30`
    ).all();

    const shops = (shopResult.results || [])
      .map((row) => shopFromRow(row))
      .filter(Boolean);

    const postCandidates = (postResult.results || []).flatMap((row) => {
      const domain = publicDomain(row.custom_domain);
      const slug = text(row.slug, 180);
      if (!domain || !slug) return [];
      const shop = {
        name: text(row.site_name || row.name, 100) || domain,
        domain,
        url: `https://${domain}/`,
      };
      return [{
        title: text(row.title, 180),
        slug,
        excerpt: text(row.meta_description, 260),
        published_at: Number(row.published_at || 0),
        image_url: storagePath(row.hero_image_key),
        url: `https://${domain}/blog/${encodeURIComponent(slug)}`,
        shop,
        custom_domain: domain,
      }];
    });

    const videoCandidates = (videoResult.results || []).flatMap((row) => {
      const domain = publicDomain(row.custom_domain);
      const videoUrl = storagePath(row.video_key);
      if (!domain || !videoUrl) return [];
      const postSlug = text(row.post_slug || row.slug, 180);
      const shop = {
        name: text(row.site_name || row.name, 100) || domain,
        domain,
        url: `https://${domain}/`,
      };
      return [{
        title: text(row.post_title || row.slug, 180) || shop.name,
        kind: text(row.kind, 30) || 'post',
        video_url: videoUrl,
        poster_url: storagePath(row.poster_key),
        published_at: Number(row.updated_at || 0),
        url: postSlug
          ? `https://${domain}/blog/${encodeURIComponent(postSlug)}`
          : shop.url,
        shop,
        custom_domain: domain,
      }];
    });

    const posts = diversify(postCandidates, 10, 2)
      .map(({ custom_domain, ...post }) => post);
    const videos = diversify(videoCandidates, 5, 1)
      .map(({ custom_domain, ...video }) => video);

    return json(200, {
      ok: true,
      available: true,
      shops,
      posts,
      videos,
    }, {
      'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
      'access-control-allow-origin': '*',
    });
  } catch (error) {
    console.error('public_showcase_failed', error instanceof Error ? error.message : 'unknown_error');
    return json(500, {
      ok: false,
      available: false,
      error: 'showcase_unavailable',
      shops: [],
      posts: [],
      videos: [],
    }, {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
  }
};
