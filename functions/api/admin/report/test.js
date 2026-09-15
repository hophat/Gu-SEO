// POST /api/admin/report/test
//
// Two modes:
//   1. No blog_post_id — sends a sample report to the caller, to confirm SMTP
//      works without waiting for the next scheduled post.
//   2. With blog_post_id — runs the REAL report for that post: the project's
//      own recipients, the scheduled-post check, the live social status.
//      This is what makes the feature verifiable end to end rather than
//      "the code looks right".
//
// super_admin only — it sends mail from the platform's mailbox.
//
// Body: { to?, blog_post_id?, project_id? }

import { json } from '../../../_lib/util.js';
import { requireSuperAdmin } from '../../../_lib/auth.js';
import { sendEmail } from '../../../_lib/email_smtp.js';
import { renderReport, sendPublishReport } from '../../../_lib/publishing/report.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  let body = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }

  const auth = gate.auth || {};
  const blogPostId = String(body?.blog_post_id || '').trim();
  const projectId = String(body?.project_id || '').trim();

  // Mode 2: the real thing, with all its guards.
  if (blogPostId && projectId) {
    const result = await sendPublishReport(env, { projectId, blogPostId });
    return json(result.sent > 0 ? 200 : 409, { ok: result.sent > 0, mode: 'real', ...result });
  }

  // Mode 1: a sample, so SMTP can be checked in isolation.
  const to = String(body?.to || auth.email || '').trim();
  if (!to) return json(400, { error: 'no_recipient', detail: 'Không xác định được email người nhận.' });

  // A representative sample so the operator sees the real layout, including
  // the mixed-outcome case (one channel done, one still retrying) that is the
  // whole point of the report.
  const html = renderReport({
    projectName: 'GU SEO (email thử)',
    title: 'Đây là email báo cáo mẫu',
    description: 'Email thật sẽ chứa tiêu đề, mô tả và liên kết của bài vừa đăng.',
    blogUrl: 'https://seo.gulagi.com/blog',
    social: [
      { channel: 'facebook', status: 'published', attempts: 1, external_url: 'https://www.facebook.com/' },
      { channel: 'instagram', status: 'pending', attempts: 0, external_url: null },
    ],
  });

  try {
    await sendEmail(env, { to, subject: '[GU SEO] Email báo cáo mẫu', html });
    return json(200, { ok: true, mode: 'sample', to });
  } catch (e) {
    return json(502, { error: 'send_failed', detail: String(e?.message || e).slice(0, 300) });
  }
};
