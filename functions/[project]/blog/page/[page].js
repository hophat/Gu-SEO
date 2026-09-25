// /<project>/blog/page/<n> — paginated archive for a named project.
import { renderBlogIndexCached } from '../../../blog/index.js';
import { resolveProjectBySlugPath } from '../../../_lib/project_scope.js';

export const onRequestGet = async (ctx) => {
  const slug = String(ctx.params?.project || '').toLowerCase();
  const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
  if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

  const page = parseInt(ctx.params?.page, 10);
  if (!Number.isFinite(page) || page < 1) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  if (page === 1) {
    return new Response(null, { status: 301, headers: { location: new URL(`/${slug}/blog`, ctx.request.url).toString() } });
  }
  return renderBlogIndexCached(ctx, { page, projectSlug: slug, basePath: `/${slug}` });
};
