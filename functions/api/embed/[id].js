// GET /api/embed/<id>
//
// Returns a self-contained embed widget for a named embed.
// Settings (title, accent, per_page, theme, palette) come from the
// blog_embeds row.
//
// Host page:
//   <div id="ps-blog"></div>
//   <script src="https://<your-site>/api/embed/<id>" defer></script>
//
// Like /widget.js, the bundle fetches /api/widget at runtime rather
// than embedding posts inline. That keeps the cached bundle small
// and means publishing a new post is reflected without re-fetching
// the embed JS.

import { json } from '../../_lib/util.js';
import { widgetBody } from '../../_lib/widget_render.js';
import { embedWidgetOptions } from '../../_lib/embed_settings.js';

const CACHE_SEC = 300;

export const onRequestGet = async ({ env, params, request }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  const id = String(params.id || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    return new Response('// embed: invalid id\n', {
      status: 404,
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    });
  }

  const embed = await env.DB.prepare(
    `SELECT e.id, e.name, e.settings_json, p.slug AS project_slug, p.language AS project_language,
            p.theme_color AS project_theme_color
       FROM blog_embeds e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);

  let settings = {};
  if (embed?.settings_json) {
    try { settings = JSON.parse(embed.settings_json) || {}; } catch { /* default */ }
  }

  const url = new URL(request.url);
  // Shared with /api/admin/embed-preview so the live preview and the
  // shipped bundle can never disagree about what a setting means.
  // The embed is scoped to its own project, not to the host it is
  // pasted on — that host is the customer's site and resolves to no
  // project at all.
  const js = widgetBody(embedWidgetOptions({
    settings,
    embed: { ...(embed || {}), id },
    origin: `${url.protocol}//${url.host}`,
  }));

  return new Response(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SEC}`,
      'access-control-allow-origin': '*',
    },
  });
};
