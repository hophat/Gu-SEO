// /<project>/hubs/<pillar> — one topic cluster for a named project.
import { onRequestGet as renderPillar } from '../../hubs/[pillar].js';
import { resolveProjectBySlugPath } from '../../_lib/project_scope.js';

export const onRequestGet = async (ctx) => {
  const projectSlug = String(ctx.params?.project || '').toLowerCase();
  const project = await resolveProjectBySlugPath(ctx.env, projectSlug).catch(() => null);
  if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  return renderPillar({ env: ctx.env, request: ctx.request, params: { project: projectSlug, pillar: ctx.params?.pillar } });
};
