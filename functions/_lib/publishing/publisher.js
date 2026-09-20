import { publishToFacebook, publishFacebookVideo } from './facebook.js';

export async function dispatchPublication({ project, article, env, channel = null }) {
  const pubCfg = project?.publishing_config || {};
  const publisherType = pubCfg.publisher_type || 'internal_d1';

  // The facebook_video channel is a sibling of the link post — same Page
  // credentials, but the payload is the rendered 9:16 MP4, not a link.
  if (channel === 'facebook_video') {
    return publishFacebookVideo({ project, article, configJson: pubCfg.config_json, env });
  }

  switch (publisherType) {
    case 'webhook':
      return publishToWebhook({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article });
    case 'custom_api':
      return publishToCustomApi({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article, configJson: pubCfg.config_json });
    case 'wordpress':
      return publishToWordPress({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article });
    case 'facebook':
      return publishToFacebook({ project, article, configJson: pubCfg.config_json, env });
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
