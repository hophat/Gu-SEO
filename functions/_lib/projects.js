import { nowSec, newId } from './util.js';

export async function getProject(env, idOrSlug) {
  if (!env.DB || !idOrSlug) return null;
  const project = await env.DB.prepare(
    `SELECT * FROM projects WHERE id = ? OR slug = ? LIMIT 1`
  ).bind(idOrSlug, idOrSlug).first().catch(() => null);

  if (!project) return null;

  const [brand, aiConfig, publishing, schedule] = await Promise.all([
    env.DB.prepare(`SELECT * FROM project_brands WHERE project_id = ?`).bind(project.id).first().catch(() => null),
    env.DB.prepare(`SELECT * FROM project_ai_configs WHERE project_id = ?`).bind(project.id).first().catch(() => null),
    env.DB.prepare(`SELECT * FROM project_publishing_configs WHERE project_id = ?`).bind(project.id).first().catch(() => null),
    env.DB.prepare(`SELECT * FROM project_schedules WHERE project_id = ?`).bind(project.id).first().catch(() => null),
  ]);

  return {
    ...project,
    brand: brand || {},
    ai_config: aiConfig || {},
    publishing_config: publishing || {},
    schedule: schedule || {},
  };
}

export async function listProjects(env, { status = 'active' } = {}) {
  if (!env.DB) return [];
  const query = status === 'all'
    ? `SELECT * FROM projects ORDER BY created_at DESC`
    : `SELECT * FROM projects WHERE status = ? ORDER BY created_at DESC`;
  
  const stmt = status === 'all'
    ? env.DB.prepare(query)
    : env.DB.prepare(query).bind(status);

  const res = await (stmt.all ? stmt.all() : env.DB.prepare(query).all?.()).catch(() => ({ results: [] }));
  return res?.results || [];
}

export async function upsertProject(env, projectData) {
  if (!env.DB) throw new Error('Database binding missing');
  const t = nowSec();
  const id = projectData.id || newId();
  const slug = projectData.slug;
  if (!slug) throw new Error('Project slug is required');

  await env.DB.prepare(
    `INSERT INTO projects (id, slug, name, description, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       slug = excluded.slug,
       name = excluded.name,
       description = excluded.description,
       website_url = excluded.website_url,
       publishing_url = excluded.publishing_url,
       language = excluded.language,
       timezone = excluded.timezone,
       status = excluded.status,
       approval_mode = excluded.approval_mode,
       updated_at = excluded.updated_at`
  ).bind(
    id,
    slug,
    projectData.name || slug,
    projectData.description || '',
    projectData.website_url || '',
    projectData.publishing_url || '',
    projectData.language || 'vi',
    projectData.timezone || 'Asia/Ho_Chi_Minh',
    projectData.status || 'active',
    projectData.approval_mode || 'auto',
    t,
    t
  ).run();

  if (projectData.brand) {
    const b = projectData.brand;
    await env.DB.prepare(
      `INSERT INTO project_brands (project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         business_type = excluded.business_type,
         tone = excluded.tone,
         audience = excluded.audience,
         key_themes = excluded.key_themes,
         topics_to_avoid = excluded.topics_to_avoid,
         service_area = excluded.service_area,
         cta = excluded.cta,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      b.business_type || '',
      b.tone || '',
      b.audience || '',
      b.key_themes || '',
      b.topics_to_avoid || '',
      b.service_area || '',
      b.cta || '',
      t,
      t
    ).run();
  }

  if (projectData.ai_config) {
    const a = projectData.ai_config;
    await env.DB.prepare(
      `INSERT INTO project_ai_configs (project_id, default_text_provider, default_image_provider, text_model, image_model, min_words, max_words, temperature, system_prompt_override, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         default_text_provider = excluded.default_text_provider,
         default_image_provider = excluded.default_image_provider,
         text_model = excluded.text_model,
         image_model = excluded.image_model,
         min_words = excluded.min_words,
         max_words = excluded.max_words,
         temperature = excluded.temperature,
         system_prompt_override = excluded.system_prompt_override,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      a.default_text_provider || 'workers-ai',
      a.default_image_provider || 'workers-ai',
      a.text_model || '',
      a.image_model || '',
      a.min_words || 1500,
      a.max_words || 3000,
      a.temperature || 0.7,
      a.system_prompt_override || '',
      t,
      t
    ).run();
  }

  if (projectData.publishing_config) {
    const p = projectData.publishing_config;
    await env.DB.prepare(
      `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         publisher_type = excluded.publisher_type,
         endpoint_url = excluded.endpoint_url,
         auth_header = excluded.auth_header,
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      p.publisher_type || 'internal_d1',
      p.endpoint_url || '',
      p.auth_header || '',
      typeof p.config_json === 'object' ? JSON.stringify(p.config_json) : (p.config_json || '{}'),
      t,
      t
    ).run();
  }

  if (projectData.schedule) {
    const s = projectData.schedule;
    await env.DB.prepare(
      `INSERT INTO project_schedules (project_id, frequency, cron_expression, preferred_time_utc, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         frequency = excluded.frequency,
         cron_expression = excluded.cron_expression,
         preferred_time_utc = excluded.preferred_time_utc,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      s.frequency || 'daily',
      s.cron_expression || '0 8 * * *',
      s.preferred_time_utc || '08:00',
      s.is_active !== undefined ? (s.is_active ? 1 : 0) : 1,
      t,
      t
    ).run();
  }

  return getProject(env, id);
}
