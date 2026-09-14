import { requestHost, resolveProjectByHost, normalizeHost } from './_lib/project_scope.js';

export const onRequestGet = async ({ env, request }) => {
  const host = requestHost(request);
  const project = await resolveProjectByHost(env, host).catch(() => null);
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const sitemapHost = customHost || host;
  const body = `# pages-seo robots policy
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

# AI training crawlers — block by default.
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

Sitemap: https://${sitemapHost}/sitemap.xml

# Feeds for aggregators (Feedly, Inoreader, etc.)
# Not part of the robots spec but conventional alongside Sitemap.
# Most aggregators rely on <link rel="alternate"> in HTML; this is a
# belt-and-braces signal for the ones that scrape robots.txt too.
`;
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
