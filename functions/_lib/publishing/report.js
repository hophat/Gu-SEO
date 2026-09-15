// Publish report email.
//
// Sent after a SCHEDULED post finishes: the blog article is live, and the
// external channel (Facebook) has either gone out or is still retrying. The
// recipient is whoever owns the project — `users.project_id` — not the
// super_admin who happens to be logged in.
//
// Why only scheduled posts: the calendar is the operator's standing instruction
// ("write and publish this on that day"). A post they published by hand is one
// they already watched happen, so mailing them about it is noise. The signal
// that matters is "the thing you asked for weeks ago went out".
//
// Two rules this file follows:
//   - Never fail the publish. Email is a notification; a dead SMTP server must
//     not turn a successful publish into an error. Every caller wraps this in
//     catch().
//   - Never claim more than we know. If the Facebook job is still pending, the
//     email says so rather than implying it went out.

import { sendEmail } from '../email_smtp.js';
import { loadSettings } from '../settings.js';

const STATUS_LABEL = {
  published: { text: 'Đã đăng', color: '#16a34a' },
  pending:   { text: 'Đang chờ đăng', color: '#d97706' },
  publishing:{ text: 'Đang đăng', color: '#d97706' },
  failed:    { text: 'Đăng thất bại', color: '#dc2626' },
  skipped:   { text: 'Đã huỷ', color: '#6b7280' },
};

