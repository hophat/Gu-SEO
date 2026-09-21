// Video-ready notification email.
//
// Sent when the render agent delivers a finished MP4: the operator (and
// the project owner) learns the video exists without polling the admin.
// Follows the same rules as publishing/report.js:
//   - Never fail the delivery. Email is a notification; a dead SMTP
//     server must not turn a successful render into an error.
//   - The recipient is whoever owns the project (users.project_id) —
//     an empty list means "no mail", not "mail the admin".
//
// Runs inside waitUntil after the response has gone out; the origin
// base is passed in rather than the Request object.
import { sendEmail } from './email_smtp.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Who gets the mail for this project. Empty list means "no mail", not
// "mail the admin".
export async function videoRecipientsFor(env, projectId) {
  if (!env?.DB || !projectId) return [];
  const { results } = await env.DB.prepare(
    `SELECT email FROM users
      WHERE project_id = ? AND email IS NOT NULL AND email != ''
      ORDER BY created_at ASC LIMIT 20`
  ).bind(projectId).all().catch(() => ({ results: [] }));
  return (results || []).map((r) => r.email).filter(Boolean);
}

export async function sendVideoReadyEmail(env, { jobId, origin = '' }) {
  try {
    if (!env?.DB || !jobId) return { sent: 0, skipped: 'missing_args' };

    const job = await env.DB.prepare(
      `SELECT id, project_id, blog_post_id, slug, kind, video_key FROM video_jobs WHERE id = ? LIMIT 1`
    ).bind(jobId).first().catch(() => null);
    if (!job || job.status !== 'done' || !job.video_key) {
      return { sent: 0, skipped: 'not_done' };
    }

    const project = await env.DB.prepare(
      'SELECT id, slug, name, site_name, custom_domain, publishing_url FROM projects WHERE id = ? LIMIT 1'
    ).bind(job.project_id).catch(() => null);
    if (!project) return { sent: 0, skipped: 'no_project' };

    const { results: owners } = await env.DB.prepare(
      `SELECT email FROM users
        WHERE project_id = ? AND email IS NOT NULL AND email != ''
        ORDER BY created_at ASC LIMIT 20`
    ).bind(job.project_id).all().catch(() => ({ results: [] }));
    const recipients = (owners || []).map((r) => r.email).filter(Boolean);
    if (!recipients.length) return { sent: 0, skipped: 'no_recipients' };

    const base = String(origin || '').replace(/\/+$/, '');
    const videoUrl = `${base}/${job.video_key}`;
    const articleUrl = job.kind === 'post' && project?.publishing_url
      ? `${String(project.publishing_url).replace(/\/+$/, '')}/blog/${job.slug}`
      : '';
    const kindLabel = job.kind === 'business' ? 'giới thiệu doanh nghiệp'
      : job.kind === 'website' ? 'giới thiệu website' : 'tóm tắt bài viết';

    const subject = `[${project.site_name || project.name}] Video đã sẵn sàng: ${job.slug}`;
    const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:560px;margin:0 auto">
  <div style="background:#1677ff;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">🎬 Video đã render xong</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
    <p>Xin chào,</p>
    <p>Video <strong>${esc(kindLabel)}</strong> cho <strong>${esc(job.slug)}</strong> đã render xong và sẵn sàng sử dụng.</p>
    <p style="text-align:center;margin:24px 0">
      <a href="${esc(base)}/${esc(job.video_key)}" style="background:#1677ff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">▶ Xem video ngay</a>
    </p>
    ${articleUrl ? `<p>Bài viết đầy đủ: <a href="${esc(articleUrl)}">${esc(articleUrl)}</a></p>` : ''}
    <p style="color:#6b7280;font-size:13px">Video cũng có trong admin → tab Video 9:16 — nơi bạn tải MP4 hoặc đăng lên Facebook Page.</p>
    <p style="color:#9ca3af;font-size:12px">Email tự động từ GU SEO Video Suite.</p>
  </body></html>`;

    let sent = 0;
    for (const to of recipients) {
      try {
        await sendEmail(env, { to, subject, html });
        sent++;
      } catch { /* one bad address must not stop the others */ }
    }
    return { sent, recipients: recipients.length };
  } catch (e) {
    return { sent: 0, error: String(e?.message || e).slice(0, 200) };
  }
}
