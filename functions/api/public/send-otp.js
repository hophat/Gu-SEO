// POST /api/public/send-otp
// Generates a 6-digit OTP code, saves it to D1, and sends via Gmail SMTP TLS
import { json, nowSec } from '../../_lib/util.js';
import { sendOtpEmail } from '../../_lib/email_smtp.js';

function validEmail(s) {
  return typeof s === 'string'
    && s.length > 3 && s.length < 200
    && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export const onRequestPost = async ({ env, request }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const email = String(body?.email || '').trim().toLowerCase();
  const brandName = String(body?.brand_name || body?.name || 'GU SEO').trim();

  if (!validEmail(email)) return json(400, { error: 'invalid_email', detail: 'Email không đúng định dạng' });

  // Check if email already registered
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ? LIMIT 1'
  ).bind(email).first().catch(() => null);
  if (existing) {
    return json(409, { error: 'email_already_exists', detail: 'Email này đã được sử dụng. Vui lòng đăng nhập.' });
  }

  const now = nowSec();
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

  try {
    await sendOtpEmail({
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
