// Manual posting from the Video and Carousel pages — the "Đăng FB",
// "Đăng Thread" and "Đăng YT" row buttons. Enqueues a social job for a
// rendered video or carousel and drains it immediately, so the operator
// sees the result in one click instead of waiting for the next cron
// tick. Reuses the durable queue: retry/backoff, needs_reconnect and
// idempotency all come for free.
import { json, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { enqueueSocialPost, drainSocialQueue } from '../../../_lib/publishing/social_queue.js';
import { postIdFromRef, isCarouselRef, isCarouselKey } from '../../../_lib/video_jobs.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const jobId = String(body?.id || body?.job_id || '');
  if (!jobId) return json(400, { error: 'missing_job_id' });

  // Threads publishes a text post with the article link, so it takes the
  // plain `threads` channel — the same one the article fan-out uses, and
  // the same row in social_posts that the queue dedupes on.
  const requestedChannel = String(body?.channel ?? 'facebook').trim().toLowerCase();
  const channel = (requestedChannel === 'youtube' || requestedChannel === 'youtube_video')
    ? 'youtube_video'
    : (requestedChannel === 'facebook' || requestedChannel === 'facebook_video')
      ? 'facebook_video'
      : (requestedChannel === 'threads' || requestedChannel === 'threads_video')
        ? 'threads'
        : null;
  if (!channel) {
    return json(400, { error: 'unknown_channel', channel: requestedChannel });
  }

  const job = await env.DB.prepare(
    'SELECT id, project_id, blog_post_id, kind, slug, status, video_key FROM video_jobs WHERE id = ? LIMIT 1'
  ).bind(jobId).first();
  if (!job) return json(404, { error: 'job_not_found' });
  if (job.status !== 'done' || !job.video_key) {
    return json(409, { error: 'video_not_ready', status: job.status });
  }
  if (!job.project_id) return json(400, { error: 'project_missing' });
  if (channel === 'youtube_video' && !postIdFromRef(job.blog_post_id)) {
    return json(400, { error: 'youtube_requires_blog_post', detail: 'YouTube chỉ nhận video tạo từ bài viết.' });
  }
  if (channel === 'youtube_video' && (isCarouselRef(job.blog_post_id) || job.kind === 'carousel' || isCarouselKey(job.video_key))) {
    return json(400, { error: 'youtube_requires_mp4_blog_post', detail: 'YouTube chỉ nhận video tạo từ bài viết.' });
  }

  // `repost: true` — this is a human pressing the button. A video that was
  // posted once, or whose automatic enqueue was missed, must be postable
  // again; only a job actually in flight is refused.
  const q = await enqueueSocialPost(env, {
    projectId: job.project_id, blogPostId: job.blog_post_id, channel, repost: true,
  });
  if (!q.enqueued) {
    return json(409, { error: 'already_enqueued', hint: 'Video này đang được đăng — xem tab Bài đăng mạng xã hội.' });
  }
  audit(env, 'admin', 'video.publish_manual', job.blog_post_id, { channel, job_id: jobId });

  // YouTube sends bounded R2 chunks and can outlive the browser request.
  // Queue it and let the social cron own the transfer.
  if (channel === 'youtube_video') {
    return json(200, { ok: true, enqueued: true, posted: false, pending: true, channel });
  }

  // Facebook and Threads are small enough to drain immediately; the cron is
  // the backstop. Threads adds a 3s settle wait before publish, which still
  // fits well inside a request.
  let drained;
  try {
    drained = await drainSocialQueue(env, { projectId: job.project_id, limit: 5 });
  } catch (error) {
    return json(502, { error: 'social_drain_failed', detail: String(error?.message || error).slice(0, 200) });
  }
  const mine = q.id ? (drained?.results || []).find((item) => item.id === q.id) : null;

  return json(200, {
    ok: true,
    enqueued: true,
    posted: !!mine?.ok,
    result: mine || null,
    channel,
  });
};
