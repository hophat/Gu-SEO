// POST /api/public/register
// User registration with Free Tier:
// - Generates user with role='project_admin', plan_tier='free', post_limit=100
// - Creates a brand new project, brand profile, schedule, and publishing config
// - Sets session cookie and logs user in immediately
import { json, newId, nowSec, audit, slugify } from '../../_lib/util.js';
import { normalizeEmail, emailPolicyError } from '../../_lib/email_rules.js';
import { hashPassword, newSessionId, signSession, buildSessionCookie, sessionExpirySec } from '../../_lib/passwords.js';
import { getAdminToken } from '../../_lib/admin_token.js';
import { track } from '../../_lib/events.js';

const MIN_PW = 8;
const MAX_PW = 256;

export const onRequestPost = async ({ env, request }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');
  const websiteUrl = String(body?.website_url || '').trim();

  const policy = emailPolicyError(email);
  if (policy) return json(400, policy);
  if (password.length < MIN_PW || password.length > MAX_PW) {
    return json(400, { error: 'password_length', min: MIN_PW, max: MAX_PW });
  }

  // Registration deliberately collects as little as possible: email, OTP and a
  // password. The brand name and website are gathered by the mandatory setup
  // wizard right after, where the website can actually be read and turned into
  // Brand DNA. Asking for them here was friction with no benefit — the name
  // was provisional anyway.
  const localPart = email.split('@')[0].replace(/[^a-z0-9]+/gi, ' ').trim();
  const brandName = String(body?.brand_name || body?.name || '').trim()
    || (localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : 'Dự án mới');

  const otp = String(body?.otp || body?.otp_code || '').trim();
  if (!otp || otp.length !== 6) {
    return json(400, { error: 'otp_required', detail: 'Vui lòng nhập mã xác thực OTP 6 số đã được gửi qua email.' });
  }

  // Check unique email
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ? LIMIT 1'
  ).bind(email).first().catch(() => null);
  if (existing) {
    return json(409, { error: 'email_already_exists', detail: 'Email này đã được đăng ký tài khoản.' });
  }

  // Verify OTP from email_verifications table
  const now = nowSec();
  const verification = await env.DB.prepare(
    'SELECT otp_code, expires_at FROM email_verifications WHERE email = ? LIMIT 1'
  ).bind(email).first().catch(() => null);

  if (!verification) {
    return json(400, { error: 'otp_not_found', detail: 'Chưa có mã OTP nào được gửi cho email này. Vui lòng bấm Gửi OTP.' });
  }

  if (verification.expires_at < now) {
    return json(400, { error: 'otp_expired', detail: 'Mã OTP đã hết hiệu lực (quá 10 phút). Vui lòng yêu cầu mã mới.' });
  }

  if (verification.otp_code !== otp) {
    return json(400, { error: 'otp_invalid', detail: 'Mã OTP không chính xác. Vui lòng kiểm tra lại hộp thư Gmail.' });
  }

  // Mark OTP as verified / clean up
  await env.DB.prepare('UPDATE email_verifications SET verified_at = ? WHERE email = ?').bind(now, email).run();

  // Hash password
  let creds;
  try { creds = await hashPassword(password); }
  catch (e) { return json(400, { error: String(e?.message || e) }); }

  const t = nowSec();
  const userId = newId();
  const projectId = `proj_${newId().slice(0, 12)}`;
  
  // Generate unique slug for project
  let baseSlug = slugify(brandName) || 'brand';
  let slug = baseSlug;
  for (let i = 1; i <= 10; i++) {
    const existingSlug = await env.DB.prepare(
      'SELECT id FROM projects WHERE slug = ? LIMIT 1'
    ).bind(slug).first().catch(() => null);
    if (!existingSlug) break;
    slug = `${baseSlug}-${i}`;
  }

  const url = new URL(request.url);
  const publishingUrl = `${url.origin}/${slug}`;

  // 1. Create Project
  await env.DB.prepare(
    `INSERT INTO projects (
      id, slug, name, description, website_url, publishing_url,
      site_name, site_description, language, timezone, status, approval_mode,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'vi', 'Asia/Ho_Chi_Minh', 'active', 'auto', ?, ?)`
  ).bind(
    projectId,
    slug,
    brandName,
    `SEO & Content Hub cho ${brandName}`,
    // Deliberately empty, NOT `https://<slug>.com`. Fabricating a domain meant
    // the setup wizard prefilled its website field with a URL that does not
    // exist, so the first thing the operator did was click "read my site" and
    // watch it fail on an address they never typed. Empty forces them to enter
    // the real one.
    websiteUrl,
    publishingUrl,
    brandName,
    `Chuyên trang nội dung & giải pháp từ ${brandName}`,
    t,
    t
  ).run();

  // 2. Deliberately NO placeholder Brand DNA.
  //
  // This used to insert generic copy ("<name> cung cấp các giải pháp và dịch vụ
  // chuyên nghiệp hàng đầu"). That made `project_brands` non-empty for every
  // new project, so the "has Brand DNA" check was always true and the wizard's
  // Brand DNA step could never gate — the placeholder defeated the requirement
  // it was supposed to satisfy. The mandatory wizard now fills this in for real.
  //
  // The project still works without it: the AI falls back to generic copy,
  // which is exactly the outcome the gate exists to prevent.

  // 3. Create Project AI Config (Default: Workers AI free tier)
  await env.DB.prepare(
    `INSERT INTO project_ai_configs (
      project_id, default_text_provider, default_image_provider, text_model, image_model, min_words, max_words, temperature, system_prompt_override, created_at, updated_at
    ) VALUES (?, 'workers-ai', 'workers-ai', '@cf/meta/llama-3.3-70b-instruct', '@cf/black-forest-labs/flux-1-schnell', 1200, 2500, 0.7, '', ?, ?)`
  ).bind(projectId, t, t).run();

  // 4. Create Project Publishing Config
  await env.DB.prepare(
    `INSERT INTO project_publishing_configs (
      project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at
    ) VALUES (?, 'internal_d1', '', '', '{}', ?, ?)`
  ).bind(projectId, t, t).run();

  // 5. Create Project Schedule (Daily at 08:00 VN)
  await env.DB.prepare(
    `INSERT INTO project_schedules (
      project_id, frequency, cron_expression, preferred_time_utc, is_active, created_at, updated_at
    ) VALUES (?, 'daily', '0 1 * * *', '01:00', 1, ?, ?)`
  ).bind(projectId, t, t).run();

  // 6. Insert User with role='project_admin', plan_tier='free', post_limit=100
  await env.DB.prepare(
    `INSERT INTO users (
      id, email, password_hash, password_salt, created_at, role, project_id, plan_tier, post_limit
    ) VALUES (?, ?, ?, ?, ?, 'project_admin', ?, 'free', 100)`
  ).bind(
    userId,
    email,
    creds.hash,
    creds.salt,
    t,
    projectId
  ).run();

  audit(env, 'user', 'register_free', userId, { email, project_id: projectId, plan: 'free', post_limit: 100 });
  // Funnel entry point. Fire-and-forget: a failed insert must not fail a signup.
  await track(env, { event: 'signup', projectId, userId, props: { plan: 'free' } });

  // 7. Auto login: create session cookie
  const adminToken = await getAdminToken(env);
  if (!adminToken) {
    return json(200, { ok: true, id: userId, email, project_id: projectId, plan_tier: 'free', post_limit: 100 });
  }

  const sessionId = newSessionId();
  const expires = sessionExpirySec();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(
    sessionId, userId, t, expires,
    (request.headers.get('user-agent') || '').slice(0, 400)
  ).run();

  const token = await signSession(sessionId, adminToken);
  const maxAge = expires - t;

  return new Response(JSON.stringify({
    ok: true,
    id: userId,
    email,
    project_id: projectId,
    project_slug: slug,
    plan_tier: 'free',
    post_limit: 100
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': buildSessionCookie(token, maxAge),
      'cache-control': 'no-store',
    },
  });
};
