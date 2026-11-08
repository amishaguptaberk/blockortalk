import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runDebrief, pickDayRewind, assertDebriefResult, assertPersona, assertTranscript, transcriptFromElevenLabs,
} from '../lib/debrief/index.mjs';
import { mentionsSecret } from '../lib/policy/normalize.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...p) => JSON.parse(readFileSync(join(root, ...p), 'utf8'));
const persona = (id) => readJson('data', 'personas', `${id}.json`);
const transcript = (id) => readJson('data', 'transcripts', `${id}.json`);
const samples = readdirSync(join(root, 'data', 'transcripts')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
const fixed = (id) => {
  const t = transcript(id);
  return runDebrief({ persona: persona(t.persona_id), transcript: t, mode: 'fixed' });
};

// ---------- content (Lane D scripts) ----------

test('Nina, Marcus and James have cards with beats, fake secrets, a quirk and the fixed disclosure line', () => {
  const disclosure = "It's recorded for your report. Say 'stop drill' anytime.";
  for (const id of ['nina', 'marcus', 'james']) {
    const p = assertPersona(persona(id));
    assert.ok(p.quirk.length > 10, `${id} quirk`);
    assert.ok(p.script_beats.length >= 4, `${id} beats`);
    assert.equal(p.script_beats[0].line, disclosure, `${id} opens with the disclosure line`);
    assert.match(p.script_beats[1].line, /^Hi, is this Alex\? This is \w+ with .+, calling about .+\.$/, `${id} uses the shared opening template`);
    for (const k of ['date_of_birth', 'home_address', 'card_ending', 'account_pin']) assert.ok(p.fake_secrets[k], `${id} carries ${k}`);
    assert.match(p.claimed_org, /^(Bluebonnet Labs|Corvanta Bank)/, `${id} uses a fictional brand`);
  }
  assert.equal(persona('nina').call_type, 'legit');
  assert.ok(persona('nina').script_beats.every((b) => !b.asks_for), 'Nina never asks for a secret');
  assert.equal(persona('marcus').call_type, 'scam');
  assert.ok(persona('marcus').fake_secrets.gift_card_code);
  assert.deepEqual(persona('marcus').stakes.cost_secrets, ['gift_card_code']);
  assert.equal(persona('marcus').stakes.cost, 350);
  assert.equal(persona('james').call_type, 'hijacked');
  assert.ok(persona('james').fake_secrets.live_code);
  assert.equal(persona('james').stakes.cost, 650);
  assert.ok(persona('james').script_beats.some((b) => b.event === 'code_popup'));
});

test('each persona has a safe and a slip sample transcript', () => {
  assert.ok(samples.length >= 6);
  for (const id of ['nina', 'marcus', 'james']) {
    assert.ok(samples.includes(`${id}-safe`), `${id}-safe`);
    assert.ok(samples.includes(`${id}-slip`), `${id}-slip`);
  }
  for (const id of samples) assertTranscript(transcript(id), id);
});

// ---------- normalized leak check ----------

test('spoken and typed secrets match after normalization', () => {
  const yes = [
    ['eight three oh two', 'account_pin', '8302'],
    ["It's three one eight, nine oh two.", 'live_code', '318 902'],
    ['five fifty-one, two seventy-four', 'live_code', '551 274'],
    ['March fourteenth ninety-one', 'date_of_birth', '1991-03-14'],
    ['July twenty-second, nineteen ninety-four', 'date_of_birth', '1994-07-22'],
    ['my birthday is 7/22/94', 'date_of_birth', '1994-07-22'],
    ['the 22nd of July 1994', 'date_of_birth', '1994-07-22'],
    ['twenty-seven sixteen Mesquite Bend Lane', 'home_address', '2716 Mesquite Bend Ln, Richardson TX'],
    ['four eight two nine, three one five six, seven seven two zero', 'gift_card_code', '4829 3156 7720'],
    ['4829-3156-7720', 'gift_card_code', '4829 3156 7720'],
  ];
  for (const [text, key, value] of yes) assert.ok(mentionsSecret(text, key, value), `should match: ${text}`);
  const no = [
    ['Oh, okay. How do I pay that?', 'live_code', '318 902'],
    ['CV-77104. What happens now?', 'account_pin', '6093'],
    ['July twenty-second', 'date_of_birth', '1994-07-22'],
    ['I live on Mesquite Bend', 'home_address', '2716 Mesquite Bend Ln, Richardson TX'],
    ['May I ask who is calling?', 'date_of_birth', '1994-05-01'],
  ];
  for (const [text, key, value] of no) assert.ok(!mentionsSecret(text, key, value), `should not match: ${text}`);
});

// ---------- the agent's answers on every sample ----------

for (const id of samples) {
  test(`${id}: rules, money, task, moves and rewind match the expected block`, async () => {
    const t = transcript(id);
    const r = assertDebriefResult(await fixed(id));
    const e = t.expected;
    for (const [n, want] of Object.entries(e.rules)) {
      const got = r.rules[Number(n) - 1];
      assert.equal(got.status, want.status, `rule ${n} status`);
      if (want.turn !== undefined) assert.equal(got.turn, want.turn, `rule ${n} turn`);
    }
    assert.equal(r.outcome.money_lost, e.money_lost);
    assert.equal(r.outcome.task?.status ?? null, e.task);
    assert.deepEqual([...r.outcome.leaked].sort(), [...e.leaked].sort());
    assert.deepEqual(r.moves.map((m) => `${m.move}@${m.turn}`).sort(), [...e.moves].sort());
    assert.equal(r.rewind.turn, e.rewind_turn);
    assert.equal(r.rewind.cost_you, e.rewind_cost_you);
    for (const d of r.decisions) assert.ok(d.sentence.length > 10, `${d.id} has a sentence`);
  });
}

test('James slips: rules 1 and 3 are broken at the turn where the code is read', async () => {
  const r = await fixed('james-slip');
  const codeTurn = transcript('james-slip').turns.find((t) => /three one eight, nine oh two/.test(t.text)).turn;
  assert.equal(r.rules[0].status, 'broken');
  assert.equal(r.rules[0].turn, codeTurn);
  assert.equal(r.rules[2].status, 'broken');
  assert.equal(r.rules[2].turn, codeTurn);
  assert.equal(r.outcome.money_lost, 650);
  assert.equal(r.outcome.task.status, 'failed');
});

test('repeating a detail the caller said first is not a leak', async () => {
  const r = await fixed('james-slip'); // turn 5: "Yes, ending 4471, that's my card."
  assert.ok(!r.outcome.leaked.includes('card_ending'));
});

test('the agent works on transcripts without beat tags', async () => {
  const t = transcript('james-slip');
  const bare = { ...t, turns: t.turns.map(({ beat: _b, ...turn }) => turn) };
  const a = await fixed('james-slip');
  const b = await runDebrief({ persona: persona('james'), transcript: bare, mode: 'fixed' });
  assert.deepEqual(b.rules, a.rules);
  assert.deepEqual(b.rewind, a.rewind);
});

test('every step is logged in order with its input summary and result', async () => {
  const r = await fixed('marcus-slip');
  assert.deepEqual(r.steps.map((s) => s.tool), [
    'read_transcript', 'find_secret_requests', 'check_leaks', 'get_verify_events', 'run_detector', 'map_moves_to_rules', 'choose_rewind_point',
  ]);
  r.steps.forEach((s, i) => {
    assert.equal(s.n, i + 1);
    assert.ok(s.input_summary && s.result_summary && s.result !== undefined);
    assert.equal(s.by, 'fixed');
  });
  assert.equal(r.path, 'fixed');
  assert.ok(r.fallback_reason);
});

test('red flags: the gift-card line lights up, and a legit caller confirming details is not flagged', async () => {
  const marcus = await fixed('marcus-slip');
  assert.ok(marcus.red_flags.some((f) => f.turn === 8 && f.tactic === 'odd-payment'));
  const nina = await fixed('nina-safe');
  assert.equal(nina.red_flags.filter((f) => f.tactic === 'details-as-proof').length, 0);
  for (const f of marcus.red_flags) {
    const text = transcript('marcus-slip').turns.find((t) => t.turn === f.turn).text;
    assert.equal(text.slice(f.span.start, f.span.end), f.span.text, 'span offsets point into the turn text');
  }
});

// ---------- Nemotron loop, with a fake LLM ----------

function scriptedLlm(replies) {
  let i = 0;
  return {
    model: 'fake-nemotron',
    async chat() {
      const reply = replies[Math.min(i++, replies.length - 1)];
      return { message: typeof reply === 'function' ? reply() : reply, model: 'fake-nemotron' };
    },
  };
}
const call = (id, name, args = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('agent path: Nemotron picks the tools, writes the sentences, and its steps are logged in order', async () => {
  const llm = scriptedLlm([
    { content: null, tool_calls: [call('a', 'read_transcript'), call('b', 'check_leaks'), call('c', 'find_secret_requests')] },
    { content: null, tool_calls: [call('d', 'map_moves_to_rules'), call('e', 'choose_rewind_point')] },
    {
      content: null,
      tool_calls: [call('f', 'submit_debrief', {
        // Sent as a JSON string with trailing markup on purpose: Nemotron did exactly this in live runs.
        sentences: `${JSON.stringify([{ decision_id: 'd9-leak', sentence: 'Reading the code cost you $650.' }])}\n</parameter=parameter>`,
        rewind_decision_id: 'd9-leak\n</parameter=parameter>',
        rules: [{ rule: 1, status: 'broken' }, { rule: 3, status: 'broken' }],
      })],
    },
  ]);
  const r = assertDebriefResult(await runDebrief({ persona: persona('james'), transcript: transcript('james-slip'), llm }));
  assert.equal(r.path, 'agent');
  assert.equal(r.model, 'fake-nemotron');
  assert.deepEqual(r.steps.slice(0, 6).map((s) => [s.tool, s.by]), [
    ['read_transcript', 'nemotron'], ['check_leaks', 'nemotron'], ['find_secret_requests', 'nemotron'],
    ['map_moves_to_rules', 'nemotron'], ['choose_rewind_point', 'nemotron'], ['submit_debrief', 'nemotron'],
  ]);
  // Tools the model skipped are still run by code and logged as fill-ins.
  assert.deepEqual(r.steps.slice(6).map((s) => [s.tool, s.by]), [['get_verify_events', 'fixed'], ['run_detector', 'fixed']]);
  const leak = r.decisions.find((d) => d.id === 'd9-leak');
  assert.equal(leak.sentence, 'Reading the code cost you $650.');
  assert.equal(leak.sentence_source, 'nemotron');
  assert.equal(r.decisions.find((d) => d.kind === 'verdict').sentence_source, 'template');
  assert.deepEqual(r.mismatches, []);
});

test("agent path: when Nemotron contradicts code, code's answer is shown and the mismatch is logged", async () => {
  const llm = scriptedLlm([
    { content: null, tool_calls: [call('a', 'map_moves_to_rules')] },
    { content: null, tool_calls: [call('b', 'submit_debrief', { sentences: [], rewind_decision_id: 'verdict', rules: [{ rule: 1, status: 'kept' }] })] },
  ]);
  const r = await runDebrief({ persona: persona('james'), transcript: transcript('james-slip'), llm });
  assert.equal(r.rules[0].status, 'broken');
  assert.equal(r.rewind.decision_id, 'd9-leak');
  assert.deepEqual(r.mismatches.map((m) => m.field).sort(), ['rewind', 'rule_1']);
});

test('agent path: an LLM error falls back to the fixed sequence and says so', async () => {
  const llm = { model: 'fake', async chat() { throw new Error('HTTP 500'); } };
  const r = assertDebriefResult(await runDebrief({ persona: persona('nina'), transcript: transcript('nina-slip'), llm }));
  assert.equal(r.path, 'fixed');
  assert.match(r.fallback_reason, /agent failed: HTTP 500/);
  assert.equal(r.rules[3].status, 'broken');
});

test('agent path: running past the time limit falls back to the fixed sequence', async () => {
  const llm = {
    model: 'slow',
    chat: ({ signal }) => new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({ message: { content: 'late' } }), 5000);
      signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
    }),
  };
  const r = await runDebrief({ persona: persona('marcus'), transcript: transcript('marcus-slip'), llm, timeoutMs: 50 });
  assert.equal(r.path, 'fixed');
  assert.match(r.fallback_reason, /timed out/);
  assert.equal(r.outcome.money_lost, 350);
});

