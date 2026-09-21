// Carousel slide delivery — the agent POSTs the exported slide PNGs as
// base64 JSON. Slides land in R2 under carousel/<slug>-<n>.jpg and the
// job flips to done with video_key = the carousel/<slug> prefix; the
// admin UI derives the slide URLs from that prefix (fixed 5 slides).
import { json, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

const MAX_SLIDES = 8;

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const jobId = String(body?.job_id || body?.id || '');
  if (!jobId) return json(400, { error: 'missing_job_id' });
  const slides = Array.isArray(body?.slides) ? body.slides : [];
  if (!slides.length) return json(400, { error: 'no_slides' });
  if (slides.length > MAX_SLIDES) return json(400, { error: 'too_many_slides', max: MAX_SLIDES });

  const job = await env.DB.prepare('SELECT * FROM video_jobs WHERE id = ? LIMIT 1').bind(jobId).first();
  if (!job) return json(404, { error: 'job_not_found' });
  if (job.status === 'done') {
    return json(200, { ok: true, idempotent: true, video_key: job.video_key });
  }

  // Decode + validate every slide before writing anything — a partial
  // carousel in R2 is worse than a failed delivery.
  const decoded = [];
  for (const [n, s] of slides.entries()) {
    try {
      const buf = Buffer.from(String(s), 'base64');
      // PNG magic: 89 50 4E 47. JPG would also be fine but the agent
      // exports PNGs from hyperframes snapshot.
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      if (!isPng || buf.length < 5000) throw new Error(`slide ${n + 1} không phải PNG hợp lệ`);
      decoded.push(buf);
    } catch (e) {
      return json(400, { error: 'bad_slide', detail: String(e?.message || e).slice(0, 120) });
    }
  }

  const prefix = `carousel/${job.slug || job.blog_post_id}`;
  const keys = [];
  for (const [n, buf] of decoded.entries()) {
    const key = `${prefix}-${n + 1}.png`;
    await env.IMAGES.put(key, new Uint8Array(buf), {
      httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
    });
    keys.push(key);
  }

  await env.DB.prepare(
    `UPDATE video_jobs SET status='done', video_key=?, error=NULL, updated_at=? WHERE id=?`
  ).bind(prefix, nowSec(), jobId).run();

  audit(env, 'video-agent', 'video.carousel_deliver', job.blog_post_id, { slug: job.slug, slides: keys.length });
  return json(200, { ok: true, status: 'done', prefix, slides: keys });
};
