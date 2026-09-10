import { json, nowSec } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { listProjects } from '../../../_lib/projects.js';

export const onRequestPost = async ({ request, env, waitUntil }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const projects = await listProjects(env, { status: 'active' });

  const results = [];
  const origin = new URL(request.url).origin;
  const adminToken = request.headers.get('Authorization') || '';

  for (const proj of projects) {
    const today = new Date().toISOString().slice(0, 10);
    const existingRun = await env.DB.prepare(
      `SELECT id, status FROM blog_jobs
       WHERE project_id = ? AND date(created_at, 'unixepoch') = ? AND status IN ('created', 'text_done', 'image_done', 'published')
       LIMIT 1`
    ).bind(proj.id, today).first().catch(() => null);

    if (existingRun) {
      results.push({ project_id: proj.id, slug: proj.slug, status: 'skipped', reason: 'already_run_today', job_id: existingRun.id });
      continue;
    }

    try {
      const startRes = await fetch(`${origin}/api/admin/blog/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': adminToken, 'X-Source-Cron': '1' },
        body: JSON.stringify({ project_id: proj.id, from_calendar: true }),
      });
      const startJson = await startRes.json().catch(() => ({}));
      const jobId = startJson?.job_id;

      if (!startRes.ok || !jobId) {
        results.push({ project_id: proj.id, slug: proj.slug, status: 'failed', step: 'start', error: startJson });
        continue;
      }

      const textRes = await fetch(`${origin}/api/admin/blog/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': adminToken, 'X-Source-Cron': '1' },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!textRes.ok) {
        results.push({ project_id: proj.id, slug: proj.slug, status: 'failed', step: 'text', job_id: jobId });
        continue;
      }

      const imgRes = await fetch(`${origin}/api/admin/blog/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': adminToken, 'X-Source-Cron': '1' },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!imgRes.ok) {
        results.push({ project_id: proj.id, slug: proj.slug, status: 'failed', step: 'image', job_id: jobId });
        continue;
      }

      if (proj.approval_mode === 'approval') {
        results.push({ project_id: proj.id, slug: proj.slug, status: 'pending_approval', job_id: jobId });
        continue;
      }

      const pubRes = await fetch(`${origin}/api/admin/blog/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': adminToken, 'X-Source-Cron': '1' },
        body: JSON.stringify({ job_id: jobId }),
      });
      const pubJson = await pubRes.json().catch(() => ({}));

      results.push({ project_id: proj.id, slug: proj.slug, status: 'published', job_id: jobId, post_id: pubJson.blog_post_id });
    } catch (err) {
      results.push({ project_id: proj.id, slug: proj.slug, status: 'error', error: err.message });
    }
  }

  return json(200, { ok: true, timestamp: nowSec(), projects_processed: results.length, results });
};
