// Video agent — deliver a rendered MP4 for a claimed video job.
//
// The agent POSTs the raw MP4 as the request body with the job id in the
// X-Video-Job header. We sniff the bytes (never trust the extension),
// store to R2 under video/<slug>-<ts>.mp4, and flip the job to done.
// A failure report (JSON body, X-Video-Failure: 1) marks the job failed
// with the agent's error text so the operator can see why nothing shipped.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

// Social platforms cap uploads well below this; anything larger is a
// render bug, not something we should store.
const MAX_BYTES = 100 * 1024 * 1024;

export const onRequestPost = async ({ env, request }) => {
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

  return json(200, { ok: true, status: 'done', video_key: key, bytes: bytes.length });
};
