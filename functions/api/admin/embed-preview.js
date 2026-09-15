// GET /api/admin/embed-preview — live preview of an embed's widget.
//
// Renders the real widget bundle (same widgetBody() the public
// /api/embed/<id> route ships) into a minimal host page, so the operator
// can see exactly what will appear on their site before copying the
// snippet.
//
// Query params mirror the admin form so the preview tracks unsaved edits:
//   id, name, title, accent, theme, per_page,
//   bg, fg, muted, line, palette_accent
//
// Admin-gated: the widget itself is public, but this route reveals the
// tenant's draft styling, so it stays behind adminGate.
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { widgetBody } from '../../_lib/widget_render.js';
import { sanitizeEmbedSettings } from '../../_lib/embed_settings.js';

function html(js) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Embed preview</title>
<style>
  html, body { margin: 0; padding: 0; }
  body { background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  @media (prefers-color-scheme: dark) { body { background: #0e0f12; } }
  .wrap { padding: 20px; }
</style>
</head>
<body>
<div class="wrap"><div id="ps-blog"></div></div>
<script>${js}</script>
</body>
</html>`;
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request);
  if (gate) return gate;

  if (!env?.DB) return new Response('no_db', { status: 500 });

  const url = new URL(request.url);
  const q = url.searchParams;
  const id = String(q.get('id') || '').trim();

  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);

  // Prefer the embed's own project (the widget is scoped to it); fall
  // back to the operator's active project for a not-yet-saved embed.
  let embed = null;
  if (id && /^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    embed = await env.DB.prepare(
      `SELECT e.id, e.name, e.settings_json, e.project_id,
              p.slug AS project_slug, p.language AS project_language,
              p.theme_color AS project_theme_color
         FROM blog_embeds e LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.id = ? LIMIT 1`
    ).bind(id).first().catch(() => null);
  }

  const projectId = embed?.project_id || tenant?.activeProjectId || null;
  if (!embed && projectId) {
    const p = await env.DB.prepare(
      `SELECT slug AS project_slug, language AS project_language, theme_color AS project_theme_color
         FROM projects WHERE id = ? LIMIT 1`
    ).bind(projectId).first().catch(() => null);
    embed = { id: '', name: String(q.get('name') || 'Blog'), ...(p || {}) };
  }

  // Saved settings, then overlay whatever the form currently holds so
  // the preview follows unsaved keystrokes.
  let saved = {};
  if (embed?.settings_json) {
    try { saved = JSON.parse(embed.settings_json) || {}; } catch { /* default */ }
  }

  const paletteFromQuery = {
    bg: q.get('bg'), fg: q.get('fg'), muted: q.get('muted'),
    line: q.get('line'), accent: q.get('palette_accent'),
  };
  const hasPaletteQuery = Object.values(paletteFromQuery).some(Boolean);

  const merged = sanitizeEmbedSettings({
    title: q.get('title') ?? saved.title,
    accent: q.get('accent') ?? saved.accent,
    per_page: q.get('per_page') ?? saved.per_page ?? saved.limit,
    theme: q.get('theme') ?? saved.theme,
    palette: hasPaletteQuery ? paletteFromQuery : saved.palette,
  });

  const js = widgetBody({
    title: merged.title || embed?.name || 'Blog',
    accent: merged.accent || embed?.project_theme_color || '#0a0a0a',
    apiBase: `${url.protocol}//${url.host}`,
    embedId: id || '',
    perPage: merged.per_page || 10,
    theme: merged.theme || 'auto',
    palette: merged.palette || {},
    project: String(embed?.project_slug || ''),
    lang: String(embed?.project_language || 'vi'),
    titleAuto: !merged.title,
  });

  return new Response(html(js), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
