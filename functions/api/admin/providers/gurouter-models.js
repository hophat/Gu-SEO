import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { envWithVault } from '../../../_lib/secret_vault.js';

export const onRequestGet = async ({ env, request }) => {
  try {
    const gate = await adminGate(env, request); if (gate) return gate;
    const overlayed = await envWithVault(env, ['GUROUTER_API_KEY', 'GUROUTER_BASE_URL']);
    const apiKey = overlayed?.GUROUTER_API_KEY;

    if (!apiKey) {
      return json(400, {
        ok: false,
        error: 'gurouter_not_configured',
        hint: 'Save GUROUTER_API_KEY in Settings first.',
      });
    }

    const baseUrl = (overlayed?.GUROUTER_BASE_URL || 'https://api.gurouter.com/v1').replace(/\/+$/, '');

    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return json(res.status, {
        ok: false,
        error: 'gurouter_upstream_error',
        detail: txt.slice(0, 500),
      });
    }

    const data = await res.json().catch(() => ({}));
    const rawList = Array.isArray(data) ? data : (data?.data || []);

    const models = rawList.map((m) => {
      if (typeof m === 'string') return { id: m, label: m };
      const id = m.id || m.name;
      return {
        id,
        label: m.name || m.display_name || id,
        owned_by: m.owned_by || m.provider || '',
      };
    }).filter((m) => !!m.id);

    return json(200, {
      ok: true,
      count: models.length,
      models,
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: 'server_error',
      detail: err.message,
    });
  }
};
