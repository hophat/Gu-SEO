export function createMockEnv() {
  const tables = {
    projects: new Map(),
    project_brands: new Map(),
    project_knowledge: new Map(),
    project_ai_configs: new Map(),
    project_publishing_configs: new Map(),
    project_topics: new Map(),
    project_schedules: new Map(),
    ai_runs: new Map(),
    blog_posts: new Map(),
    blog_jobs: new Map(),
    content_calendar: new Map(),
    audit_log: new Map(),
  };

  const mockDb = {
    prepare(query) {
      const q = query.trim();
      const createExecution = (params = []) => ({
        async first() {
          if (q.includes('FROM projects') && q.includes("status = 'active'")) {
            for (const p of tables.projects.values()) {
              if (p.status === 'active') return { ...p };
            }
            return null;
          }
          if (q.includes('FROM projects WHERE id = ? OR slug = ?')) {
            const [val] = params;
            for (const p of tables.projects.values()) {
              if (p.id === val || p.slug === val) return { ...p };
            }
            return null;
          }
          if (q.includes('FROM projects') && q.includes('WHERE slug = ?')) {
            for (const p of tables.projects.values()) {
              if (p.slug === params[0]) return { ...p };
            }
            return null;
          }
          if (q.includes('FROM projects') && q.includes('WHERE id = ?')) {
            for (const p of tables.projects.values()) {
              if (p.id === params[0]) return { ...p };
            }
            return null;
          }
          if (q.includes('FROM project_brands WHERE project_id = ?')) {
            return tables.project_brands.get(params[0]) || null;
          }
          if (q.includes('FROM content_calendar') && q.includes('scheduled_for >=')) {
            const [today, pid] = params;
            let count = 0;
            for (const s of tables.content_calendar.values()) {
              if (s.scheduled_for >= today && (!pid || s.project_id === pid || !s.project_id)) {
                count++;
              }
            }
            return { n: count };
          }
          if (q.includes('FROM project_ai_configs WHERE project_id = ?')) {
            return tables.project_ai_configs.get(params[0]) || null;
          }
          if (q.includes('FROM project_publishing_configs WHERE project_id = ?')) {
            return tables.project_publishing_configs.get(params[0]) || null;
          }
          if (q.includes('FROM project_schedules WHERE project_id = ?')) {
            return tables.project_schedules.get(params[0]) || null;
          }
          if (q.includes('FROM project_topics') && q.includes('project_id = ?') && q.includes("status = 'candidate'")) {
            const [pid] = params;
            for (const t of tables.project_topics.values()) {
              if (t.project_id === pid && t.status === 'candidate') return { ...t };
            }
            return null;
          }
          if (q.includes('FROM project_topics WHERE project_id = ? AND status = ?')) {
            const [pid, status] = params;
            for (const t of tables.project_topics.values()) {
              if (t.project_id === pid && t.status === status) return { ...t };
            }
            return null;
          }
          if (q.includes('FROM blog_jobs WHERE id = ?')) {
            return tables.blog_jobs.get(params[0]) || null;
          }
          return null;
        },
        async all() {
          if (q.includes('FROM projects') && q.includes('status = ?')) {
            const [status] = params;
            const filtered = Array.from(tables.projects.values()).filter(p => p.status === status);
            return { results: filtered };
          }
          if (q.includes('FROM projects') && q.includes('WHERE id = ?')) {
            const [id] = params;
            const filtered = Array.from(tables.projects.values()).filter(p => p.id === id);
            return { results: filtered };
          }
          if (q.includes('FROM projects')) {
            return { results: Array.from(tables.projects.values()) };
          }
          if (q.includes('FROM project_topics')) {
            return { results: Array.from(tables.project_topics.values()).filter(t => t.project_id === params[0]) };
          }
          if (q.includes('FROM content_calendar')) {
            const pid = params[params.length - 1];
            let results = Array.from(tables.content_calendar.values());
            if (q.includes('project_id = ? OR project_id IS NULL') && pid) {
              results = results.filter(s => s.project_id === pid || !s.project_id);
            }
            return { results };
          }
          if (q.includes('FROM blog_posts')) {
            const pid = params[0];
            let results = Array.from(tables.blog_posts.values());
            if (q.includes('project_id = ? OR project_id IS NULL') && pid) {
              results = results.filter(p => p.project_id === pid || !p.project_id);
            }
            return { results };
          }
          if (q.includes('FROM blog_jobs')) {
            const pid = params[0];
            let results = Array.from(tables.blog_jobs.values()).filter(j => j.status !== 'published');
            if (q.includes('project_id = ? OR project_id IS NULL') && pid) {
              results = results.filter(j => j.project_id === pid || !j.project_id);
            }
            return { results };
          }
          return { results: [] };
        },
        async run() {
          if (q.includes('INSERT INTO projects')) {
            const [id, slug, name, description, website_url, publishing_url, site_name, site_description, logo_url, language, timezone, status, approval_mode, created_at, updated_at] = params;
            tables.projects.set(id, { id, slug, name, description, website_url, publishing_url, site_name, site_description, logo_url, language, timezone, status, approval_mode, created_at, updated_at });
          }
          if (q.includes('INSERT INTO content_calendar')) {
            const [id, project_id, scheduled_for, title, primary_keyword, angle, created_at, updated_at] = params;
            tables.content_calendar.set(id, { id, project_id, scheduled_for, title, primary_keyword, angle, status: 'scheduled', source: 'manual', created_at, updated_at });
          }
          if (q.includes('INSERT INTO project_brands')) {
            const [project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at] = params;
            tables.project_brands.set(project_id, { project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at });
          }
          if (q.includes('INSERT INTO project_ai_configs')) {
            const [project_id, default_text_provider, default_image_provider, text_model, image_model, min_words, max_words, temperature, system_prompt_override, created_at, updated_at] = params;
            tables.project_ai_configs.set(project_id, { project_id, default_text_provider, default_image_provider, text_model, image_model, min_words, max_words, temperature, system_prompt_override, created_at, updated_at });
          }
          if (q.includes('INSERT INTO project_publishing_configs')) {
            const [project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at] = params;
            tables.project_publishing_configs.set(project_id, { project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at });
          }
          if (q.includes('INSERT INTO project_schedules')) {
            const [project_id, frequency, cron_expression, preferred_time_utc, is_active, created_at, updated_at] = params;
            tables.project_schedules.set(project_id, { project_id, frequency, cron_expression, preferred_time_utc, is_active, created_at, updated_at });
          }
          if (q.includes('INSERT INTO project_topics')) {
            const [id, project_id, key, angle, category, source, relevance_score, business_value_score, created_at, updated_at] = params;
            tables.project_topics.set(id, { id, project_id, key, angle, category, source, relevance_score, business_value_score, status: 'candidate', times_used: 0, created_at, updated_at });
          }
          if (q.includes('INSERT INTO ai_runs')) {
            const [id, project_id, task_type, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, status, error, created_at] = params;
            tables.ai_runs.set(id, { id, project_id, task_type, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, status, error, created_at });
          }
          if (q.includes('INSERT INTO blog_posts')) {
            const [id, slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt, status, topic_seed, keywords, ai_provider, project_id, created_at, published_at] = params;
            tables.blog_posts.set(id, { id, slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt, status, topic_seed, keywords, ai_provider, project_id, created_at, published_at });
          }
          if (q.includes('INSERT INTO blog_jobs')) {
            const [id, key, angle, project_id, created_at, updated_at] = params;
            tables.blog_jobs.set(id, { id, status: 'created', topic_key: key, topic_angle: angle, project_id, created_at, updated_at });
          }
          if (q.includes('UPDATE project_topics SET status = \'selected\'')) {
            const [last_used_at, updated_at, id] = params;
            const top = tables.project_topics.get(id);
            if (top) {
              top.status = 'selected';
              top.last_used_at = last_used_at;
              top.updated_at = updated_at;
              top.times_used = (top.times_used || 0) + 1;
            }
          }
          return { success: true };
        }
      });

      const exec = createExecution();
      exec.bind = (...params) => createExecution(params);
      return exec;
    }
  };

  return {
    DB: mockDb,
    tables,
    SITE_NAME: 'AI Content Factory Platform',
    ADMIN_TOKEN: 'supersecretadmintoken12345678901234567890',
  };
}
