import { json, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { getProject } from '../../../_lib/projects.js';
import { scoreProjectTopics } from '../../../_lib/project_topics.js';

export const onRequestPost = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || body?.project || 'gulagi').trim();
  const project = await getProject(env, projectId);
  if (!project) return json(404, { error: 'project_not_found' });

  const ranked = await scoreProjectTopics(env, project);
  audit(env, 'admin', 'topics.score', project.id, { ranked: ranked.length });
  return json(200, { ok: true, count: ranked.length, topics: ranked.slice(0, 20) });
};
