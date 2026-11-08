// The Debrief agent: a Nemotron tool-calling loop over a small fixed toolset, capped in steps and time.
// If it fails or runs too long, a fixed sequence of the same calls runs instead, and the result says
// which path ran (SPEC: Agent and voice decisions). Code's rule statuses, money and rewind always win;
// any disagreement from the model is kept in `mismatches`.

import { RULES } from '../policy/rules.mjs';
import { TOOLS, TOOL_ORDER, createContext, forModel, describeCost } from './tools.mjs';
import { templateSentence } from './sentences.mjs';

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_TOOL_CALLS = 8;
const MAX_SENTENCE = 240;

const SUBMIT = {
  type: 'function',
  function: {
    name: 'submit_debrief',
    description: 'Finish the debrief: one plain-language sentence per decision id, the rewind decision id, and your reading of the four rules.',
    parameters: {
      type: 'object',
      properties: {
        sentences: {
          type: 'array',
          items: {
            type: 'object',
            properties: { decision_id: { type: 'string' }, sentence: { type: 'string' } },
            required: ['decision_id', 'sentence'],
          },
        },
        rewind_decision_id: { type: 'string' },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: { rule: { type: 'integer' }, status: { type: 'string', enum: ['kept', 'broken', 'not_tested'] } },
            required: ['rule', 'status'],
          },
        },
      },
      required: ['sentences', 'rewind_decision_id'],
    },
  },
};

export function toolDefinitions() {
  return [
    ...TOOL_ORDER.map((name) => ({
      type: 'function',
      function: { name, description: TOOLS[name].description, parameters: { type: 'object', properties: {} } },
    })),
    SUBMIT,
  ];
}

function systemPrompt() {
  return [
    'You are the Debrief agent for Tell, a game where people practise spotting scam phone calls. All secrets in a call are fake.',
    'Review one finished practice call in steps using the tools, then call submit_debrief exactly once.',
    'The four rules:',
    ...RULES.map((r) => `${r.rule}. ${r.title}`),
    'The tool results are the source of truth for leaks, money, tasks and rule statuses. Never contradict them.',
    'Your jobs: investigate in steps, write ONE plain-language sentence for every decision id returned by map_moves_to_rules, and pick the rewind point: the single costliest decision.',
    'Time is short, so batch independent tools into one reply: read_transcript, find_secret_requests, check_leaks, get_verify_events and run_detector do not depend on each other; map_moves_to_rules and choose_rewind_point can go together after them. Then call submit_debrief.',
    'Sentences: second person, at most 25 words, kind and specific, never shaming, only facts the tools showed. When a legit caller was rejected, say how the player could have checked.',
  ].join('\n');
}

function userPrompt(persona, transcript) {
  return `Debrief call "${transcript.id}": ${persona.persona_name}, claiming to be ${persona.claimed_org} (actually ${persona.call_type}). The player's verdict was "${transcript.verdict ?? 'none'}". Start by reading the transcript.`;
}

function makeStep(steps, onStep, { tool, input_summary, result_summary, result, ms, by }) {
  const step = { n: steps.length + 1, tool, input_summary, result_summary, result, ms, by };
  steps.push(step);
  onStep?.(step);
  return step;
}

function runTool(ctx, name, steps, onStep, by) {
  const tool = TOOLS[name];
  const started = Date.now();
  const result = tool.run(ctx);
  return makeStep(steps, onStep, {
    tool: name,
    input_summary: tool.input(ctx),
    result_summary: tool.summary(result),
    result,
    ms: Date.now() - started,
    by,
  });
}

/** The fixed sequence: every tool once, in order, then template sentences. */
function runFixed(ctx, { onStep, reason }) {
  const steps = [];
  for (const name of TOOL_ORDER) runTool(ctx, name, steps, onStep, 'fixed');
  return assemble(ctx, { path: 'fixed', model: null, fallbackReason: reason, steps, agent: null });
}

async function runAgent(ctx, { llm, onStep, maxToolCalls, signal }) {
  const steps = [];
  const called = new Set();
  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: userPrompt(ctx.persona, ctx.transcript) },
  ];
  const tools = toolDefinitions();
  let submitted = null;
  let toolCalls = 0;
  let nudged = false;
  let limitNudged = false;
  let model = llm.model ?? null;

  while (!submitted) {
    if (signal.aborted) throw signal.reason ?? new Error('aborted');
    const { message, model: used } = await llm.chat({ messages, tools, signal });
    model = used ?? model;
    const calls = message.tool_calls ?? [];
    messages.push({ role: 'assistant', content: message.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) {
      if (nudged) break;
      nudged = true;
      messages.push({ role: 'user', content: 'Call the remaining tools you need, then call submit_debrief.' });
      continue;
    }
    for (const call of calls) {
      const name = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
      if (name === 'submit_debrief') {
        submitted = args;
        makeStep(steps, onStep, {
          tool: 'submit_debrief',
          input_summary: `${(args.sentences ?? []).length} sentences, rewind ${args.rewind_decision_id ?? 'none'}`,
          result_summary: 'debrief submitted',
          result: args,
          ms: 0,
          by: 'nemotron',
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content: '{"ok":true}' });
        continue;
      }
      if (!TOOLS[name] || toolCalls >= maxToolCalls) {
        const error = TOOLS[name] ? 'step limit reached; call submit_debrief now' : `unknown tool ${name}`;
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error }) });
        continue;
      }
      toolCalls++;
      called.add(name);
      const step = runTool(ctx, name, steps, onStep, 'nemotron');
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(forModel(name, step.result)) });
    }
    if (!submitted && toolCalls >= maxToolCalls) {
      if (limitNudged) break;
      limitNudged = true;
      messages.push({ role: 'user', content: 'Step limit reached. Call submit_debrief now.' });
    }
  }

  // Anything the model skipped is still computed by code, and logged as such.
  for (const name of TOOL_ORDER) if (!called.has(name)) runTool(ctx, name, steps, onStep, 'fixed');
  return assemble(ctx, { path: 'agent', model, fallbackReason: null, steps, agent: submitted });
}

