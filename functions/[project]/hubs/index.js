// /<project>/hubs — pillar directory for a named project on a shared host.
import { onRequestGet as renderIndex } from '../../hubs/index.js';
import { resolveProjectBySlugPath } from '../../_lib/project_scope.js';

export const onRequestGet = async (ctx) => {
  const projectSlug = String(ctx.params?.project || '').toLowerCase();
  const project = await resolveProjectBySlugPath(ctx.env, projectSlug).catch(() => null);
  if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  return renderIndex({ env: ctx.env, request: ctx.request, params: { project: projectSlug } });
};
