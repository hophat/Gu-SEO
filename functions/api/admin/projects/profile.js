// PATCH /api/admin/projects/profile — the active project's public identity.
//
// Registration deliberately collects only email/OTP/password and derives a
// provisional name from the email local part, so the real brand name and
// website are captured here, by the setup wizard, where the website can
// actually be read and turned into Brand DNA.
//
// Any admin may edit their own project's identity (it is their brand), unlike
// project CRUD which is super_admin only.
//
// Slug is the public URL segment, so it is only changeable while the project
// has never published. Once a post exists the slug is in inbound links, the
// sitemap and the AI's link aliases — renaming it silently would 404 all of
// them. To change it after publishing you need a redirect, which this endpoint
// deliberately does not pretend to do.

import { json, slugify, audit } from '../../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';

const MAX_NAME = 120;

// GET — the active project's public identity. The wizard prefills its first
// step from this (the name registration derived from the email, plus any
// website already on file).
export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(200, { ok: true, project: null });

  const project = await env.DB.prepare(
    `SELECT p.id, p.slug, p.name, p.website_url, p.site_name, p.publishing_url, p.custom_domain,
            (SELECT COUNT(*) FROM blog_posts b WHERE b.project_id = p.id AND b.status = 'published') AS published_posts
       FROM projects p WHERE p.id = ? LIMIT 1`
  ).bind(pid).first().catch(() => null);

  return json(200, { ok: true, project });
};

export const onRequestPatch = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(400, { error: 'missing_project' });

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const project = await env.DB.prepare(
    'SELECT id, slug, name, website_url, site_name, publishing_url, custom_domain FROM projects WHERE id = ? LIMIT 1'
  ).bind(pid).first().catch(() => null);
  if (!project) return json(404, { error: 'project_not_found' });

  const sets = [];
  const args = [];

  if (body.name != null) {
    const name = String(body.name).trim().slice(0, MAX_NAME);
    if (!name) return json(400, { error: 'empty_name' });
    // site_name drives public branding (widget title, OG tags) so it moves with
    // the name unless the caller is explicitly setting it separately.
    sets.push('name = ?', 'site_name = ?');
    args.push(name, name);
  }

  if (body.website_url != null) {
    const url = String(body.website_url).trim();
    if (url && !/^https?:\/\/.+/i.test(url)) {
      return json(400, { error: 'bad_url', detail: 'URL phải bắt đầu bằng http:// hoặc https://' });
    }
    sets.push('website_url = ?');
    args.push(url);
  }

  if (body.slug != null) {
    const next = slugify(String(body.slug));
    if (!next) return json(400, { error: 'bad_slug' });
    if (next !== project.slug) {
      const published = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM blog_posts WHERE project_id = ? AND status = 'published'"
      ).bind(pid).first().catch(() => ({ n: 0 }));
      if ((published?.n || 0) > 0) {
        return json(409, {
          error: 'slug_locked',
          detail: 'Dự án đã có bài xuất bản — đổi slug sẽ làm hỏng link cũ. Dùng tên miền riêng thay vì đổi slug.',
        });
      }
      const taken = await env.DB.prepare('SELECT id FROM projects WHERE slug = ? AND id != ? LIMIT 1')
        .bind(next, pid).first().catch(() => null);
      if (taken) return json(409, { error: 'slug_taken' });

      sets.push('slug = ?');
      args.push(next);
      // publishing_url encodes the slug on a shared host; keep it consistent.
      const origin = (() => { try { return new URL(project.publishing_url || '').origin; } catch { return ''; } })();
      if (origin) { sets.push('publishing_url = ?'); args.push(`${origin}/${next}`); }
    }
  }

  if (!sets.length) return json(400, { error: 'nothing_to_update' });

  sets.push('updated_at = ?');
  args.push(Math.floor(Date.now() / 1000));
  args.push(pid);

  await env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  audit(env, 'admin', 'project_profile_update', pid, JSON.stringify({ fields: Object.keys(body) }));

  const updated = await env.DB.prepare(
    'SELECT id, slug, name, website_url, site_name, publishing_url, custom_domain FROM projects WHERE id = ? LIMIT 1'
  ).bind(pid).first();
  return json(200, { ok: true, project: updated });
};