// Models sometimes send an array argument as a JSON-encoded string, occasionally with stray
// tool-call markup after it (seen live: `[...]\n</parameter=parameter>`). Accept the array either way.
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const start = value.indexOf('[');
  const end = value.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try { const parsed = JSON.parse(value.slice(start, end + 1)); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

const cleanString = (value) => (typeof value === 'string' ? value.replace(/<\/?parameter[^>]*>/g, '').trim() : value);

function assemble(ctx, { path, model, fallbackReason, steps, agent }) {
  const persona = ctx.persona;
  const { moves, rules, decisions, outcome } = TOOLS.map_moves_to_rules.run(ctx);
  const { rewind } = TOOLS.choose_rewind_point.run(ctx);
  const detector = TOOLS.run_detector.run(ctx);
  const mismatches = [];

  const agentSentences = new Map();
  if (agent) {
    const sentences = asArray(agent.sentences)?.map((s) => ({ decision_id: cleanString(s?.decision_id), sentence: cleanString(s?.sentence) }));
    agent.rules = asArray(agent.rules) ?? [];
    agent.rewind_decision_id = cleanString(agent.rewind_decision_id);
    if (!sentences) mismatches.push({ field: 'sentences', agent: typeof agent.sentences, code: 'templates used' });
    for (const s of sentences ?? []) {
      if (typeof s?.sentence !== 'string' || !s.sentence.trim()) continue;
      if (!decisions.some((d) => d.id === s.decision_id)) {
        mismatches.push({ field: 'sentence', agent: s.decision_id, code: 'no such decision' });
        continue;
      }
      agentSentences.set(s.decision_id, s.sentence.trim().slice(0, MAX_SENTENCE));
    }
    if (rewind && agent.rewind_decision_id && agent.rewind_decision_id !== rewind.decision_id) {
      mismatches.push({ field: 'rewind', agent: agent.rewind_decision_id, code: rewind.decision_id });
    }
    for (const r of agent.rules) {
      const code = rules.find((x) => x.rule === Number(r?.rule));
      if (code && r.status !== code.status) mismatches.push({ field: `rule_${r.rule}`, agent: r.status, code: code.status });
    }
  } else if (path === 'agent') {
    mismatches.push({ field: 'submit', agent: 'never submitted', code: 'templates used' });
  }

  return {
    version: 1,
    transcript_id: ctx.transcript.id,
    persona: { id: persona.id, name: persona.persona_name, claimed_org: persona.claimed_org, call_type: persona.call_type },
    verdict: ctx.transcript.verdict ?? null,
    path,
    model,
    fallback_reason: fallbackReason,
    outcome,
    rules,
    moves: moves.map(({ event, ...m }) => (event ? { ...m, event } : m)),
    red_flags: detector.red_flags,
    detector: { source: detector.source, label: detector.label, scam_type: detector.scam_type, confidence: detector.confidence },
    decisions: decisions.map((d) => ({
      id: d.id,
      turn: d.turn,
      kind: d.kind,
      result: d.result,
      cost: d.cost,
      cost_score: d.cost_score,
      cost_label: describeCost(d),
      sentence: agentSentences.get(d.id) ?? templateSentence(d, persona),
      sentence_source: agentSentences.has(d.id) ? 'nemotron' : 'template',
    })),
    rewind,
    steps,
    mismatches,
  };
}

/**
 * Debrief one call. Uses Nemotron when `llm` is given and `mode` isn't 'fixed'; otherwise, or if the
 * agent errors or exceeds `timeoutMs`, runs the fixed sequence. `onStep` sees each step as it happens.
 */
export async function runDebrief({ persona, transcript, llm = null, mode = 'auto', timeoutMs = DEFAULT_TIMEOUT_MS, maxToolCalls = DEFAULT_MAX_TOOL_CALLS, onStep } = {}) {
  if (mode === 'fixed' || !llm) {
    return runFixed(createContext(persona, transcript), { onStep, reason: mode === 'fixed' ? 'fixed path requested' : 'no Nemotron client (NVIDIA_API_KEY not set)' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
  const agentSteps = [];
  try {
    const timeout = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
    return await Promise.race([
      runAgent(createContext(persona, transcript), {
        llm,
        maxToolCalls,
        signal: controller.signal,
        onStep: (s) => { agentSteps.push(s); onStep?.(s); },
      }),
      timeout,
    ]);
  } catch (err) {
    const reason = `agent ${controller.signal.aborted ? 'timed out' : 'failed'}: ${err?.message ?? err}`;
    onStep?.({ n: 0, tool: 'fallback', input_summary: `${agentSteps.length} agent steps abandoned`, result_summary: reason, result: null, ms: 0, by: 'fixed' });
    const result = runFixed(createContext(persona, transcript), { onStep, reason });
    result.abandoned_steps = agentSteps.map(({ result: _r, ...s }) => s);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/** Day-level rewind for the Challenge reveal: the costliest decision across the three calls. */
export function pickDayRewind(results) {
  let best = null;
  results.forEach((r, call) => {
    if (!r.rewind) return;
    const score = r.rewind.cost_you ? r.rewind.cost_score : -1;
    if (!best || score > best.score) best = { score, call, transcript_id: r.transcript_id, persona: r.persona, ...r.rewind };
  });
  if (!best) return null;
  const { score: _s, ...rest } = best;
  return rest;
}
