// Input checks for persona cards and transcripts, the ElevenLabs transcript adapter, and a shape
// check for DebriefResult (used by tests and available to the reveal screen).

import { MOVES, TACTICS } from '../policy/rules.mjs';

const fail = (what, msg) => { throw new Error(`${what}: ${msg}`); };

export function assertPersona(p, what = 'persona') {
  if (!p || typeof p !== 'object') fail(what, 'not an object');
  for (const k of ['id', 'persona_name', 'claimed_org', 'call_type', 'fake_secrets', 'script_beats', 'stakes']) {
    if (p[k] === undefined) fail(what, `missing ${k}`);
  }
  if (!['legit', 'scam', 'hijacked'].includes(p.call_type)) fail(what, `bad call_type ${p.call_type}`);
  return p;
}

export function assertTranscript(t, what = 'transcript') {
  if (!t || typeof t !== 'object') fail(what, 'not an object');
  if (!t.id) fail(what, 'missing id');
  if (!Array.isArray(t.turns) || !t.turns.length) fail(what, 'no turns');
  t.turns.forEach((turn, i) => {
    if (!Number.isInteger(turn.turn)) fail(what, `turn ${i} has no turn number`);
    if (!['caller', 'player'].includes(turn.speaker)) fail(what, `turn ${turn.turn} has bad speaker ${turn.speaker}`);
    if (typeof turn.text !== 'string') fail(what, `turn ${turn.turn} has no text`);
  });
  if (t.verdict != null && !['real', 'scam', 'unverified'].includes(t.verdict)) fail(what, `bad verdict ${t.verdict}`);
  return t;
}

/**
 * Converts an ElevenLabs post-call transcription webhook payload into a Debrief transcript.
 * Provisional until ticket 2 captures a real payload: it reads data.transcript[] entries with
 * role ('agent' | 'user'), message and time_in_call_secs. App-side events (verify actions,
 * code pop-up, verdict) come from Tell's own records and are passed in.
 */
export function transcriptFromElevenLabs(payload, { persona_id, verdict = null, events = [] } = {}) {
  const data = payload?.data ?? payload;
  const entries = (data?.transcript ?? []).filter((e) => typeof e.message === 'string' && e.message.trim());
  return {
    id: data?.conversation_id ?? 'elevenlabs-call',
    persona_id,
    mode: 'phone',
    verdict,
    turns: entries.map((e, i) => ({
      turn: i + 1,
      t: e.time_in_call_secs ?? null,
      speaker: e.role === 'user' ? 'player' : 'caller',
      text: e.message.trim(),
    })),
    events,
  };
}

const RED_FLAG_KINDS = [...TACTICS, 'odd-payment', 'asks-for-secret'];

/** Throws if a result doesn't have the shape the reveal screen renders. */
export function assertDebriefResult(r) {
  const what = 'DebriefResult';
  if (r?.version !== 1) fail(what, 'version must be 1');
  if (!['agent', 'fixed'].includes(r.path)) fail(what, `bad path ${r.path}`);
  if (!Array.isArray(r.rules) || r.rules.length !== 4) fail(what, 'rules must have 4 entries');
  r.rules.forEach((x, i) => {
    if (x.rule !== i + 1) fail(what, `rules[${i}] out of order`);
    if (!['kept', 'broken', 'not_tested'].includes(x.status)) fail(what, `rule ${x.rule} bad status`);
    if (x.status === 'not_tested' ? x.turn !== null : !Number.isInteger(x.turn)) fail(what, `rule ${x.rule} turn mismatch`);
  });
  r.moves.forEach((m) => { if (!MOVES.includes(m.move) || !Number.isInteger(m.turn)) fail(what, `bad move ${JSON.stringify(m)}`); });
  r.red_flags.forEach((f) => { if (!RED_FLAG_KINDS.includes(f.tactic)) fail(what, `bad red flag ${f.tactic}`); });
  r.decisions.forEach((d) => {
    if (!d.id || !['worked', 'cost_you'].includes(d.result)) fail(what, `bad decision ${d.id}`);
    if (typeof d.sentence !== 'string' || !d.sentence) fail(what, `decision ${d.id} has no sentence`);
  });
  if (r.decisions.length && (!r.rewind || !r.decisions.some((d) => d.id === r.rewind.decision_id))) fail(what, 'rewind must point at a decision');
  if (!Array.isArray(r.steps) || !r.steps.length) fail(what, 'no steps logged');
  r.steps.forEach((s, i) => {
    if (s.n !== i + 1) fail(what, `step ${i} out of order`);
    if (!s.tool || typeof s.input_summary !== 'string' || typeof s.result_summary !== 'string') fail(what, `step ${s.n} incomplete`);
  });
  if (typeof r.outcome?.money_lost !== 'number') fail(what, 'outcome.money_lost missing');
  return r;
}
