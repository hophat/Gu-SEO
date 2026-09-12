// /<project>/blog — blog index for a named project on a shared host.
import { renderBlogIndex } from '../../blog/index.js';
import { resolveProjectBySlug } from '../../_lib/project_scope.js';

export const onRequestGet = async (ctx) => {
  const slug = String(ctx.params?.project || '').toLowerCase();
  const project = await resolveProjectBySlug(ctx.env, slug).catch(() => null);
  if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  return renderBlogIndex({ env: ctx.env, request: ctx.request, page: 1, projectSlug: slug, basePath: `/${slug}` });
};
