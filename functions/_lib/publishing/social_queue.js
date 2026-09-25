// Durable queue for publishing a blog post to external networks.
//
// Why a queue instead of a direct call: the blog write and the social
// post are not one transaction. The old code fired the dispatch inside
// waitUntil(), so a dropped edge connection, a Facebook 5xx, or a rate
// limit lost the post with nothing but an audit line. Here the publish
// only enqueues (cheap, always succeeds), and the cron drains with retry,
// backoff and idempotency.
//
// Guarantees:
//   - At most one row per (blog_post_id, channel) — a retried publish
//     cannot double-post.
//   - A row is claimed with a conditional UPDATE, so two concurrent cron
//     ticks can't both send the same post.
//   - Credential failures stop retrying and raise needs_reconnect; the
//     operator fixes the token instead of watching it fail 5 times.

import { newId, nowSec } from '../util.js';
import { getProject } from '../projects.js';
import { dispatchPublication } from './publisher.js';
import { track } from '../events.js';
import { postIdFromRefSql, videoJobRefSql, postIdFromRef, isCarouselRef, isCarouselKey } from '../video_jobs.js';

const BASE_DELAY_SEC = 60;
const MAX_DELAY_SEC = 3600;

// 1m, 2m, 4m, 8m… capped at an hour.
export function backoffSec(attempts) {
  return Math.min(BASE_DELAY_SEC * 2 ** Math.max(0, attempts - 1), MAX_DELAY_SEC);
}

// Graph API codes that mean "a human must act", not "try again".
// 190 = invalid/expired token, 200/10 = missing permission.
export function isCredentialError(err) {
  const code = err?.graph?.code;
  if (code === 190 || code === 200 || code === 10) return true;
  const msg = String(err?.message || '');
  // X: 401 = bad/expired token, 403 = app permission or account state —
  // both pointless to retry until a human fixes the credential/grant.
  // The 429 rate limit is NOT here: retrying later is exactly right.
  if (err?.x_status === 401 || err?.x_status === 403) return true;
  if (err?.youtube_status === 401 || (err?.youtube_status === 403 && err?.youtube_credential)) return true;
  if (['invalid_grant', 'accessNotConfigured', 'forbidden', 'insufficientPermissions', 'youtube_token_invalid'].includes(err?.youtube_error_code)) return true;
  if (/youtube_(?:access_token_missing|refresh_token_missing|app_not_configured|token_(?:invalid|missing))/.test(msg)) return true;
  if (/\bX API lỗi \(HTTP 40[13]\)|Token X không hợp lệ|X từ chối đăng bài/.test(msg)) return true;
  return /token|quyền|permission/i.test(msg) && /hết hạn|không hợp lệ|chưa có quyền|not set|missing/i.test(msg);
}

const SOCIAL_COLUMNS = `(id, project_id, blog_post_id, channel, status, attempts, max_attempts, next_attempt_at, created_at, updated_at)`;
const SOCIAL_VALUES = `(?, ?, ?, ?, 'pending', 0, 5, ?, ?, ?)`;

// Channels that can post a rendered video or a carousel on their own, with no
// blog post row behind the job ref.
const ASSET_CHANNELS = new Set(['facebook_video', 'threads']);

