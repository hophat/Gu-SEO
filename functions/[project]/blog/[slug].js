// /<project>/blog/<slug> — single post for a named project on a shared host.
import { onRequestGet as renderPost } from '../../../blog/[slug].js';

export const onRequestGet = (ctx) => renderPost({
  env: ctx.env,
  request: ctx.request,
  params: { project: ctx.params?.project, slug: ctx.params?.slug },
});
