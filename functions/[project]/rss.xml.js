// GET /<project>/rss.xml — legacy alias for a project's RSS feed.
//
// Mirrors the root /rss.xml redirect: the canonical feed is
// /<project>/feed.xml. Relative Location keeps the redirect correct
// whether the project is served on the shared host or a custom domain.
export const onRequestGet = async () =>
  new Response(null, {
    status: 301,
    headers: { location: 'feed.xml', 'cache-control': 'public, max-age=3600' },
  });