// `repost` is for a HUMAN asking again — the admin "Đăng Facebook" button.
// Without it the UNIQUE(blog_post_id, channel) index makes "one row per post
// and channel" permanent, so a video that was posted once could never be
// posted again, and — the contradiction that caused this — the manual button
// could not recover a missed automatic enqueue, which is precisely what it
// exists for. A terminal row (published, skipped, failed) is reset to
// pending; a row that is genuinely in flight is left alone and reports
// `enqueued: false`. The automatic fan-out does not pass it, so a retried
// blog publish stays idempotent.
export async function enqueueSocialPost(env, { projectId, blogPostId, channel = 'facebook', repost = false }) {
  if (!env?.DB || !blogPostId) return { enqueued: false };
  const t = nowSec();
  const sql = repost
    ? `INSERT INTO social_posts ${SOCIAL_COLUMNS} VALUES ${SOCIAL_VALUES}
       ON CONFLICT(blog_post_id, channel) DO UPDATE SET
         status = 'pending', attempts = 0, next_attempt_at = excluded.next_attempt_at,
         error = NULL, needs_reconnect = 0,
         external_id = NULL, external_url = NULL, published_at = NULL,
         updated_at = excluded.updated_at
       WHERE social_posts.status IN ('published', 'skipped', 'failed')`
    : `INSERT OR IGNORE INTO social_posts ${SOCIAL_COLUMNS} VALUES ${SOCIAL_VALUES}`;
  const r = await env.DB.prepare(sql).bind(newId(), projectId || null, blogPostId, channel, t, t, t).run();
  let socialPostId = null;
  if (r?.meta?.changes && (repost || channel === 'youtube_video')) {
    const existing = await env.DB.prepare(
      'SELECT id FROM social_posts WHERE blog_post_id = ? AND channel = ? LIMIT 1'
    ).bind(blogPostId, channel).first();
    socialPostId = existing?.id || null;
    if (repost && channel === 'youtube_video' && socialPostId) {
      await env.DB.prepare('DELETE FROM youtube_uploads WHERE social_post_id = ?').bind(socialPostId).run();
    }
  }
  return { enqueued: !!r?.meta?.changes, id: socialPostId };
}

async function claimJob(env, id) {
  const t = nowSec();
  const r = await env.DB.prepare(
    `UPDATE social_posts
        SET status = 'publishing', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'failed')`
  ).bind(t, id).run().catch(() => null);
  return !!(r?.meta?.changes);
}

