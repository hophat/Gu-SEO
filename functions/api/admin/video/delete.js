// Delete a video job AND its R2 object. Also cancels pending Facebook/YouTube
// social jobs for the same post — otherwise cron would try to upload an MP4
// that no longer exists and fail 5 times.
// Published social posts are left alone: the copy on Facebook is out
// of our hands once shipped.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { isCarouselKey, carouselSlideRegex } from '../../../_lib/video_jobs.js';

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
  //
  // A carousel's video_key is only the slide prefix (carousel/<slug>); the
  // pixels live at carousel/<slug>-1..N.png. Deleting the bare key would
  // miss every slide and silently leak them, so remove the whole set.
  if (job.video_key && env.IMAGES) {
    try {
      if (isCarouselKey(job.video_key)) {
        // Only <prefix>-N.png is a slide — carouselSlideRegex rules out a
        // slug that is a prefix of this one (carousel/foo-X.png).
        const prefix = job.video_key;
        const slideRe = carouselSlideRegex(prefix);
        const listed = await env.IMAGES.list({ prefix });
        for (const o of listed?.objects || []) if (slideRe.test(o.key)) await env.IMAGES.delete(o.key);
      } else {
        await env.IMAGES.delete(job.video_key);
      }
    } catch (e) {
      return json(500, { error: 'r2_delete_failed', detail: String(e?.message || e).slice(0, 200) });
    }
  }

  // Pending external uploads would try to read an R2 object that no longer
  // exists. Clear both video-channel rows and their resumable checkpoints.
  await env.DB.prepare(
    `UPDATE social_posts SET status = 'skipped', updated_at = ?
      WHERE blog_post_id = ? AND channel IN ('facebook_video', 'youtube_video')
        AND status IN ('pending','failed')`
  ).bind(nowSec(), job.blog_post_id).run();
  await env.DB.prepare(
    `DELETE FROM youtube_uploads WHERE social_post_id IN (
       SELECT id FROM social_posts
        WHERE blog_post_id = ? AND channel = 'youtube_video'
      )`
  ).bind(job.blog_post_id).run();

  await env.DB.prepare('DELETE FROM video_jobs WHERE id = ?').bind(jobId).run();
  audit(env, 'admin', 'video.delete', job.blog_post_id, { slug: job.slug, video_key: job.video_key || null });

  return json(200, { ok: true, deleted: jobId, r2_deleted: !!job.video_key });
};
