// /<project>/sitemap.xml — sitemap index for a named project on a shared host.
import { onRequestGet as renderSitemap } from '../sitemap.xml.js';

export const onRequestGet = (ctx) => renderSitemap({
  env: ctx.env,
  request: ctx.request,
  params: { project: ctx.params?.project },
});
