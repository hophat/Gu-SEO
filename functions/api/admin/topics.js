import { json } from '../../_lib/util.js';
import { adminGate } from '../../_lib/auth.js';
import { getProject } from '../../_lib/projects.js';
import { listProjectTopics, addProjectTopic, generateAutonomousTopics } from '../../_lib/project_topics.js';

export const onRequestGet = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return json(400, { error: 'missing_project_id' });

  const status = url.searchParams.get('status') || 'candidate';
  const topics = await listProjectTopics(env, projectId, { status });
  return json(200, { ok: true, topics });
};

export const onRequestPost = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = body.project_id;
  if (!projectId) return json(400, { error: 'missing_project_id' });

  const project = await getProject(env, projectId);
  if (!project) return json(404, { error: 'project_not_found' });

  if (body.action === 'generate') {
    const count = parseInt(body.count, 10) || 5;
    const topics = await generateAutonomousTopics(env, project, { count });
    return json(200, { ok: true, count: topics.length, topics });
  }

  if (!body.key) return json(400, { error: 'missing_topic_key' });

  const topic = await addProjectTopic(env, {
    projectId,
    key: body.key,
    angle: body.angle,
    category: body.category,
    source: body.source || 'manual',
    relevanceScore: body.relevance_score || 85,
    businessValueScore: body.business_value_score || 85,
  });

  return json(200, { ok: true, topic });
};
