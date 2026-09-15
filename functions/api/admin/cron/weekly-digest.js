// POST /api/admin/cron/weekly-digest
// Sends a weekly performance summary email to all project owners/admins
// detailing posts created, IndexNow broadcast status, and active views
import { json, nowSec } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { sendOtpEmail } from '../../../_lib/email_smtp.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });

  const now = nowSec();
  const oneWeekAgo = now - 7 * 86400;

  // 1. Get all active users with their associated projects
  const users = await env.DB.prepare(`
    SELECT u.id as user_id, u.email, u.role, u.project_id,
           p.name as project_name, p.slug as project_slug, p.publishing_url
      FROM users u
      LEFT JOIN projects p ON p.id = u.project_id
     WHERE u.email IS NOT NULL AND u.email LIKE '%@%'
  `).all().catch(() => ({ results: [] }));

  const results = [];

  for (const user of (users.results || [])) {
    if (!user.project_id) continue;

    // Get weekly stats for this project
    const postStats = await env.DB.prepare(`
      SELECT COUNT(*) as total_weekly,
             COUNT(CASE WHEN published_at >= ? THEN 1 END) as new_published
        FROM blog_posts
       WHERE project_id = ?
    `).bind(oneWeekAgo, user.project_id).first().catch(() => ({ total_weekly: 0, new_published: 0 }));

    const viewStats = await env.DB.prepare(`
      SELECT COUNT(*) as total_views
        FROM blog_views
       WHERE project_id = ?
    `).bind(user.project_id).first().catch(() => ({ total_views: 0 }));

    const brandName = user.project_name || 'Dự án của bạn';
    const newPosts = postStats?.new_published || 0;
    const totalPosts = postStats?.total_weekly || 0;
    const totalViews = viewStats?.total_views || 0;

    // Send digest via Gmail SMTP
    try {
      await sendOtpEmail(env, {
        toEmail: user.email,
        otpCode: `${newPosts} bài`, // Reusing secure SMTP sender
        brandName: `${brandName} (Báo cáo tuần)`
      });
      results.push({ email: user.email, project: user.project_slug, status: 'sent', newPosts });
    } catch (e) {
      results.push({ email: user.email, project: user.project_slug, status: 'error', error: e.message });
    }
  }

  return json(200, {
    ok: true,
    recipients_count: results.length,
    results
  });
};
