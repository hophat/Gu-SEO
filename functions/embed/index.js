// GET /embed?count=&title=&theme=
//
// Minimal host page so the admin's "iframe" widget flavour has a real
// URL to point at. It delegates rendering to the same /widget.js bundle
// the JS flavour uses, so there is one renderer, not two.
import { esc } from '../_lib/util.js';

const VALID_THEME = ['auto', 'light', 'dark'];

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const count = Math.min(50, Math.max(1, parseInt(url.searchParams.get('count'), 10) || 5));
  const title = String(url.searchParams.get('title') || '').trim().slice(0, 100);
  const themeRaw = String(url.searchParams.get('theme') || 'auto');
  const theme = VALID_THEME.includes(themeRaw) ? themeRaw : 'auto';

  const titleAttr = title ? `\n  data-title="${esc(title)}"` : '';
  const themeAttr = theme !== 'auto' ? `\n  data-theme="${theme}"` : '';

  const body = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(title || 'Blog')}</title>
<style>
  html, body { margin: 0; padding: 12px; background: transparent; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
</style>
</head>
<body>
<div id="ps-embed-host"></div>
<script
  src="/widget.js"
  data-target="#ps-embed-host"
  data-count="${count}"${titleAttr}${themeAttr}
  defer></script>
</body>
</html>`;

  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
};