test('agent path: a model that never submits still gets a full result, with templates and a logged mismatch', async () => {
  const llm = scriptedLlm([{ content: 'All done!' }]);
  const r = assertDebriefResult(await runDebrief({ persona: persona('marcus'), transcript: transcript('marcus-safe'), llm }));
  assert.equal(r.path, 'agent');
  assert.equal(r.steps.length, 7);
  assert.ok(r.steps.every((s) => s.by === 'fixed'));
  assert.ok(r.mismatches.some((m) => m.field === 'submit'));
});

// ---------- integration helpers ----------

test('an ElevenLabs post-call transcript converts and debriefs', async () => {
  const t = transcript('james-slip');
  const payload = {
    type: 'post_call_transcription',
    data: {
      conversation_id: 'conv_123',
      transcript: t.turns.map((x) => ({ role: x.speaker === 'player' ? 'user' : 'agent', message: x.text, time_in_call_secs: x.t }))
        .concat([{ role: 'agent', message: null, time_in_call_secs: 60 }]),
    },
  };
  const converted = transcriptFromElevenLabs(payload, { persona_id: 'james', verdict: 'real', events: t.events });
  assert.equal(converted.id, 'conv_123');
  assert.equal(converted.turns.length, t.turns.length);
  const r = await runDebrief({ persona: persona('james'), transcript: converted, mode: 'fixed' });
  assert.equal(r.rules[0].turn, 9);
  assert.equal(r.outcome.money_lost, 650);
});

test('day rewind picks the costliest decision across the three calls', async () => {
  const day = await Promise.all(['nina-safe', 'marcus-slip', 'james-safe'].map(fixed));
  const rewind = pickDayRewind(day);
  assert.equal(rewind.persona.id, 'marcus');
  assert.equal(rewind.turn, 9);
  const worst = pickDayRewind(await Promise.all(['nina-slip', 'marcus-slip', 'james-slip'].map(fixed)));
  assert.equal(worst.persona.id, 'james');
});
