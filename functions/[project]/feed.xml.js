// /<project>/feed.xml — RSS feed for a named project on a shared host.
import { onRequestGet as renderFeed } from '../feed.xml.js';
import { resolveProjectBySlugPath } from '../_lib/project_scope.js';

export const onRequestGet = async (ctx) => {
  const slug = String(ctx.params?.project || '').toLowerCase();
  const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
  if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  return renderFeed({ env: ctx.env, request: ctx.request, params: { project: slug } });
};