async function loadJobContext(env, id) {
  // Carousel jobs carry a sentinel blog_post_id so the UNIQUE index on
  // video_jobs(blog_post_id) stays with the post video; the social row
  // inherits it. Resolve the real post and the exact job ref via the shared
  // policy in functions/_lib/video_jobs.js.
  const row = await env.DB.prepare(
    `SELECT s.id, s.project_id, s.channel, s.attempts, s.max_attempts,
            s.blog_post_id,
            b.id AS post_id, b.slug, b.title, b.meta_description,
            b.body_markdown, b.hero_image_key, b.keywords, b.published_at,
            v.id AS video_job_id, v.slug AS video_slug, v.kind AS video_kind,
            v.source_url, v.video_key
       FROM social_posts s
       LEFT JOIN blog_posts b ON b.id = ${postIdFromRefSql('s.blog_post_id')}
       LEFT JOIN video_jobs v
         ON v.blog_post_id = ${videoJobRefSql('s.blog_post_id', 'b.id')}
        AND v.status = 'done'
      WHERE s.id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
  return row;
}

async function finishJob(env, id, fields) {
  const sets = [];
  const binds = [];
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); binds.push(v); }
  sets.push('updated_at = ?'); binds.push(nowSec());
  binds.push(id);
  await env.DB.prepare(`UPDATE social_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run().catch(() => {});
}

// Dispatch one job. Exported so the admin "Đăng lại" button can run a
// single job immediately instead of waiting for the next cron.
//
// `dispatch` is injectable so tests can exercise every branch (credential
// failure, transient failure, attempt exhaustion) deterministically without
// reaching Facebook.
export async function runSocialJob(env, id, { dispatch = dispatchPublication } = {}) {
  if (!(await claimJob(env, id))) return { ok: false, error: 'not_claimable' };

  const job = await loadJobContext(env, id);
  if (!job) {
    await finishJob(env, id, { status: 'failed', error: 'blog_post_missing' });
    return { ok: false, error: 'blog_post_missing' };
  }

  // A rendered video or a carousel carries its own ref ("video:<id>",
  // "carousel:<post_id>") instead of a blog post id. Channels that post the
  // asset itself — Facebook, and Threads with the article link as text —
  // can run without a post row; text-first channels cannot.
  if (!job.post_id && !ASSET_CHANNELS.has(job.channel)) {
    const error = job.channel === 'youtube_video'
      ? 'youtube_requires_mp4_blog_post'
      : 'blog_post_missing';
    await finishJob(env, id, {
      status: job.channel === 'youtube_video' ? 'skipped' : 'failed',
      error,
    });
    return { ok: false, error };
  }

  if (job.channel === 'youtube_video'
    && (!postIdFromRef(job.blog_post_id) || isCarouselRef(job.blog_post_id)
      || isCarouselKey(job.video_key) || job.video_kind === 'carousel')) {
    await finishJob(env, id, { status: 'skipped', error: 'youtube_requires_mp4_blog_post' });
    return { ok: false, error: 'youtube_requires_mp4_blog_post' };
  }

  const project = await getProject(env, job.project_id).catch(() => null);
  if (!project) {
    await finishJob(env, id, { status: 'failed', error: 'project_missing' });
    return { ok: false, error: 'project_missing' };
  }

  try {
    const res = await dispatch({
      project,
      article: {
        id: job.post_id || job.blog_post_id,
        slug: job.slug || job.video_slug || '',
        title: job.title || job.video_slug || project.site_name || 'Video',
        meta_description: job.meta_description || job.source_url || '',
        body_markdown: job.body_markdown || '',
        hero_image_key: job.hero_image_key,
        video_key: job.video_key,
        keywords: job.keywords,
        published_at: job.published_at,
        source_url: job.source_url,
        video_kind: job.video_kind,
        video_job_id: job.video_job_id,
      },
      env,
      channel: job.channel,
      socialPostId: id,
    });

    if (res?.ok === false) throw new Error(res.error || 'dispatch_failed');

    await track(env, { event: 'social_post_published', projectId: job.project_id, props: { channel: job.channel } });
    await finishJob(env, id, {
      status: 'published',
      external_id: res?.post_id || res?.postId || null,
      external_url: res?.post_url || res?.link || null,
      error: null,
      needs_reconnect: 0,
      published_at: nowSec(),
    });
    return { ok: true, external_url: res?.post_url || res?.link || null };
  } catch (err) {
    const attempts = job.attempts || 1;
    const maxAttempts = job.max_attempts || 5;
    const credential = isCredentialError(err);

    // A credential failure will never succeed on retry — park it and let
    // the UI ask for a reconnect.
    await track(env, { event: 'social_post_failed', projectId: job.project_id, props: { channel: job.channel, credential, attempts } });
    if (credential) {
      await finishJob(env, id, {
        status: 'failed', error: String(err.message || err).slice(0, 500), needs_reconnect: 1,
      });
      return { ok: false, error: err.message, needs_reconnect: true };
    }

    if (attempts >= maxAttempts) {
      await finishJob(env, id, { status: 'failed', error: String(err.message || err).slice(0, 500) });
      return { ok: false, error: err.message, exhausted: true };
    }

    const retryIn = Math.max(backoffSec(attempts), Number(err?.youtube_delay_sec || 0));
    await finishJob(env, id, {
      status: 'failed',
      error: String(err.message || err).slice(0, 500),
      next_attempt_at: nowSec() + retryIn,
    });
    return { ok: false, error: err.message, retry_in_sec: retryIn };
  }
}

// Drain due jobs. Called from the cron tick (per project) and after an
// enqueue so the happy path still feels immediate.
export async function drainSocialQueue(env, { projectId = null, limit = 5, dispatch = dispatchPublication } = {}) {
  if (!env?.DB) return { processed: 0, results: [] };
  const t = nowSec();
  const where = projectId ? 'project_id = ? AND' : '';
  const sql = `SELECT id FROM social_posts
                WHERE ${where} status IN ('pending', 'failed')
                  AND needs_reconnect = 0
                  AND next_attempt_at <= ?
                ORDER BY next_attempt_at ASC LIMIT ?`;
  const stmt = projectId ? env.DB.prepare(sql).bind(projectId, t, limit) : env.DB.prepare(sql).bind(t, limit);
  const { results } = await stmt.all().catch(() => ({ results: [] }));

  const out = [];
  for (const row of results || []) {
    // Sequential on purpose: each job is a network call and Facebook rate
    // limits per Page, so parallelising here buys little and risks 4xx.
    out.push({ id: row.id, ...(await runSocialJob(env, row.id, { dispatch })) });
  }
  return { processed: out.length, results: out };
}

export async function listSocialPosts(env, { projectId = null, status = null, channel = null, limit = 100 } = {}) {
  if (!env?.DB) return [];
  const clauses = [];
  const binds = [];
  if (projectId) { clauses.push('s.project_id = ?'); binds.push(projectId); }
  if (status) { clauses.push('s.status = ?'); binds.push(status); }
  if (channel) { clauses.push('s.channel = ?'); binds.push(channel); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  binds.push(Math.min(500, limit));

  const { results } = await env.DB.prepare(
    `SELECT s.id, s.project_id, s.blog_post_id, s.channel, s.status, s.attempts, s.max_attempts,
            s.next_attempt_at, s.external_id, s.external_url, s.error,
            s.needs_reconnect, s.created_at, s.updated_at, s.published_at,
            b.slug AS post_slug, b.title AS post_title, b.hero_image_key,
             v.slug AS video_slug, v.kind AS video_kind, v.video_key
       FROM social_posts s
       LEFT JOIN blog_posts b ON b.id = ${postIdFromRefSql('s.blog_post_id')}
       LEFT JOIN video_jobs v
         ON v.blog_post_id = ${videoJobRefSql('s.blog_post_id', 'b.id')}
        AND v.status = 'done'
       ${where}
      ORDER BY s.created_at DESC LIMIT ?`
  ).bind(...binds).all().catch(() => ({ results: [] }));
  return results || [];
}

export async function retrySocialPost(env, { projectId = null, id, dispatch = dispatchPublication } = {}) {
  const t = nowSec();
  const owned = projectId
    ? await env.DB.prepare('SELECT id FROM social_posts WHERE id = ? AND project_id = ? LIMIT 1').bind(id, projectId).first().catch(() => null)
    : await env.DB.prepare('SELECT id FROM social_posts WHERE id = ? LIMIT 1').bind(id).first().catch(() => null);
  if (!owned) return { ok: false, error: 'not_found' };

  // Reset the counter so a manual retry gets the full attempt budget, and
  // clear the reconnect flag only if the operator reconnected first —
  // they can retry anyway and the next failure will re-raise it.
  await env.DB.prepare(
    `UPDATE social_posts SET status = 'pending', attempts = 0, next_attempt_at = ?,
       error = NULL, needs_reconnect = 0, updated_at = ? WHERE id = ?`
  ).bind(t, t, id).run().catch(() => {});
  // dispatch rides through: the admin API never injects one, but tests
  // (and any caller that needs determinism) rely on it reaching the job.
  return runSocialJob(env, id, { dispatch });
}

export async function cancelSocialPost(env, { projectId = null, id }) {
  const t = nowSec();
  const r = projectId
    ? await env.DB.prepare(
        `UPDATE social_posts SET status = 'skipped', updated_at = ?
          WHERE id = ? AND project_id = ? AND status IN ('pending','failed')`
      ).bind(t, id, projectId).run().catch(() => null)
    : await env.DB.prepare(
        `UPDATE social_posts SET status = 'skipped', updated_at = ?
          WHERE id = ? AND status IN ('pending','failed')`
      ).bind(t, id).run().catch(() => null);
  return { ok: !!(r?.meta?.changes) };
}
