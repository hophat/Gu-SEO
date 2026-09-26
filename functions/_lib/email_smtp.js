// Transactional send through the Cloudflare Email Service REST API.
//
// This used to be a hand-rolled SMTP client: it opened smtp.gmail.com:465
// over cloudflare:sockets, did EHLO/AUTH/MAIL FROM/RCPT TO/DATA by hand, and
// needed a GMAIL_USER / GMAIL_PASS Google app password. That whole path is
// gone, along with the credential.
//
// Why the REST API and not the `send_email` binding: the binding is Workers
// only. Pages Functions support a fixed subset of bindings (KV, Durable
// Objects, R2, D1, Vectorize, Workers AI, service, queues, Hyperdrive,
// Analytics Engine) and email is not on it — wrangler rejects `send_email` in
// a Pages config outright ("Configuration file for Pages projects does not
// support send_email"), which breaks every `wrangler pages` command. The
// documented alternative is a service binding to a Worker that owns the
// binding; that is a second deployable and a second wrangler config, and the
// REST call is one fetch, so REST it is until Pages grows the binding.
//
// Setup, once per deployment:
//
//   1. onboard the sending domain — Dashboard: Compute & AI > Email Service >
//      Email Sending > Onboard Domain. (`wrangler email sending enable` is
//      the CLI equivalent, but it 401s with code 2036 on accounts without the
//      beta enabled, so the Dashboard is the reliable path.)
//   2. create an API token with "Email Sending > Send" permission and set it
//      alongside the account id this file already expects from the domains
//      helper:
//        wrangler pages secret put CF_API_TOKEN   --project-name=gu-seo
//        wrangler pages secret put CF_ACCOUNT_ID  --project-name=gu-seo
//   3. the sender address defaults to the one below; a fork overrides it:
//        wrangler pages secret put MAIL_FROM      --project-name=gu-seo
//
// There is no mailbox behind the sending domain and none is needed: Email
// Service is send-only, so any address on an onboarded domain works as `from`,
// including one that has never existed as a user. That also means mail sent to
// it is not deliverable — a message that needs a real inbox behind "Reply"
// must set `replyTo`.

import { cfCreds, cfFetch, cfFirstError } from './cloudflare_domains.js';

const DEFAULT_FROM = { address: 'no-reply@gulagi.com', name: 'GU SEO System' };

// Resolved per call rather than at module load: `env` is only available inside
// a request, and reading it lazily also means missing config surfaces as a
// named error instead of a module-level crash.
function mailConfig(env) {
  const creds = cfCreds(env);
  if (!creds) {
    const err = new Error(
      'email_not_configured: missing CF_API_TOKEN / CF_ACCOUNT_ID. ' +
      'The token needs "Email Sending: Send" and the sending domain must be ' +
      'onboarded in the Dashboard under Compute & AI > Email Service > Email Sending.'
    );
    err.code = 'email_not_configured';
    throw err;
  }
  return creds;
}

// `{ address, name }` — the REST shape. A bare address has no display name; a
// `"Name" <addr>` form in MAIL_FROM is split into the two.
export function mailSender(env) {
  const raw = String(env?.MAIL_FROM || '').trim();
  if (!raw) return { ...DEFAULT_FROM };
  const named = /^\s*(?:"([^"]*)"|([^<>"]*?))\s*<\s*([^<>\s]+)\s*>\s*$/.exec(raw);
  if (named) {
    return { address: named[3], name: (named[1] || named[2] || '').trim() };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
    const err = new Error(`email_not_configured: MAIL_FROM is not an address: ${raw}`);
    err.code = 'email_not_configured';
    throw err;
  }
  return { address: raw, name: '' };
}

// Plain-text alternative to the HTML body. Some clients render only
// text/plain, and a message with no text part scores worse in spam filters, so
// the text part is derived rather than left to each caller.
export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sendOtpEmail(env, { toEmail, otpCode, brandName = 'GU SEO' }) {
  return sendEmail(env, {
    to: toEmail,
    subject: `Mã xác thực OTP đăng ký GU SEO: ${otpCode}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:30px 20px;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="max-width:520px;margin:0 auto;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:36px 32px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    <div style="font-size:18px;font-weight:800;color:#38bdf8;margin-bottom:24px;letter-spacing:-0.03em;">
      GU SEO &middot; SYSTEM
    </div>
    <h2 style="font-size:22px;font-weight:700;color:#ffffff;margin:0 0 12px;line-height:1.3;">
      Xác thực đăng ký tài khoản
    </h2>
    <p style="font-size:14px;color:#94a3b8;line-height:1.6;margin:0 0 24px;">
      Bạn đang tạo tài khoản gói Free trên hệ thống <b>GU SEO</b> cho thương hiệu <b>${brandName}</b>. Vui lòng nhập mã OTP bên dưới để hoàn tất:
    </p>
    <div style="background:#020617;border:1px solid #1e293b;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#34d399;display:inline-block;padding-left:10px;">
        ${otpCode}
      </span>
    </div>
    <p style="font-size:12px;color:#64748b;line-height:1.5;margin:0;">
      Mã OTP có hiệu lực trong <b>10 phút</b>. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
    </p>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#475569;display:flex;justify-content:space-between;">
      <span>&copy; 2026 GU SEO Infrastructure</span>
      <span>Hỗ trợ: 0989 511 431</span>
    </div>
  </div>
</body>
</html>`,
  });
}

// Generic transactional send. One fetch, one payload — callers only supply
// content.
export async function sendEmail(env, { to, subject, html, replyTo = '' }) {
  const creds = mailConfig(env);
  const from = mailSender(env);

  const toEmail = String(to || '').trim();
  if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
    throw new Error('invalid_recipient');
  }

  const body = String(html || '');
  const payload = {
    from,
    to: toEmail,
    subject: String(subject || ''),
    html: body,
  };
  const text = htmlToText(body);
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = String(replyTo).trim();

  const res = await cfFetch(creds, `/accounts/${creds.accountId}/email/sending/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // Not caught-and-hidden: the reason a send failed is the only thing that
    // makes the next one fixable. Every caller already has its own policy for
    // what a dead mail transport means for the request it was serving.
    const err = new Error(cfFirstError(res.body, res.status));
    err.code = 'email_send_failed';
    err.status = res.status;
    throw err;
  }

  // A 200 is not proof of delivery. The send is accepted, then reported per
  // recipient, and a suppressed or hard-bounced address comes back as a
  // successful response with the reason in one of these lists. For an OTP
  // that would be reporting "sent" for a message that is already undeliverable.
  const result = res.body?.result || {};
  const dead = [
    ...(result.permanent_bounces || []),
    ...(result.suppressed_recipients || []),
  ];
  if (dead.length) {
    const err = new Error(`recipient not deliverable: ${dead.join(', ')}`);
    err.code = 'email_rejected';
    err.status = res.status;
    throw err;
  }

  // The REST envelope spells this `message_id`; the Workers binding spells it
  // `messageId`. They are not interchangeable, and reading the wrong one yields
  // a silently empty id rather than an error.
  return { ok: true, messageId: result.message_id || '' };
}
