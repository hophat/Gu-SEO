import { generateContent as legacyGenerateContent, generateImage as legacyGenerateImage } from '../ai.js';
import { nowSec, newId } from '../util.js';

export async function generateContent({
  env,
  project,
  taskType = 'article',
  prompt,
  systemPrompt = '',
  maxTokens = 4000,
  temperature = 0.7,
}) {
  const tStart = Date.now();
  const aiCfg = project?.ai_config || {};
  const provider = aiCfg.default_text_provider || 'workers-ai';

  let textResult = null;
  let errorMsg = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;

  try {
    textResult = await legacyGenerateContent(env, {
      kind: taskType,
      seed: prompt,
      provider,
      brand: project?.brand,
      source: 'project-engine',
    });
    
    if (textResult?.usage) {
      promptTokens = textResult.usage.prompt_tokens || 0;
      completionTokens = textResult.usage.completion_tokens || 0;
      totalTokens = textResult.usage.total_tokens || (promptTokens + completionTokens);
    }
  } catch (err) {
    errorMsg = String(err?.message || err);
    throw err;
  } finally {
    const durationMs = Date.now() - tStart;
    if (env?.DB) {
      await env.DB.prepare(
        `INSERT INTO ai_runs (id, project_id, task_type, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, status, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newId(),
        project?.id || null,
        taskType,
        provider,
        aiCfg.text_model || 'default',
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        durationMs,
        errorMsg ? 'error' : 'success',
        errorMsg,
        nowSec()
      ).run().catch(() => {});
    }
  }

  return textResult;
}

export async function generateImage({
  env,
  project,
  prompt,
}) {
  const tStart = Date.now();
  const aiCfg = project?.ai_config || {};
  const provider = aiCfg.default_image_provider || 'workers-ai';

  let imgResult = null;
  let errorMsg = null;

  try {
    imgResult = await legacyGenerateImage(env, {
      prompt,
      provider,
      source: 'project-engine',
    });
  } catch (err) {
    errorMsg = String(err?.message || err);
    throw err;
  } finally {
    const durationMs = Date.now() - tStart;
    if (env?.DB) {
      await env.DB.prepare(
        `INSERT INTO ai_runs (id, project_id, task_type, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, status, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newId(),
        project?.id || null,
        'image',
        provider,
        aiCfg.image_model || 'default',
        0, 0, 0, 0,
        durationMs,
        errorMsg ? 'error' : 'success',
        errorMsg,
        nowSec()
      ).run().catch(() => {});
    }
  }

  return imgResult;
}
