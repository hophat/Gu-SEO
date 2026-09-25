// /sitemap-pages.xml — the actual urlset linked from /sitemap.xml.
// ?part=N serves slice N when the archive is larger than one chunk
// (CHUNK in sitemap.xml.js). Part 1 stays the bare path so the common
// case never changes shape.
import { pagesUrlset } from './sitemap.xml.js';

export const onRequestGet = (ctx) => {
  const part = new URL(ctx.request.url).searchParams.get('part') || 1;
  return pagesUrlset({ env: ctx.env, request: ctx.request, part });
};
