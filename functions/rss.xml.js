// GET /rss.xml — legacy alias for the RSS feed.
//
// The canonical feed lives at /feed.xml. Feed readers and older
// tutorials often expect /rss.xml, so we permanently redirect rather
// than 404. Relative Location keeps the redirect on whatever host the
// request arrived on (shared host or a project's custom domain).
export const onRequestGet = async () =>
  new Response(null, {
    status: 301,
    headers: { location: '/feed.xml', 'cache-control': 'public, max-age=3600' },
  });
