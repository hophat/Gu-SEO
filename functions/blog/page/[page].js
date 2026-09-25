// /blog/page/<n> — paginated archive page N (N>=2).
//
// Reuses renderBlogIndexCached() from ../index.js so we have a single
// rendering path; pagination semantics + canonical handling live
// over there.
import { renderBlogIndexCached } from '../index.js';

export const onRequestGet = (ctx) => {
  const page = parseInt(ctx.params.page, 10);
  if (!Number.isFinite(page) || page < 1) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  // /blog/page/1 → 301 to /blog (canonical, prevents duplicate-content).
  if (page === 1) {
    const u = new URL(ctx.request.url);
    u.pathname = '/blog';
    return new Response(null, { status: 301, headers: { location: u.toString() } });
  }
  return renderBlogIndexCached(ctx, { page });
};
