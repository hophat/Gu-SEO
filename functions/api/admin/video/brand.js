// Brand video kit — the frame.md tokens the agent renders into every
// video for this project: tagline, accent colour, address, phone.
// Read by the claim payload; edited here by the operator.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id') || null;
  if (!projectId) return json(400, { error: 'missing_project_id' });

  const row = await env.DB.prepare(
    `SELECT video_tagline, brand_accent, address, phone, theme_color, logo_url, name
     FROM projects WHERE id = ? LIMIT 1`
  ).bind(projectId).first().catch(() => null);
  if (!row) return json(404, { error: 'project_not_found' });

  return json(200, {
    ok: true,
    brand: {
      video_tagline: row.video_tagline || '',
      brand_accent: row.brand_accent || '',
      address: row.address || '',
      phone: row.phone || '',
      theme_color: row.theme_color || '',
      logo_url: row.logo_url || '',
      name: row.name || '',
    },
  });
};

// The admin UI's apiPost helper is POST-only — both verbs land here so a
// save never dies on 405.
export const onRequestPut = brandSave;
export const onRequestPost = onRequestPut;

async function brandSave({ env, request }) {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || '');
  if (!projectId) return json(400, { error: 'missing_project_id' });

  const project = await env.DB.prepare('SELECT id FROM projects WHERE id = ? LIMIT 1').bind(projectId).first();
  if (!project) return json(404, { error: 'project_not_found' });

  // Only the four video tokens are writable here — name/logo/theme_color
  // have their own screens. The accent is normalised to #rrggbb (the UI
  // shows a "#" prefix, users type either form).
  const fields = {};
  for (const k of ['video_tagline', 'brand_accent', 'address', 'phone']) {
    if (body[k] !== undefined) {
      let v = String(body[k]).trim();
      if (k === 'brand_accent' && v && !v.startsWith('#')) v = '#' + v.replace(/[^0-9a-f]/gi, '');
      if (k === 'brand_accent' && v && !/^#[0-9a-f]{6}$/i.test(v)) {
        return json(400, { error: 'bad_accent', hint: 'brand_accent phải là mã màu #RRGGBB' });
      }
      fields[k] = v || null;
    }
  }
  if (!Object.keys(fields).length) return json(400, { error: 'nothing_to_update' });

  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  await env.DB.prepare(
    `UPDATE projects SET ${sets}, updated_at = ? WHERE id = ?`
  ).bind(...Object.values(fields), nowSec(), projectId).run();

  audit(env, 'admin', 'video.brand_update', projectId, { keys: Object.keys(fields) });
  return json(200, { ok: true, saved: Object.keys(fields) });
}
