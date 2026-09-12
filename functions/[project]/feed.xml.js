// /<project>/feed.xml — RSS feed for a named project on a shared host.
import { onRequestGet as renderFeed } from '../feed.xml.js';

export const onRequestGet = (ctx) => renderFeed({
  env: ctx.env,
  request: ctx.request,
  params: { project: ctx.params?.project },
});
