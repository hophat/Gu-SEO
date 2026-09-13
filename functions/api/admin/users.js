// GET    /api/admin/users           list users (email + role + project + last_login)
// POST   /api/admin/users           { email, password, role?, project_id? } → create
// PUT    /api/admin/users?id=X      { password | role | project_id } → partial update
// DELETE /api/admin/users?id=X      remove account (sessions cascade-deleted)
//
// All four are super_admin only. To bootstrap the very first user, call
// POST with the bearer ADMIN_TOKEN — that's the only path open before any
// user exists.
import { json, newId, nowSec, audit } from '../../_lib/util.js';
import { requireSuperAdmin } from '../../_lib/auth.js';
import { hashPassword } from '../../_lib/passwords.js';

const MIN_PW = 8;
const MAX_PW = 256;
const ROLES = ['super_admin', 'project_admin'];

function validEmail(s) {
  return typeof s === 'string'
    && s.length > 3 && s.length < 200
    && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

async function projectExists(env, id) {
  if (!id) return false;
  const r = await env.DB.prepare(
    `SELECT id FROM projects WHERE id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
  return !!r;
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  const r = await env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.project_id, u.created_at, u.last_login_at,
            p.name AS project_name
       FROM users u LEFT JOIN projects p ON p.id = u.project_id
      ORDER BY u.created_at ASC`
  ).all();
  return json(200, { ok: true, users: r?.results || [] });
};

export const onRequestPost = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!validEmail(email)) return json(400, { error: 'invalid_email' });
  if (password.length < MIN_PW || password.length > MAX_PW) {
    return json(400, { error: 'password_length', min: MIN_PW, max: MAX_PW });
  }

  const role = ROLES.includes(String(body?.role || '')) ? String(body.role) : 'project_admin';
  const projectId = body?.project_id ? String(body.project_id).trim() : null;
  if (role === 'project_admin') {
    if (!projectId) return json(400, { error: 'project_required' });
    if (!(await projectExists(env, projectId))) return json(400, { error: 'unknown_project' });
  } else if (projectId && !(await projectExists(env, projectId))) {
    return json(400, { error: 'unknown_project' });
  }

  // Unique-email check (the table has UNIQUE constraint too, but a
  // friendly 409 beats a SQL error).
  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ? LIMIT 1`
  ).bind(email).first().catch(() => null);
  if (existing) return json(409, { error: 'email_already_exists' });

  let creds;
  try { creds = await hashPassword(password); }
  catch (e) { return json(400, { error: String(e?.message || e) }); }

  const id = newId();
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, created_at, role, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, email, creds.hash, creds.salt, t, role, projectId).run();

  audit(env, 'admin', 'user_create', id, { email, role, project_id: projectId });
  return json(200, { ok: true, id, email, role, project_id: projectId });
};

export const onRequestPut = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').trim();
  if (!id) return json(400, { error: 'missing_id' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const row = await env.DB.prepare(
    `SELECT id, role, project_id FROM users WHERE id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
  if (!row) return json(404, { error: 'user_not_found' });

  const wantsPassword = body?.password !== undefined && body?.password !== null;
  const wantsRole = hasKey(body, 'role');
  const wantsProject = hasKey(body, 'project_id');
  if (!wantsPassword && !wantsRole && !wantsProject) return json(400, { error: 'no_fields' });

  const nextRole = wantsRole ? String(body.role) : (row.role || 'project_admin');
  if (wantsRole && !ROLES.includes(nextRole)) return json(400, { error: 'invalid_role' });

  const projectTouched = wantsProject || wantsRole;
  const nextProject = wantsProject
    ? (body.project_id ? String(body.project_id).trim() : null)
    : row.project_id;
  if (projectTouched && nextProject && !(await projectExists(env, nextProject))) {
    return json(400, { error: 'unknown_project' });
  }
  if (projectTouched && nextRole === 'project_admin' && !nextProject) {
    return json(400, { error: 'project_required' });
  }

  const fields = [];
  if (wantsPassword) {
    const password = String(body.password);
    if (password.length < MIN_PW || password.length > MAX_PW) {
      return json(400, { error: 'password_length', min: MIN_PW, max: MAX_PW });
    }
    const creds = await hashPassword(password);
    await env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`
    ).bind(creds.hash, creds.salt, id).run();
    // Invalidate every existing session for this user — a password
    // change should kick all browsers, otherwise the change does nothing
    // to revoke ongoing access.
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run().catch(() => null);
    fields.push('password');
  }
  if (wantsRole) {
    await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(nextRole, id).run();
    fields.push('role');
  }
  if (wantsProject) {
    await env.DB.prepare(`UPDATE users SET project_id = ? WHERE id = ?`).bind(nextProject, id).run();
    fields.push('project_id');
  }

  audit(env, 'admin', 'user_update', id, { fields });
  return json(200, { ok: true, id, role: nextRole, project_id: nextProject, fields });
};

export const onRequestDelete = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').trim();
  if (!id) return json(400, { error: 'missing_id' });
  if (gate.auth?.userId && gate.auth.userId === id) {
    return json(400, { error: 'cannot_delete_self' });
  }
  // Refuse to delete the last user — otherwise password login is dead.
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  if ((cnt?.n || 0) <= 1) {
    return json(400, { error: 'cannot_delete_last_user', hint: 'Create another user before deleting this one.' });
  }
  const target = await env.DB.prepare(
    `SELECT role FROM users WHERE id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
  // A null role authenticates as super_admin (see sessionAuth), so it
  // counts toward the last-super-admin guard.
  if (target && (target.role || 'super_admin') === 'super_admin') {
    const supers = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' OR role IS NULL`
    ).first();
    if ((supers?.n || 0) <= 1) return json(400, { error: 'cannot_delete_last_super_admin' });
  }
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run().catch(() => null);
  audit(env, 'admin', 'user_delete', id, {});
  return json(200, { ok: true });
};
