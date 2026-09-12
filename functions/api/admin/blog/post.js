// POST { id, action: 'hide' | 'show' | 'delete' }
import { json, nowSec } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';

export const onRequestPost = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }
  const id = String(body.id || '').trim();
  const action = String(body.action || '').trim();
  if (!id || !action) return json(400, { error: 'missing_fields' });
  const owned = pid
    ? await env.DB.prepare(
        'SELECT id, slug, hero_image_key, status FROM blog_posts WHERE id=? AND project_id=? LIMIT 1'
      ).bind(id, pid).first()
    : await env.DB.prepare(
        'SELECT id, slug, hero_image_key, status FROM blog_posts WHERE id=? LIMIT 1'
      ).bind(id).first();
  if (!owned) return json(404, { error: 'not_found' });
  const post = owned;
  const t = nowSec();
  if (action === 'hide') {
    await env.DB.prepare("UPDATE blog_posts SET status='hidden', hidden_at=? WHERE id=?").bind(t, id).run();
    return json(200, { ok: true, status: 'hidden' });
  }
  if (action === 'show') {
    await env.DB.prepare("UPDATE blog_posts SET status='published', hidden_at=NULL WHERE id=?").bind(id).run();
    return json(200, { ok: true, status: 'published' });
  }
  if (action === 'delete') {
    if (post.hero_image_key && env.IMAGES) await env.IMAGES.delete(post.hero_image_key).catch(() => {});
    await env.DB.prepare('DELETE FROM blog_posts WHERE id=?').bind(id).run();
    return json(200, { ok: true, deleted: true });
  }
  return json(400, { error: 'unknown_action' });
};
