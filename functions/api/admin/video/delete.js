// Delete a video job AND its R2 object. Also cancels any pending
// facebook_video social job for the same post — otherwise the cron
// would try to upload an MP4 that no longer exists and fail 5 times.
// Published social posts are left alone: the copy on Facebook is out
// of our hands once shipped.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const jobId = String(body?.id || body?.job_id || '');
  if (!jobId) return json(400, { error: 'missing_job_id' });

  const job = await env.DB.prepare(
    'SELECT id, project_id, blog_post_id, slug, status, video_key FROM video_jobs WHERE id = ? LIMIT 1'
  ).bind(jobId).first();
  if (!job) return json(404, { error: 'job_not_found' });

  // R2 first: if the DB delete then fails, the job row still points at a
  // missing object and the operator can retry the delete. The reverse
  // order would strand an orphaned MP4 with no row pointing at it.
  if (job.video_key && env.IMAGES) {
    try { await env.IMAGES.delete(job.video_key); } catch (e) {
      return json(500, { error: 'r2_delete_failed', detail: String(e?.message || e).slice(0, 200) });
    }
  }

  // Pending facebook_video jobs for this post would upload a ghost —
  // skip them instead.
  await env.DB.prepare(
    `UPDATE social_posts SET status = 'skipped', updated_at = ?
      WHERE blog_post_id = ? AND channel = 'facebook_video' AND status IN ('pending','failed')`
  ).bind(nowSec(), job.blog_post_id).run().catch(() => {});

  await env.DB.prepare('DELETE FROM video_jobs WHERE id = ?').bind(jobId).run();
  audit(env, 'admin', 'video.delete', job.blog_post_id, { slug: job.slug, video_key: job.video_key || null });

  return json(200, { ok: true, deleted: jobId, r2_deleted: !!job.video_key });
};
