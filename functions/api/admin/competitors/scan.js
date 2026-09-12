import { json, newId, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { getProject } from '../../../_lib/projects.js';

const CACHE_TTL_SEC = 7 * 24 * 3600;
const MAX_URLS = 5;
const MAX_HTML_CHARS = 400000;

function isPublicHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (h === '::1' || h === '0.0.0.0' || h === '169.254.169.254') return false;
  if (/^(127\.|10\.|192\.168\.|0\.)/.test(h)) return false;
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172 && +m172[1] >= 16 && +m172[1] <= 31) return false;
  return true;
}

function measureHtml(html) {
  const src = String(html || '').slice(0, MAX_HTML_CHARS);
  const lower = src.toLowerCase();
  const countTag = (tag) => (lower.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
  const text = src
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = text ? text.split(' ').length : 0;
  const titleMatch = src.match(/<title[^>]*>([\s\S]{1,300})<\/title>/i);
  return {
    title: titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '',
    word_count: wordCount,
    h2_count: countTag('h2'),
    link_count: countTag('a'),
  };
}

export const onRequestPost = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || body?.project || '').trim();
  const keyword = String(body?.keyword || '').trim().slice(0, 200);
  if (!projectId) return json(400, { error: 'missing_project_id' });
  if (!keyword) return json(400, { error: 'missing_keyword' });
  const project = await getProject(env, projectId);
  if (!project) return json(404, { error: 'project_not_found' });

  const since = nowSec() - CACHE_TTL_SEC;
  const cached = await env.DB.prepare(
    `SELECT competitor_url, title, word_count, h2_count, link_count, created_at
       FROM competitor_snapshots WHERE project_id = ? AND keyword = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT ?`
  ).bind(project.id, keyword, since, MAX_URLS).all().catch(() => ({ results: [] }));
  if (cached?.results?.length) {
    return json(200, { ok: true, keyword, snapshots: cached.results, cached: true });
  }

  const rawUrls = Array.isArray(body?.urls) ? body.urls : [];
  const urls = [...new Set(rawUrls.map((u) => String(u).trim()).filter(Boolean))].slice(0, MAX_URLS);
  if (!urls.length) return json(400, { error: 'missing_urls', hint: 'Provide 1-5 rival URLs to measure.' });
  const bad = urls.filter((u) => !isPublicHttpUrl(u));
  if (bad.length) return json(400, { error: 'invalid_url', detail: bad[0].slice(0, 120) });

  const t = nowSec();
  const snapshots = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'GulagiBlogs/1.0 (+https://gulagi.com/blog)' } });
      if (!r.ok) throw new Error('http_' + r.status);
      const html = await r.text();
      const m = measureHtml(html);
      await env.DB.prepare(
        `INSERT INTO competitor_snapshots (id, project_id, keyword, competitor_url, title, word_count, h2_count, link_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(newId(), project.id, keyword, url, m.title, m.word_count, m.h2_count, m.link_count, t).run();
      snapshots.push({ competitor_url: url, title: m.title, word_count: m.word_count, h2_count: m.h2_count, link_count: m.link_count, created_at: t });
    } catch (e) {
      snapshots.push({ competitor_url: url, error: String(e?.message || e).slice(0, 120) });
    }
  }

  audit(env, 'admin', 'competitors.scan', project.id, { keyword, measured: snapshots.filter((s) => !s.error).length });
  return json(200, { ok: true, keyword, snapshots, cached: false });
};
