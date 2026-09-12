// /<project>/sitemap-pages.xml — urlset for a named project on a shared host.
import { pagesUrlset } from '../sitemap.xml.js';

export const onRequestGet = (ctx) => pagesUrlset({
  env: ctx.env,
  request: ctx.request,
  projectSlug: ctx.params?.project,
  basePath: `/${ctx.params?.project}`,
});
