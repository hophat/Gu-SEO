// /<project>/p/<slug> — programmatic page for a named project on a shared host.
import { onRequestGet as renderProg } from '../../p/[slug].js';

export const onRequestGet = (ctx) => renderProg({
  env: ctx.env,
  request: ctx.request,
  params: { project: ctx.params?.project, slug: ctx.params?.slug },
});
