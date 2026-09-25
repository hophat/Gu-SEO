// YouTube Data API v3 resumable uploader.
//
// Uploads are split into bounded R2 ranges. The session URI and acknowledged
// offset live in D1 (the URI is encrypted) so a Worker timeout resumes the
// same Google session instead of spending another 1,600 quota units.

import { getYoutubeAccessToken } from './youtube_oauth.js';
import { encryptValue, decryptValue } from '../secret_vault.js';
import { isCarouselKey } from '../video_jobs.js';

const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos';
const CHUNK_BYTES = 8 * 1024 * 1024; // multiple of YouTube's 256 KiB unit
const MAX_CHUNKS_PER_RUN = 4;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_TITLE = 100;
const MAX_DESCRIPTION = 5000;
const MAX_TAGS = 500;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value, max) {
  const text = cleanText(value);
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

export function parseYoutubeConfig(configJson) {
  let cfg = {};
  try {
    const parsed = typeof configJson === 'string' ? JSON.parse(configJson || '{}') : (configJson || {});
    cfg = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    // A malformed config must not prevent the operator from seeing a useful
    // validation error from the publisher.
    throw new Error('youtube_config_invalid');
  }
  const rawPrivacy = String(cfg.privacy_status || cfg.privacyStatus || 'private');
  const privacy = ['public', 'unlisted', 'private'].includes(rawPrivacy) ? rawPrivacy : 'private';
  const category = cleanText(cfg.category_id || cfg.categoryId).replace(/[^0-9]/g, '');
  return {
    privacy,
    categoryId: category || '22',
    tags: cleanText(cfg.tags || cfg.keywords),
    descriptionTemplate: String(cfg.description_template || cfg.descriptionTemplate || ''),
    asVideo: cfg.as_video === true || cfg.asVideo === true,
  };
}

function articleUrl(project, article) {
  const base = String(project?.publishing_url || project?.website_url || '').trim().replace(/\/+$/, '');
  return base && article?.slug ? `${base}/blog/${article.slug}` : '';
}

function renderDescription({ article, config, url }) {
  const base = cleanText(article?.meta_description || article?.body_markdown || '');
  const template = config.descriptionTemplate;
  let description = template
    ? template
      .replaceAll('{title}', cleanText(article?.title))
      .replaceAll('{description}', base)
      .replaceAll('{url}', url)
    : [base, url].filter(Boolean).join('\n\n');
  return truncate(description || base, MAX_DESCRIPTION);
}

function renderTags({ article, config }) {
  const raw = [config.tags, article?.keywords].filter(Boolean).join(',');
  return [...new Set(raw.split(/[,\n]/).map((tag) => cleanText(tag.replace(/^#/, ''))).filter(Boolean))]
    .join(',')
    .slice(0, MAX_TAGS);
}

function buildMetadata(project, article, config) {
  const url = articleUrl(project, article);
  const title = truncate(article?.title || article?.slug || 'Video', MAX_TITLE);
  return {
    snippet: {
      title,
      description: renderDescription({ article, config, url }),
      tags: [renderTags({ article, config })].filter(Boolean),
      categoryId: config.categoryId,
    },
    status: {
      privacyStatus: config.privacy,
      selfDeclaredMadeForKids: false,
      embeddable: true,
      notifySubscribers: false,
    },
  };
}

function readErrorCode(data) {
  return String(data?.error?.errors?.[0]?.reason || data?.error?.status || '');
}

async function readJsonBody(response) {
  if (typeof response?.json === 'function' && typeof response?.text !== 'function') return response.json();
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    const invalid = new Error('youtube_api_response_invalid');
    invalid.cause = error;
    invalid.youtube_status = response.status;
    throw invalid;
  }
}

async function parseApiError(response) {
  const data = await readJsonBody(response);
  const reason = readErrorCode(data);
  const detail = data?.error?.message || data?.error_description || `YouTube API HTTP ${response.status}`;
  const error = new Error(String(detail).slice(0, 300));
  error.youtube_status = response.status;
  error.youtube_error = data?.error || null;
  error.youtube_error_code = reason;
  error.youtube_retryable = response.status === 429 || response.status >= 500;
  const quotaError = /quota|rateLimit|dailyLimit|uploadLimit/i.test(reason);
  error.youtube_credential = response.status === 401
    || (response.status === 403 && !quotaError)
    || (!quotaError && /accessNotConfigured|forbidden|insufficientPermissions|invalidGrant|unauthorized/i.test(reason));
  error.youtube_delay_sec = quotaError || response.status === 429 ? 6 * 60 * 60 : null;
  return error;
}

async function videoMetadata(env, key) {
  if (!env?.IMAGES) throw new Error('r2_not_bound');
  if (typeof env.IMAGES.head === 'function') {
    const object = await env.IMAGES.head(key);
    if (!object) throw new Error('video_file_missing');
    return object;
  }
  // Older test doubles and compatible R2 emulators may not implement head().
  // Do not use object.body in the upload path; bounded get() calls below are
  // the only reads that materialize bytes.
  const object = await env.IMAGES.get(key);
  if (!object) throw new Error('video_file_missing');
  return object;
}

async function readRange(env, key, offset, length) {
  const part = await env.IMAGES.get(key, { range: { offset, length } });
  if (!part) throw new Error('video_file_missing');
  const bytes = new Uint8Array(await part.arrayBuffer());
  if (bytes.byteLength !== length) throw new Error('video_range_incomplete');
  return bytes;
}

async function getUploadState(env, socialPostId) {
  if (!env?.DB || !socialPostId) return null;
  const row = await env.DB.prepare(
    `SELECT social_post_id, project_id, source_key, source_size, next_offset,
            session_ciphertext, video_id, created_at
       FROM youtube_uploads WHERE social_post_id = ? LIMIT 1`
  ).bind(socialPostId).first();
  if (!row) return null;
  return {
    socialPostId: String(row.social_post_id),
    projectId: String(row.project_id),
    sourceKey: String(row.source_key),
    sourceSize: Number(row.source_size),
    nextOffset: Number(row.next_offset || 0),
    sessionCiphertext: row.session_ciphertext || null,
    videoId: row.video_id || null,
    createdAt: Number(row.created_at || 0),
  };
}

async function saveUploadState(env, state) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO youtube_uploads
      (social_post_id, project_id, source_key, source_size, next_offset,
       session_ciphertext, video_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(social_post_id) DO UPDATE SET
       source_key = excluded.source_key,
       source_size = excluded.source_size,
       next_offset = excluded.next_offset,
       session_ciphertext = excluded.session_ciphertext,
       video_id = excluded.video_id,
       updated_at = excluded.updated_at`
  ).bind(
    state.socialPostId,
    state.projectId,
    state.sourceKey,
    state.sourceSize,
    state.nextOffset,
    state.sessionCiphertext || null,
    state.videoId || null,
    state.createdAt || now,
    now,
  ).run();
}

async function initSession({ env, project, article, config, accessToken, size, socialPostId }) {
  const response = await fetch(`${UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify(buildMetadata(project, article, config)),
  });
  if (!response.ok) throw await parseApiError(response);
  const sessionUri = response.headers.get('location');
  if (!sessionUri) throw new Error('youtube_upload_url_missing');

  const now = Math.floor(Date.now() / 1000);
  const state = {
    socialPostId,
    projectId: project.id,
    sourceKey: article.video_key,
    sourceSize: size,
    nextOffset: 0,
    sessionCiphertext: await encryptValue(env, sessionUri),
    createdAt: now,
  };
  await saveUploadState(env, state);
  return { sessionUri, state };
}

function nextOffsetFromHeaders(response, start, end) {
  const range = response.headers.get('range') || response.headers.get('x-range');
  if (range) {
    const match = range.match(/bytes=0-(\d+)/i);
    if (match) return Math.min(Number(match[1]) + 1, end + 1);
  }
  // A 308 without Range means the service accepted the complete chunk.
  return end + 1;
}

function sessionGone(error) {
  return error?.youtube_status === 404 || error?.youtube_status === 410;
}

async function markComplete(env, state, videoId) {
  await saveUploadState(env, {
    ...state,
    nextOffset: state.sourceSize,
    sessionCiphertext: null,
    videoId,
  });
}

export async function publishYoutubeVideo({ project, article, configJson, env, socialPostId }) {
  if (!project?.id) throw new Error('project_missing');
  if (!article?.video_key) throw new Error('video_missing');
  if (isCarouselKey(article.video_key)) throw new Error('youtube_requires_mp4_blog_post');
  if (!socialPostId) throw new Error('social_post_id_missing');
  if (!env?.IMAGES) throw new Error('r2_not_bound');

  const object = await videoMetadata(env, article.video_key);
  const size = Number(object.size || 0);
  if (!size) throw new Error('video_file_empty');
  if (size > MAX_VIDEO_BYTES) throw new Error('youtube_video_too_large');

  const config = parseYoutubeConfig(configJson || {});
  let state = await getUploadState(env, socialPostId);
  if (state && (state.projectId !== String(project.id) || state.sourceKey !== article.video_key || Number(state.sourceSize) !== size)) {
    state = null;
    await env.DB.prepare('DELETE FROM youtube_uploads WHERE social_post_id = ?')
      .bind(socialPostId).run();
  }

  // A previous invocation may have received YouTube's final response but
  // crashed before the social_posts UPDATE. Reuse its persisted video ID
  // rather than creating a duplicate upload.
  if (state?.videoId) {
    return {
      ok: true,
      post_id: String(state.videoId),
      post_url: `https://www.youtube.com/watch?v=${encodeURIComponent(state.videoId)}`,
      privacy_status: config.privacy,
    };
  }

  const accessToken = await getYoutubeAccessToken(env, project.id);

  let sessionUri;
  let offset = Number(state?.nextOffset || 0);
  if (state?.sessionCiphertext) {
    sessionUri = await decryptValue(env, state.sessionCiphertext);
  } else {
    const initialized = await initSession({
      env, project, article, config, accessToken, size, socialPostId,
    });
    sessionUri = initialized.sessionUri;
    state = initialized.state;
    offset = 0;
  }

  if (!Number.isInteger(offset) || offset < 0 || offset > size) {
    state = null;
    await env.DB.prepare('DELETE FROM youtube_uploads WHERE social_post_id = ?')
      .bind(socialPostId).run();
    const initialized = await initSession({
      env, project, article, config, accessToken, size, socialPostId,
    });
    sessionUri = initialized.sessionUri;
    state = initialized.state;
    offset = 0;
  }

  let chunks = 0;
  while (offset < size && chunks < MAX_CHUNKS_PER_RUN) {
    const length = Math.min(CHUNK_BYTES, size - offset);
    const end = offset + length - 1;
    const bytes = await readRange(env, article.video_key, offset, length);
    const response = await fetch(sessionUri, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'video/mp4',
        'Content-Length': String(bytes.byteLength),
        'Content-Range': `bytes ${offset}-${end}/${size}`,
      },
      body: bytes,
    });

    if (response.status === 308) {
      const acknowledged = nextOffsetFromHeaders(response, offset, end);
      if (acknowledged <= offset) {
        const error = new Error('youtube_upload_no_progress');
        error.youtube_retryable = true;
        throw error;
      }
      offset = acknowledged;
      state = { ...state, nextOffset: offset };
      await saveUploadState(env, state);
      chunks += 1;
      continue;
    }

    if (!response.ok) {
      const error = await parseApiError(response);
      if (sessionGone(error)) {
        await env.DB.prepare('DELETE FROM youtube_uploads WHERE social_post_id = ?')
          .bind(socialPostId).run();
      }
      throw error;
    }

    let data;
    try {
      data = await readJsonBody(response);
    } catch (error) {
      // A successful HTTP response means YouTube accepted the final range even
      // when the JSON body is lost. Persist the byte boundary so the next run
      // probes the existing session instead of sending that range again.
      await saveUploadState(env, { ...state, nextOffset: size });
      error.youtube_retryable = true;
      throw error;
    }
    if (!data?.id) {
      const error = new Error('youtube_video_id_missing');
      await saveUploadState(env, { ...state, nextOffset: size });
      error.youtube_retryable = true;
      throw error;
    }
    await markComplete(env, state, String(data.id));
    return {
      ok: true,
      post_id: String(data.id),
      post_url: `https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`,
      channel_id: data.snippet?.channelId ? String(data.snippet.channelId) : null,
      privacy_status: config.privacy,
    };
  }

  if (offset >= size) {
    // Some resumable-session implementations acknowledge the final range
    // with 308 and only return the resource on a zero-byte status probe.
    const probe = await fetch(sessionUri, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Length': '0',
        'Content-Range': `bytes */${size}`,
      },
    });
    if (probe.ok) {
      const data = await readJsonBody(probe);
      if (data?.id) {
        await markComplete(env, state, String(data.id));
        return {
          ok: true,
          post_id: String(data.id),
          post_url: `https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`,
          privacy_status: config.privacy,
        };
      }
    } else if (probe.status !== 308) {
      const error = await parseApiError(probe);
      if (sessionGone(error)) {
        await env.DB.prepare('DELETE FROM youtube_uploads WHERE social_post_id = ?')
          .bind(socialPostId).run();
      }
      throw error;
    }
    const error = new Error('youtube_upload_status_pending');
    error.youtube_retryable = true;
    throw error;
  }

  const error = new Error('youtube_upload_checkpoint');
  error.youtube_retryable = true;
  error.youtube_next_offset = offset;
  throw error;
}
