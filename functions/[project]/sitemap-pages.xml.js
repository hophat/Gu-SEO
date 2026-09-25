// /<project>/sitemap-pages.xml — urlset for a named project on a shared host.
import { pagesUrlset } from '../sitemap.xml.js';
import { resolveProjectBySlugPath } from '../_lib/project_scope.js';

export const onRequestGet = async (ctx) => {
  const slug = String(ctx.params?.project || '').toLowerCase();
  const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
  if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const part = new URL(ctx.request.url).searchParams.get('part') || 1;
  return pagesUrlset({ env: ctx.env, request: ctx.request, projectSlug: slug, basePath: `/${slug}`, part });
};
