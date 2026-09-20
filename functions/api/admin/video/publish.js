// Manual video posting — the admin "Đăng Facebook" button on the Video
// page. Enqueues a facebook_video social job for a rendered video and
// drains it immediately, so the operator sees the result in one click
// instead of waiting for the next cron tick. Reuses the durable queue:
// retry/backoff, needs_reconnect and idempotency all come for free.
import { json, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { enqueueSocialPost, drainSocialQueue } from '../../../_lib/publishing/social_queue.js';

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
  if (job.status !== 'done' || !job.video_key) {
    return json(409, { error: 'video_not_ready', status: job.status });
  }
  if (!job.project_id) return json(400, { error: 'project_missing' });

  const q = await enqueueSocialPost(env, {
    projectId: job.project_id, blogPostId: job.blog_post_id, channel: 'facebook_video',
  });
  if (!q.enqueued) {
    return json(409, { error: 'already_enqueued', hint: 'Bài này đã có job đăng video — xem tab Bài đăng mạng xã hội.' });
  }
  audit(env, 'admin', 'video.publish_manual', job.blog_post_id, { channel: 'facebook_video', job_id: jobId });

  // Drain immediately so the button feels instant; the cron is the backstop.
  const drained = await drainSocialQueue(env, { projectId: job.project_id, limit: 5 }).catch(() => ({ processed: 0, results: [] }));
  const mine = (drained.results || []).find((r) => r.id && r.ok !== undefined);

  return json(200, {
    ok: true,
    enqueued: true,
    posted: !!drained?.processed,
    result: drained?.results?.[0] || null,
  });
};
