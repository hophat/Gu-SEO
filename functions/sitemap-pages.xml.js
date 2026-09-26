// /sitemap-pages.xml — the actual urlset linked from /sitemap.xml.
// ?part=N serves slice N when the archive is larger than one chunk
// (CHUNK in sitemap.xml.js). Part 1 stays the bare path so the common
// case never changes shape.
//
// This is the file that actually lists every URL, and on a shared host
// there is one per project, so it is the expensive one a crawler walks.
// Same treatment as the index: public, visitor-independent, 300s.
import { pagesUrlset } from './sitemap.xml.js';
import { edgeCached } from './_lib/util.js';

export const onRequestGet = (ctx) => edgeCached(
  ctx.request,
  ctx.waitUntil,
  () => pagesUrlset({ env: ctx.env, request: ctx.request, part: new URL(ctx.request.url).searchParams.get('part') || 1 }),
  300,
);
