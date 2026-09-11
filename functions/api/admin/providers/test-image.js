import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { generateImage } from '../../../_lib/ai.js';
import { sniffImageFormat } from '../blog/image.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch {}

  const prompt = body?.prompt || 'A modern retail clothing store with warm lighting, wood shelves, cinematic composition, photorealistic, 8k';

  try {
    const t0 = Date.now();
    const res = await generateImage(env, {
      prompt,
      provider: body?.provider || 'workers-ai',
      source: 'test-generate'
    });
    const ms = Date.now() - t0;
    const fmt = sniffImageFormat(res.bytes);

    let r2Upload = false;
    let r2Key = null;
    if (env.IMAGES && res.bytes) {
      r2Key = `test-hero-${Date.now()}.${fmt.ext}`;
      await env.IMAGES.put(r2Key, res.bytes, {
        httpMetadata: { contentType: fmt.type, cacheControl: 'public, max-age=3600' }
      });
      r2Upload = true;
    }

    return json(200, {
      ok: true,
      ms,
      bytes_length: res.bytes?.length || 0,
      format: fmt,
      provider: res.ai_provider,
      r2_uploaded: r2Upload,
      image_url: r2Key ? `https://gu-seo.pages.dev/image/${r2Key}` : null
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: 'image_generation_failed',
      detail: err.message || String(err)
    });
  }
};
