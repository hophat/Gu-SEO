import { publishToFacebook, publishFacebookVideo } from './facebook.js';
import { publishToInstagram } from './instagram.js';
import { publishToThreads } from './threads.js';
import { publishToX } from './x.js';
import { isCarouselKey } from '../video_jobs.js';

// Channel config resolution: legacy project_publishing_configs.config_json
// and the per-channel project_channels row are MERGED, row winning. The
// merge (not replacement) matters: a Facebook Page connected through the
// pre-multi-channel flow keeps its page_id/message_template in the legacy
// config even when the channel row only holds hashtags — replacing would
// lose the Page ID and every drain would fail with 'Thiếu Page ID'.
async function channelConfigFor(env, project, channel) {
  const pubCfg = project?.publishing_config || {};
  let legacyCfg = {};
  try {
    legacyCfg = typeof pubCfg.config_json === 'string'
      ? JSON.parse(pubCfg.config_json || '{}')
      : (pubCfg.config_json || {});
  } catch { legacyCfg = {}; }
  let rowCfg = {};
  if (env?.DB && project?.id) {
    const { getChannelConfig } = await import('../channels.js');
    rowCfg = await getChannelConfig(env, project.id, channel).catch(() => ({})) || {};
  }
  return { ...legacyCfg, ...rowCfg };
}

export async function dispatchPublication({ project, article, env, channel = null }) {
  const pubCfg = project?.publishing_config || {};
  const publisherType = pubCfg.publisher_type || 'internal_d1';

  // The facebook_video channel handles both payloads: a carousel prefix
  // uploads the slide PNGs as a multi-photo post; a video_key MP4 goes
  // through publishFacebookVideo.
  if (channel === 'facebook_video') {
    if (article.video_key && isCarouselKey(article.video_key)) {
      return publishToFacebook({ project, article, configJson: pubCfg.config_json, env });
    }
    return publishFacebookVideo({ project, article, configJson: pubCfg.config_json, env });
  }

  const ch = channel || publisherType;
  switch (ch) {
    case 'webhook':
      return publishToWebhook({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article });
    case 'custom_api':
      return publishToCustomApi({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article, configJson: pubCfg.config_json });
    case 'wordpress':
      return publishToWordPress({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article });
    case 'facebook':
      return publishToFacebook({ project, article, configJson: await channelConfigFor(env, project, 'facebook'), env });
    case 'instagram':
      return publishToInstagram({ project, article, configJson: await channelConfigFor(env, project, 'instagram'), env });
    case 'threads':
      return publishToThreads({ project, article, configJson: await channelConfigFor(env, project, 'threads'), env });
    case 'x':
      return publishToX({ project, article, configJson: await channelConfigFor(env, project, 'x'), env });
    case 'internal_d1':
    default:
      return {
        ok: true,
        type: 'internal_d1',
        published_url: `${project?.publishing_url || project?.website_url || ''}/blog/${article.slug}`,
      };
  }
}

async function publishToWebhook({ endpointUrl, authHeader, article }) {
  if (!endpointUrl) throw new Error('Webhook endpoint URL missing');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: 'article.published',
      article: {
        id: article.id,
        slug: article.slug,
        title: article.title,
        meta_description: article.meta_description,
        body_markdown: article.body_markdown,
        hero_image_key: article.hero_image_key,
        keywords: article.keywords,
        published_at: article.published_at,
      },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Webhook error (${res.status}): ${txt.slice(0, 300)}`);
  }

  return { ok: true, type: 'webhook', status: res.status };
}

async function publishToCustomApi({ endpointUrl, authHeader, article, configJson }) {
  if (!endpointUrl) throw new Error('Custom API endpoint URL missing');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  let extraConfig = {};
  try {
    if (configJson) extraConfig = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
  } catch {}

  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...extraConfig,
      title: article.title,
      slug: article.slug,
      content: article.body_markdown,
      summary: article.meta_description,
      tags: article.keywords ? article.keywords.split(',').map(s => s.trim()) : [],
      featured_image: article.hero_image_key,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Custom API error (${res.status}): ${txt.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, type: 'custom_api', data };
}

async function publishToWordPress({ endpointUrl, authHeader, article }) {
  if (!endpointUrl) throw new Error('WordPress endpoint URL missing');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const url = endpointUrl.replace(/\/+$/, '') + '/wp-json/wp/v2/posts';
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: article.title,
      slug: article.slug,
      content: article.body_markdown,
      status: 'publish',
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`WordPress API error (${res.status}): ${txt.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => ({}));
  return { ok: true, type: 'wordpress', post_id: data.id, link: data.link };
}