const CHANNEL_LABEL = {
  facebook: 'Facebook Page',
  instagram: 'Instagram',
  threads: 'Threads',
  wordpress: 'WordPress',
  webhook: 'Webhook',
  custom_api: 'Custom API',
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Who gets the mail for this project. Falls back to nobody rather than
// guessing — an empty list means "no report", not "mail the admin".
export async function recipientsFor(env, projectId) {
  if (!env?.DB || !projectId) return [];
  const { results } = await env.DB.prepare(
    `SELECT email FROM users
      WHERE project_id = ? AND email IS NOT NULL AND email != ''
      ORDER BY created_at ASC LIMIT 20`
  ).bind(projectId).all().catch(() => ({ results: [] }));
  return (results || []).map((r) => r.email).filter(Boolean);
}

// Was this post produced from a calendar slot? That is the only case we report.
export async function isScheduledPost(env, blogPostId) {
  if (!env?.DB || !blogPostId) return false;
  const row = await env.DB.prepare(
    'SELECT 1 AS x FROM content_calendar WHERE post_id = ? LIMIT 1'
  ).bind(blogPostId).first().catch(() => null);
  return !!row;
}

export function renderReport({ projectName, title, description, blogUrl, social }) {
  const socialRows = social.length
    ? social.map((s) => {
        const meta = STATUS_LABEL[s.status] || { text: s.status, color: '#6b7280' };
        const channel = CHANNEL_LABEL[s.channel] || s.channel;
        const link = s.external_url
          ? `<a href="${esc(s.external_url)}" style="color:#38bdf8;text-decoration:none;">Xem bài đăng →</a>`
          : (s.status === 'failed' && s.error
              ? `<span style="color:#f87171;font-size:12px;">${esc(String(s.error).slice(0, 160))}</span>`
              : '<span style="color:#64748b;font-size:12px;">Chưa có liên kết</span>');
        return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #1e293b;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${meta.color};margin-right:8px;"></span>
            <b style="color:#e2e8f0;font-size:13px;">${esc(channel)}</b>
            <span style="color:${meta.color};font-size:12px;margin-left:6px;">${esc(meta.text)}</span>
            ${s.attempts > 1 ? `<span style="color:#64748b;font-size:11px;margin-left:6px;">(lần thử ${s.attempts})</span>` : ''}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #1e293b;text-align:right;">${link}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="2" style="padding:10px 0;color:#64748b;font-size:13px;">
         Chưa kết nối kênh mạng xã hội — bài chỉ đăng trên blog.
       </td></tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:30px 20px;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="max-width:560px;margin:0 auto;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:36px 32px;">
    <div style="font-size:18px;font-weight:800;color:#38bdf8;margin-bottom:6px;letter-spacing:-0.03em;">
      GU SEO &middot; BÁO CÁO
    </div>
    <div style="font-size:12px;color:#64748b;margin-bottom:24px;">${esc(projectName)}</div>

    <h2 style="font-size:20px;font-weight:700;color:#ffffff;margin:0 0 10px;line-height:1.35;">
      ${esc(title)}
    </h2>
    ${description ? `<p style="font-size:14px;color:#94a3b8;line-height:1.6;margin:0 0 20px;">${esc(description)}</p>` : ''}

    <div style="background:#020617;border:1px solid #1e293b;border-radius:12px;padding:16px 18px;margin:0 0 20px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-bottom:10px;">Phân phối</div>
      <table style="width:100%;border-collapse:collapse;">${socialRows}</table>
    </div>

    <a href="${esc(blogUrl)}" style="display:inline-block;background:#0ea5e9;color:#001018;font-weight:700;font-size:14px;padding:11px 20px;border-radius:8px;text-decoration:none;">
      Đọc bài trên blog →
    </a>

    <div style="margin-top:28px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#475569;">
      Bài viết được tạo tự động theo lịch nội dung của dự án.
    </div>
  </div>
</body>
</html>`;
}

// Send the report. Returns a small result rather than throwing, so callers can
// log what happened without a try/catch around every call site.
//
// `baseUrl` is passed in rather than the Request object: this runs inside
// waitUntil, after the response has gone out, and a Request is not reliably
// usable at that point. The caller already has the resolved public base.
export async function sendPublishReport(env, { projectId, blogPostId, baseUrl = '' }) {
  try {
    if (!env?.DB || !projectId || !blogPostId) return { sent: 0, skipped: 'missing_args' };

    // Kill switch. Default is on, so an unset row still sends; an operator who
    // turns it off does not have to redeploy to stop the mail.
    const settings = await loadSettings(env).catch(() => ({}));
    if (settings.publish_report_email === '0' || settings.publish_report_email === 'false') {
      return { sent: 0, skipped: 'disabled' };
    }

    // Only scheduled posts, by explicit request. Checked here rather than at
    // the call site so every caller gets the same rule.
    if (!(await isScheduledPost(env, blogPostId))) {
      return { sent: 0, skipped: 'not_scheduled' };
    }

    const post = await env.DB.prepare(
      `SELECT id, slug, title, meta_description, status FROM blog_posts WHERE id = ? LIMIT 1`
    ).bind(blogPostId).first().catch(() => null);
    if (!post || post.status !== 'published') return { sent: 0, skipped: 'not_published' };

    const project = await env.DB.prepare(
      'SELECT id, slug, name, site_name, custom_domain FROM projects WHERE id = ? LIMIT 1'
    ).bind(projectId).first().catch(() => null);
    if (!project) return { sent: 0, skipped: 'no_project' };

    const recipients = await recipientsFor(env, projectId);
    if (!recipients.length) return { sent: 0, skipped: 'no_recipients' };

    // Current state of every external channel for this post.
    const social = ((await env.DB.prepare(
      `SELECT channel, status, attempts, external_url, error FROM social_posts
        WHERE blog_post_id = ? ORDER BY created_at ASC`
    ).bind(blogPostId).all().catch(() => ({ results: [] }))).results) || [];

    const base = String(baseUrl || '').replace(/\/+$/, '');
    const origin = base || (project.custom_domain
      ? `https://${project.custom_domain}`
      : `https://seo.gulagi.com/${project.slug}`);
    const blogUrl = `${String(origin).replace(/\/+$/, '')}/blog/${post.slug}`;

    const publishedChannels = social.filter((s) => s.status === 'published').length;
    const subject = social.length
      ? `[${project.site_name || project.name}] Đã đăng bài + ${publishedChannels}/${social.length} kênh`
      : `[${project.site_name || project.name}] Đã đăng bài mới`;

    const html = renderReport({
      projectName: project.site_name || project.name,
      title: post.title,
      description: post.meta_description,
      blogUrl,
      social,
    });

    let sent = 0;
    const failed = [];
    for (const to of recipients) {
      try {
        await sendEmail(env, { to, subject, html });
        sent++;
      } catch (e) {
        // One bad address must not stop the others.
        failed.push({ to, error: String(e?.message || e).slice(0, 120) });
      }
    }

    return { sent, failed: failed.length ? failed : undefined, recipients: recipients.length, social: social.length };
  } catch (e) {
    return { sent: 0, error: String(e?.message || e).slice(0, 200) };
  }
}
