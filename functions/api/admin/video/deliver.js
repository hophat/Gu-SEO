// Video agent — deliver a rendered MP4 for a claimed video job.
//
// The agent POSTs the raw MP4 as the request body with the job id in the
// X-Video-Job header. We sniff the bytes (never trust the extension),
// store to R2 under video/<slug>-<ts>.mp4, and flip the job to done.
// A failure report (JSON body) marks the job failed with the agent's
// error text so the operator can see why nothing shipped.
//
// After a successful delivery, two best-effort side effects run inside
// waitUntil: the automatic facebook_video enqueue (when the channel
// config has as_video) and the video-ready notification email.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { getProject } from '../../../_lib/projects.js';
import { listEnabledChannels } from '../../../_lib/channels.js';
import { enqueueSocialPost } from '../../../_lib/publishing/social_queue.js';
import { parseFacebookConfig } from '../../../_lib/publishing/facebook.js';
import { channelConfigFor } from '../../../_lib/publishing/publisher.js';
import { parseYoutubeConfig } from '../../../_lib/publishing/youtube.js';
import { postIdFromRef, isCarouselRef, isCarouselKey } from '../../../_lib/video_jobs.js';
import { sendVideoReadyEmail } from '../../../_lib/video_notify.js';

// Social platforms cap uploads well below this; anything larger is a
// render bug, not something we should store.
const MAX_BYTES = 100 * 1024 * 1024;

export const onRequestPost = async ({ env, request, context }) => {
  const gate = await adminGate(env, request); if (gate) return gate;

  const jobId = (request.headers.get('X-Video-Job') || '').trim();
  if (!jobId) return json(400, { error: 'missing_job_header' });

  const job = await env.DB.prepare('SELECT * FROM video_jobs WHERE id = ? LIMIT 1').bind(jobId).first();
  if (!job) return json(404, { error: 'job_not_found', job_id: jobId });
  if (job.status === 'done') {
    return json(200, { ok: true, idempotent: true, video_key: job.video_key });
  }

  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  const isFailure = contentType.includes('application/json');

  // ── failure report ────────────────────────────────────────────────
  if (isFailure) {
    let body = {};
    try { body = await request.json(); } catch { /* error stays generic */ }
    const detail = String(body?.error || 'unknown agent failure').slice(0, 500);
    await env.DB.prepare(
      `UPDATE video_jobs SET status='failed', error=?, attempts=attempts+1, updated_at=? WHERE id=?`
    ).bind('agent: ' + detail, nowSec(), jobId).run();
    await audit(env, 'video-agent', 'video.fail', job.blog_post_id, { slug: job.slug, error: detail });
    return json(200, { ok: true, status: 'failed' });
  }

  // ── MP4 delivery ──────────────────────────────────────────────────
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) {
    await env.DB.prepare(
      `UPDATE video_jobs SET status='failed', error=?, attempts=attempts+1, updated_at=? WHERE id=?`
    ).bind('deliver: empty body', nowSec(), jobId).run();
    return json(400, { error: 'empty_body' });
  }

  // Sniff ISO-BMFF: bytes 4-7 of a valid MP4 are the literal "ftyp".
  // Serving a broken file into the social queue is worse than failing
  // the delivery, so we validate instead of trusting the header.
  const magic = String.fromCharCode(...bytes.subarray(4, 8));
  if (magic !== 'ftyp') {
    await env.DB.prepare(
      `UPDATE video_jobs SET status='failed', error=?, attempts=attempts+1, updated_at=? WHERE id=?`
    ).bind('deliver: not an MP4 (missing ftyp box)', nowSec(), jobId).run();
    return json(400, { error: 'not_mp4' });
  }

  const key = `video/${job.slug || job.blog_post_id}-${Date.now()}.mp4`;
  await env.IMAGES.put(key, bytes, {
    httpMetadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000, immutable' },
  });

  await env.DB.prepare(
    `UPDATE video_jobs SET status='done', video_key=?, error=NULL, updated_at=? WHERE id=?`
  ).bind(key, nowSec(), jobId).run();

  await audit(env, 'video-agent', 'video.deliver', job.blog_post_id, { slug: job.slug, key, bytes: bytes.length });

  // Automatic Facebook posting: when the project's Facebook channel is
  // configured with as_video, a finished video enqueues its own
  // facebook_video social job (drained by the cron with retry/backoff).
  // Fire-and-forget semantics are fine — enqueueSocialPost is INSERT OR
  // IGNORE and a missed enqueue is recoverable via the manual button.
  try {
    const project = job.project_id ? await getProject(env, job.project_id) : null;
    const enabled = job.project_id ? await listEnabledChannels(env, job.project_id, { includeVideoOnly: true }) : [];
    const facebookEnabled = enabled.some((item) => item.channel === 'facebook');
    const fbCfg = project && facebookEnabled
      ? parseFacebookConfig(await channelConfigFor(env, project, 'facebook'))
      : {};
    if (fbCfg.asVideo && job.project_id) {
      const q = await enqueueSocialPost(env, {
        projectId: job.project_id, blogPostId: job.blog_post_id, channel: 'facebook_video',
      });
      if (q.enqueued) audit(env, 'video-agent', 'video.social_enqueued', job.blog_post_id, { channel: 'facebook_video' });
    }

    const youtubeEnabled = enabled.some((item) => item.channel === 'youtube');
    const youtubeCfg = project && youtubeEnabled
      ? parseYoutubeConfig(await channelConfigFor(env, project, 'youtube'))
      : {};
    if (youtubeCfg.asVideo && job.project_id
      && postIdFromRef(job.blog_post_id) && !isCarouselRef(job.blog_post_id)
      && !isCarouselKey(job.video_key) && job.kind !== 'carousel') {
      const q = await enqueueSocialPost(env, {
        projectId: job.project_id, blogPostId: job.blog_post_id, channel: 'youtube_video',
      });
      if (q.enqueued) audit(env, 'video-agent', 'video.social_enqueued', job.blog_post_id, { channel: 'youtube_video' });
    }
  } catch (error) {
    audit(env, 'video-agent', 'video.social_enqueue_failed', job.blog_post_id, {
      error: String(error?.message || error).slice(0, 300),
    });
  }

  // Video-ready email — same rules as the publish report: never fail the
  // delivery, recipients are the project owners, runs inside waitUntil
  // after the response has gone out.
  try {
    const origin = new URL(request.url).origin;
    const mail = sendVideoReadyEmail(env, { jobId, origin });
    if (context?.waitUntil) context.waitUntil(mail);
  } catch (error) {
    await audit(env, 'video-agent', 'video.notify_failed', job.blog_post_id, {
      error: String(error?.message || error).slice(0, 300),
    });
  }

  return json(200, { ok: true, status: 'done', video_key: key, bytes: bytes.length });
};
