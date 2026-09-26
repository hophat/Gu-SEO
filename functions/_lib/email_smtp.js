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
//      as its own secret — it is deliberately NOT the CF_API_TOKEN this
//      project already carries, which is minted for Pages and domain
//      management and cannot send mail:
//        wrangler pages secret put CF_EMAIL_TOKEN --project-name=gu-seo
//      CF_ACCOUNT_ID is shared with the domains helper and already exists.
//   3. the sender address defaults to the one below; a fork overrides it:
//        wrangler pages secret put MAIL_FROM      --project-name=gu-seo
//
// There is no mailbox behind the sending domain and none is needed: Email
// Service is send-only, so any address on an onboarded domain works as `from`,
// including one that has never existed as a user. That also means mail sent to
// it is not deliverable — a message that needs a real inbox behind "Reply"
// must set `replyTo`.

import { cfFetch, cfFirstError } from './cloudflare_domains.js';
import { loadSettings } from './settings.js';
import { esc } from './util.js';

const DEFAULT_FROM = { address: 'no-reply@gulagi.com', name: 'GU SEO System' };

// Email branding. One resolver, because the OTP mail and the publish report
// both need it and a header that looks different in each is a bug the reader
// notices before the operator does.
//
// SITE_LOGO_URL wins over the setting so a Pages secret can override the
// database without a redeploy, matching how every other brand value resolves.
export async function mailBrand(env) {
  const settings = await loadSettings(env).catch(() => ({}));
  return {
    logoUrl: String(env?.SITE_LOGO_URL || settings?.brand_logo_url || '').trim(),
    name: String(env?.SITE_NAME || settings?.site_name || 'GU SEO').trim(),
  };
}

// The header block every message opens with.
//
// The image is always paired with the name, never substituted for it. Mail
// clients block remote images by default, and a logo that only exists in a
// blocked image is a header that reads as nothing at all. A relative URL is
// dropped for the same reason — there is no origin to resolve it against once
// the message is in someone else's inbox.
export function brandHeader({ logoUrl = '', name = 'GU SEO' } = {}, label = '') {
  // Escaped once, here. Stripping the dangerous characters first and escaping
  // after would be safe but lossy — it turns a brand named "AT&T" into "ATT".
  const safeName = esc(String(name).trim() || 'GU SEO');
  const safeLabel = esc(String(label).trim());
  const isWebImage = /^https?:\/\/\S+$/i.test(String(logoUrl).trim());
  const img = isWebImage
    ? `<img src="${esc(logoUrl)}" alt="${safeName}" width="32" height="32" ` +
      'style="display:block;width:32px;height:32px;border-radius:8px;border:0;object-fit:contain;" />'
    : '';
  return `
    <div style="margin-bottom:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          ${img ? `<td style="padding-right:12px;vertical-align:middle;">${img}</td>` : ''}
          <td style="vertical-align:middle;">
            <div style="font-size:18px;font-weight:800;color:#38bdf8;letter-spacing:-0.03em;line-height:1.2;">
              ${safeName.toUpperCase()}
            </div>
            ${safeLabel
              ? `<div style="font-size:11px;color:#64748b;letter-spacing:0.08em;margin-top:3px;">${safeLabel.toUpperCase()}</div>`
              : ''}
          </td>
        </tr>
      </table>
    </div>`;
}

// Resolved per call rather than at module load: `env` is only available inside
// a request, and reading it lazily also means missing config surfaces as a
// named error instead of a module-level crash.
//
// CF_EMAIL_TOKEN is read first and CF_API_TOKEN second, and the two are kept
// apart on purpose. The general token this project already carries was minted
// for Pages/domain management; a token minted for Email Sending does not carry
// those permissions, and vice versa. Sharing one secret means every time its
// permission set is changed, some other feature silently stops working — so
// mail gets its own, and falls back to the shared one only if an install has
// just the one.
function mailConfig(env) {
  const token = String(env?.CF_EMAIL_TOKEN || '').trim()
    || String(env?.CF_API_TOKEN || env?.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(env?.CF_ACCOUNT_ID || env?.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !accountId) {
    const err = new Error(
      'email_not_configured: missing CF_EMAIL_TOKEN (or CF_API_TOKEN) / CF_ACCOUNT_ID. ' +
      'The token needs "Email Sending: Send" and the sending domain must be ' +
      'onboarded in the Dashboard under Compute & AI > Email Service > Email Sending.'
    );
    err.code = 'email_not_configured';
    throw err;
  }
  return { token, accountId };
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
  const header = brandHeader(await mailBrand(env), 'SYSTEM');
  return sendEmail(env, {
    to: toEmail,
    subject: `Mã xác thực OTP đăng ký GU SEO: ${otpCode}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:30px 20px;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="max-width:520px;margin:0 auto;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:36px 32px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">${header}
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
