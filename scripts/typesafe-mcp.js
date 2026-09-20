// scripts/typesafe-mcp.js — stdio MCP server that puts Jev in the agent's
// tool list, so a decision can be one tool call instead of a shell round-trip.
//
// Two tools, deliberately: `jev_decide` for the common case (pick one option,
// gated on confidence) and `jev_ask` for the raw primitives (noul / score /
// several questions in one call).
//
// The API key is read by ./lib/systemone.js from the environment or .dev.vars —
// it is never stored in opencode.json, which is a tracked file.
//
// Hard limit, same as JEV.md: Jev never authorises production deploys, D1
// writes, schema/auth/secret changes or anything irreversible.
//
// Protocol: newline-delimited JSON-RPC 2.0 on stdin/stdout. Nothing but
// responses may go to stdout; diagnostics go to stderr.

import { createInterface } from 'node:readline';
import { loadKey, askSystemOne } from './lib/systemone.js';

const KEY = loadKey();
const PROTOCOL_FALLBACK = '2024-11-05';

const TOOLS = [
  {
    name: 'jev_decide',
    description:
      'Settle one reversible decision with TypeSafe Jev: returns the chosen option, its probability, and a calibrated confidence. ' +
      'Use it instead of asking the operator when the choice is reversible and in-repo, or to gate a change. ' +
      'It never authorises production deploys, D1 writes, schema/auth/secret changes or anything irreversible — those still need the operator. ' +
      'When act_without_human is false, escalate to the operator with the reasons.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'The context the decision rests on (diff, file contents, evidence).' },
        question: { type: 'string', description: 'What to decide, phrased as a single question.' },
        options: {
          type: 'object',
          description: 'Options to choose between: key -> what that option means. At least two.',
          additionalProperties: { type: 'string' },
        },
        min_confidence: { type: 'number', description: 'Gate threshold, default 0.6. Below it, act_without_human is false.' },
        model: { type: 'string', description: 'Model alias, default jev-latest.' },
      },
      required: ['state', 'question', 'options'],
    },
  },
  {
    name: 'jev_ask',
    description:
      'Ask TypeSafe Jev raw typed questions and get structured answers back: noul (yes/no probability), score (value across ordered criteria), choice (one of your criteria). ' +
      'Ask several questions in one call — one request, no round-trips. Note: a score question carries its ordered levels in `criteria` (not `levels`). ' +
      'Same hard limit as jev_decide: never an authorisation for irreversible or operator-gated actions.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', description: 'The text or state to judge.' },
        questions: {
          type: 'object',
          description: 'Map of question key -> { type: "noul" | "score" | "choice", instructions, criteria? }',
        },
        model: { type: 'string', description: 'Model alias, default jev-latest.' },
      },
      required: ['state', 'questions'],
    },
  },
];

function send(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function sendProtocolError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`);
}

function toolText(text, isError = false) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) };
}

async function callTool(name, args = {}) {
  if (!KEY) return toolText('No TypeSafe API key. Set TYPESAFE_API_KEY or add it to .dev.vars (https://console.typesafe.ai/keys).', true);

  if (name === 'jev_decide') {
    const { state, question, options = {}, min_confidence = 0.6, model = 'jev-latest' } = args;
    if (!state || !question) return toolText('jev_decide needs state and question.', true);
    if (Object.keys(options).length < 2) return toolText('jev_decide needs at least two options.', true);

    const res = await askSystemOne(KEY, {
      state,
      model,
      questions: { decision: { type: 'choice', instructions: question, criteria: options } },
    });
    if (!res.ok) return toolText(`Jev call failed: ${res.error}`, true);

    const answer = res.answers.decision || {};
    const confidence = typeof answer.confidence === 'number' ? answer.confidence : null;
    return toolText(JSON.stringify({
      choice: answer.choice,
      probabilities: answer.probabilities,
      confidence,
      rationale: answer.rationale,
      threshold: min_confidence,
      act_without_human: confidence !== null && confidence >= min_confidence,
      usage: res.usage,
    }, null, 2));
  }

  if (name === 'jev_ask') {
    const { state, questions, model = 'jev-latest' } = args;
    if (!state || !questions) return toolText('jev_ask needs state and questions.', true);
    const res = await askSystemOne(KEY, { state, questions, model });
    if (!res.ok) return toolText(`Jev call failed: ${res.error}`, true);
    return toolText(JSON.stringify({ model: res.model, answers: res.answers, usage: res.usage }, null, 2));
  }

  return toolText(`Unknown tool "${name}". Use jev_decide or jev_ask.`, true);
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }
  const { id, method, params } = msg;

  try {
    if (method === 'initialize') {
      send(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_FALLBACK,
        capabilities: { tools: {} },
        serverInfo: { name: 'typesafe-jev', version: '1.0.0' },
      });
      return;
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
    if (method === 'ping') { send(id, {}); return; }
    if (method === 'tools/list') { send(id, { tools: TOOLS }); return; }
    if (method === 'tools/call') {
      send(id, await callTool(params?.name, params?.arguments));
      return;
    }
    if (id !== undefined) sendProtocolError(id, -32601, `method not found: ${method}`);
  } catch (err) {
    if (id !== undefined) send(id, toolText(`Internal error: ${String(err?.message || err)}`, true));
  }
});
