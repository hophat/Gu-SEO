// /<project>/p/<slug> — programmatic page for a named project on a shared host.
import { onRequestGet as renderProg } from '../../p/[slug].js';
import { resolveProjectBySlugPath } from '../../_lib/project_scope.js';

export const onRequestGet = async (ctx) => {
  const projectSlug = String(ctx.params?.project || '').toLowerCase();
  const project = await resolveProjectBySlugPath(ctx.env, projectSlug).catch(() => null);
  if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  return renderProg({ env: ctx.env, request: ctx.request, params: { project: projectSlug, slug: ctx.params?.slug } });
};
