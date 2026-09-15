// POST /api/public/send-otp
// Generates a 6-digit OTP code, saves it to D1, and sends via Gmail SMTP TLS
import { json, nowSec } from '../../_lib/util.js';
import { sendOtpEmail } from '../../_lib/email_smtp.js';
import { normalizeEmail, canonicalEmail, emailPolicyError } from '../../_lib/email_rules.js';

// Anti-farm limits. One mailbox = one OTP stream: without a cooldown the same
// inbox can be spammed (SMTP cost) and without an IP cap one script can mint
// OTPs for unlimited addresses. Both reuse existing tables so no migration.
const OTP_RESEND_SEC = 60;
const OTP_MAX_PER_IP_PER_HOUR = 10;

function clientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

async function mailboxTaken(env, email, canonical) {
  // Fail closed on the exact address, fail open on the canonical key: a DB
  // that has not applied migration 005 has no email_canonical column, and a
  // missing column must not silently pass the duplicate check.
  try {
    const hit = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ? OR email_canonical = ? LIMIT 1'
    ).bind(email, canonical).first();
    if (hit) return true;
  } catch {
    const hit = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ? LIMIT 1'
    ).bind(email).first().catch(() => null);
    if (hit) return true;
  }
  return false;
}

export const onRequestPost = async ({ env, request }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const email = normalizeEmail(body?.email);
  const brandName = String(body?.brand_name || body?.name || 'GU SEO').trim();

  const policy = emailPolicyError(email);
  if (policy) return json(400, policy);

  // Check if this MAILBOX already registered, not just this string. Gmail
  // ignores dots, so `g.u.l.a.g.i@gmail.com` and `gulagi@gmail.com` share a
  // canonical key. The OR keeps compatibility until migration 005 has been
  // applied and every legacy row recanonicalized.
  const canonical = canonicalEmail(email);
  if (await mailboxTaken(env, email, canonical)) {
    return json(409, { error: 'email_already_exists', detail: 'Email này đã được sử dụng. Vui lòng đăng nhập.' });
  }

  const now = nowSec();

  const prior = await env.DB.prepare(
    'SELECT created_at FROM email_verifications WHERE email = ? LIMIT 1'
  ).bind(email).first().catch(() => null);
  if (prior && now - (prior.created_at || 0) < OTP_RESEND_SEC) {
    return json(429, {
      error: 'otp_cooldown',
      detail: 'Mã vừa được gửi. Vui lòng chờ giây lát trước khi yêu cầu mã mới.',
      retry_after_sec: OTP_RESEND_SEC - (now - prior.created_at),
    });
  }

  const ip = clientIp(request);
  const ipKey = `otp_ip:${ip}`;
  const windowStart = now - 3600;
  const throttle = await env.DB.prepare(
    'SELECT failures, updated_at FROM login_attempts WHERE key = ? LIMIT 1'
  ).bind(ipKey).first().catch(() => null);
  const countInWindow = throttle && (throttle.updated_at || 0) >= windowStart ? (throttle.failures || 0) : 0;
  if (countInWindow >= OTP_MAX_PER_IP_PER_HOUR) {
    return json(429, {
      error: 'otp_rate_limited',
      detail: 'Bạn đã yêu cầu quá nhiều mã OTP. Vui lòng thử lại sau.',
      retry_after_sec: (throttle.updated_at + 3600) - now,
    });
  }
  // Generate cryptographically random 6-digit number
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const otpCode = String(100000 + (array[0] % 900000));
  const expiresAt = now + 10 * 60; // 10 minutes expiry

  // Upsert into email_verifications
  await env.DB.prepare(
    `INSERT INTO email_verifications (email, otp_code, created_at, expires_at, verified_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(email) DO UPDATE SET
       otp_code = excluded.otp_code,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at,
       verified_at = NULL`
  ).bind(email, otpCode, now, expiresAt).run();

  await env.DB.prepare(
    `INSERT INTO login_attempts (key, failures, locked_until, updated_at)
     VALUES (?, ?, NULL, ?)
     ON CONFLICT(key) DO UPDATE SET
       failures = CASE WHEN excluded.updated_at - login_attempts.updated_at >= 3600
         THEN 1 ELSE login_attempts.failures + 1 END,
       updated_at = CASE WHEN excluded.updated_at - login_attempts.updated_at >= 3600
         THEN excluded.updated_at ELSE login_attempts.updated_at END`
  ).bind(ipKey, 1, now).run().catch(() => null);

  try {
    await sendOtpEmail(env, {
      toEmail: email,
      otpCode,
      brandName
    });
    return json(200, {
      ok: true,
      email,
      expires_in_sec: 600,
      message: 'Mã OTP đã được gửi đến email của bạn.'
    });
  } catch (err) {
    return json(500, {
      error: 'smtp_send_failed',
      detail: 'Không thể gửi email OTP qua máy chủ Gmail: ' + (err.message || String(err))
    });
  }
};
