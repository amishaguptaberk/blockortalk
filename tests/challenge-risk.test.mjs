import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createChallengeService } from '../lib/challenge/service.ts';
import { createRiskService } from '../lib/challenge/risk.ts';
import { DetectorRateLimitError } from '../lib/challenge/detector.ts';
import { createChallengeHandlers } from '../lib/challenge/routes.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
async function fixture(t, detect, now = Date.now) {
  const schema = `risk_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: databaseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  t.after(async () => { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const connectionString = url.toString();
  const setup = new pg.Client({ connectionString });
  await setup.connect();
  try { await setup.query(await readFile(new URL('../migrations/002_challenge.sql', import.meta.url), 'utf8')); }
  finally { await setup.end(); }
  const service = createChallengeService({ connectionString, reply: async ({ options }) => options[0] });
  return { service, risk: createRiskService({ connectionString, detect, now }), connectionString };
}

test('per-turn risk persists independently for each call and records the first correct flag', { skip: !databaseUrl }, async t => {
  const { service, risk } = await fixture(t, async transcript => {
    const last = transcript.turns.at(-1);
    const suspicious = last.text.includes('date of birth');
    return { source: 'fake', label: suspicious ? 'scam' : null, scam_type: null, confidence: suspicious ? .9 : .5,
      red_flags: suspicious ? [{ turn: last.turn, tactic: 'authority', span: { start: 0, end: 15, text: last.text.slice(0, 15) } }] : [] };
  });
  let day = await service.start();
  await service.act(day.id, { type: 'end' });
  await service.act(day.id, { type: 'verdict', verdict: 'Real' });
  await service.act(day.id, { type: 'next' });
  day = await service.act(day.id, { type: 'reply', text: 'Tell me more' });
  await risk.score(day.id);
  await risk.score(day.id);
  const restored = await service.get(day.id);
  const ren = restored.risk.calls.find(call => call.callerId === 'onboarding');
  assert.deepEqual(ren.series.map(point => [point.turn, point.risk]), [[2, null], [3, null], [4, 90]]);
  assert.equal(ren.firstCorrectTurn, 4);
  assert.deepEqual(ren.series.at(-1).tactics, ['authority']);
  assert.equal(restored.balance, 1000);
  assert.equal(restored.risk.calls[0].firstCorrectTurn, null);
});

test('rate limiting keeps an honest pending result and persists cooldown across workers', { skip: !databaseUrl }, async t => {
  let now = Date.now();
  let attempts = 0;
  const { service, risk } = await fixture(t, async () => {
    attempts++;
    throw new DetectorRateLimitError(now + 90000);
  }, () => now);
  const day = await service.start();
  await risk.score(day.id);
  await risk.score(day.id);
  assert.equal(attempts, 1, 'polling during cooldown never dispatches another vendor request');
  const saved = await service.get(day.id);
  assert.equal(saved.risk.calls[0].series[0].status, 'pending');
  assert.equal(saved.risk.calls[0].series[0].risk, null);
  assert.equal(saved.risk.cooldownUntil, now + 90000);
  now += 90001;
  await risk.score(day.id);
  assert.equal(attempts, 2);
});

test('live spoken turns are scored before hang-up and a final save never duplicates them', { skip: !databaseUrl }, async t => {
  const { service, risk } = await fixture(t, async () => ({ source: 'fake', label: 'legit', scam_type: null, confidence: .9, red_flags: [] }));
  let day = await service.start();
  const turns = [{ role: 'assistant', text: 'I see 418 Pecan Hollow Drive and March 14, 1991. Card 4111 1111 1111 1111, SSN 123-45-6789.' }, { role: 'user', text: 'Yes, thank you.' }];
  const sessionId = crypto.randomUUID();
  await service.act(day.id, { type: 'voice_start', callerId: day.callerId, startedAt: day.startedAt, sessionId });
  const action = { type: 'voice_live', callerId: day.callerId, startedAt: day.startedAt, sessionId, turns };
  day = await service.act(day.id, action);
  assert.equal(day.phase, 'call');
  assert.equal(day.replies, 1);
  assert.equal(day.turns.length, 4);
  assert.match(day.turns[2].text, /418 Pecan Hollow Drive/);
  assert.match(day.turns[2].text, /March 14, 1991/);
  assert.doesNotMatch(day.turns[2].text, /4111|123-45-6789/);
  assert.equal((await service.act(day.id, action)).turns.length, 4);
  await risk.score(day.id);
  assert.equal((await service.get(day.id)).risk.calls[0].series.at(-1).status, 'done');
  await service.act(day.id, { type: 'end' });
  turns.push({ role: 'assistant', text: 'Glad to help. Goodbye.' });
  await service.act(day.id, { ...action, turns });
  day = await service.act(day.id, { type: 'voice_turns', sessionId, turns });
  assert.equal(day.turns.length, 5, 'a live upload racing hang-up must survive the final flush');
  await service.act(day.id, { type: 'verdict', verdict: 'Real' });
  await service.act(day.id, { type: 'next' });
  await assert.rejects(service.act(day.id, action), /different call/);
});

test('player routes hide risk data while the presenter needs its separate capability', { skip: !databaseUrl }, async t => {
  const { service, risk } = await fixture(t, async () => ({ source: 'fake', label: 'legit', scam_type: null, confidence: .9, red_flags: [] }));
  const handlers = createChallengeHandlers(() => service);
  const started = await handlers.POST(new Request('https://tell.test/api/challenge', { method: 'POST', headers: { origin: 'https://tell.test' }, body: JSON.stringify({ type: 'start' }) }));
  const { day } = await started.json();
  assert.equal(started.status, 201);
  assert.ok(!('risk' in day));
  await risk.score(day.id);
  const saved = await service.get(day.id);
  assert.equal(await risk.read(day.id, '0'.repeat(64)), null);
  const presenter = await risk.read(day.id, saved.risk.token);
  assert.equal(presenter.callerName, 'Yui');
  assert.equal(presenter.risk, 10);
  assert.equal(presenter.firstCorrectTurn, 2);
  assert.ok(!JSON.stringify(presenter).includes(saved.risk.token));
  const response = await handlers.GET(new Request('https://tell.test/api/challenge', { headers: { cookie: `tell_challenge=${day.id}` } }));
  const body = await response.text();
  assert.ok(!body.includes(saved.risk.token));
  assert.ok(!body.includes('firstCorrectTurn'));
  assert.ok(!body.includes('tactics'));
});

test('the presenter switches the stage plan without touching the day, and the board sees each tap', { skip: !databaseUrl }, async t => {
  const { service, risk, connectionString } = await fixture(t, async () => ({ source: 'fake', label: null, scam_type: null, confidence: .5, red_flags: [] }));
  const updatedAt = async id => { const c = new pg.Client({ connectionString }); await c.connect(); try { return (await c.query('SELECT updated_at FROM tell_challenges WHERE id = $1', [id])).rows[0].updated_at.toISOString(); } finally { await c.end(); } };
  const handlers = createChallengeHandlers(() => service);
  let day = await service.start();
  const { token } = (await service.get(day.id)).risk;
  assert.deepEqual(await risk.read(day.id, token).then(s => [s.plan, s.planSeq]), ['phone', 0]);
  assert.equal(await risk.setPlan(day.id, '0'.repeat(64), 'voice', 0), null);
  assert.deepEqual(await risk.setPlan(day.id, token, 'voice', 0), { applied: true, stagePlan: { plan: 'voice', seq: 1 } });
  day = await service.act(day.id, { type: 'reply', text: 'Who is this?' });
  assert.deepEqual(day.stagePlan, { plan: 'voice', seq: 1 }, 'a later game write keeps the plan');
  assert.deepEqual(await risk.setPlan(day.id, token, 'text', 0), { applied: false, stagePlan: { plan: 'voice', seq: 1 } }, 'a stale tap changes nothing');
  assert.deepEqual(await risk.setPlan(day.id, token, 'voice', 1), { applied: true, stagePlan: { plan: 'voice', seq: 2 } });
  assert.deepEqual(await risk.setPlan(day.id, token, 'text', 2), { applied: true, stagePlan: { plan: 'text', seq: 3 } });
  const saved = await service.get(day.id);
  assert.equal(saved.replies, 1);
  assert.equal(saved.balance, 1000);
  assert.deepEqual(await risk.read(day.id, token).then(s => [s.plan, s.planSeq]), ['text', 3]);
  const before = await updatedAt(day.id);
  const light = await handlers.GET(new Request('https://tell.test/api/challenge?stage_plan', { headers: { cookie: `tell_challenge=${day.id}` } }));
  assert.deepEqual(await light.json(), { stagePlan: { plan: 'text', seq: 3 } }, 'the board poll reads only the plan');
  assert.equal(await updatedAt(day.id), before, 'and writes nothing');
  const response = await handlers.GET(new Request('https://tell.test/api/challenge', { headers: { cookie: `tell_challenge=${day.id}` } }));
  const body = await response.json();
  assert.deepEqual(body.day.stagePlan, { plan: 'text', seq: 3 });
  assert.ok(!JSON.stringify(body).includes(token));
});

test('a slow detector holds no game lock and concurrent workers do not score a turn twice', { skip: !databaseUrl }, async t => {
  let release;
  let entered;
  const waiting = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const scored = [];
  const { service, risk } = await fixture(t, async transcript => {
    scored.push(transcript.id);
    entered();
    if (scored.length === 1) await waiting;
    return { source: 'fake', label: 'legit', scam_type: null, confidence: .9, red_flags: [] };
  });
  const day = await service.start();
  const background = risk.score(day.id);
  t.after(async () => { release(); await background; });
  await started;
  let timer;
  try {
    const updated = await Promise.race([
      service.act(day.id, { type: 'reply', text: 'Yes, Tuesday works.' }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The detector delayed the conversation')), 3000); }),
    ]);
    assert.equal(updated.replies, 1);
    await risk.score(day.id);
    assert.equal(new Set(scored).size, scored.length, 'another worker must respect each persisted lease');
  } finally { clearTimeout(timer); release(); }
  await background;
  assert.equal(new Set(scored).size, 3);
  assert.equal(scored.length, 3);
});

test('a resumed voice session keeps its new turns and rejects messages from the old session', { skip: !databaseUrl }, async t => {
  const { service } = await fixture(t, async () => ({ source: 'fake', label: null, scam_type: null, confidence: .5, red_flags: [] }));
  let day = await service.start();
  await service.act(day.id, { type: 'end' });
  await service.act(day.id, { type: 'verdict', verdict: 'Real' });
  day = await service.act(day.id, { type: 'next' });
  const identity = { callerId: day.callerId, startedAt: day.startedAt };
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  await service.act(day.id, { type: 'voice_start', ...identity, sessionId: first });
  await service.act(day.id, { type: 'voice_live', ...identity, sessionId: first, turns: [{ role: 'assistant', text: 'Can we confirm the equipment shipment?' }, { role: 'user', text: 'Tell me more.' }] });
  await service.act(day.id, { type: 'voice_start', ...identity, sessionId: second });
  day = await service.act(day.id, { type: 'voice_live', ...identity, sessionId: second, turns: [{ role: 'user', text: '4729' }] });
  assert.equal(day.replies, 2);
  assert.deepEqual(day.leaked, ['gift_card_code']);
  await assert.rejects(service.act(day.id, { type: 'voice_live', ...identity, sessionId: first, turns: [] }), /different voice session/);
});

test('a caller prefix can finish while the preceding player prefix is still scoring', { skip: !databaseUrl }, async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { service, risk } = await fixture(t, async transcript => {
    const turn = transcript.turns.at(-1).turn;
    if (turn === 3) await waiting;
    if (turn === 4) release();
    return { source: 'fake', label: 'legit', scam_type: null, confidence: .9, red_flags: [] };
  });
  const day = await service.start();
  await risk.score(day.id);
  await service.act(day.id, { type: 'reply', text: 'Yes, Tuesday works.' });
  const background = risk.score(day.id);
  let timer;
  try {
    await Promise.race([background, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The caller prefix waited behind the player prefix')), 5000); })]);
  } finally { clearTimeout(timer); release(); await background; }
  const saved = await service.get(day.id);
  assert.deepEqual(saved.risk.calls[0].series.map(point => point.status), ['done', 'done', 'done']);
});

test('one background run drains more than three queued prefixes without another presenter poll', { skip: !databaseUrl }, async t => {
  const { service, risk } = await fixture(t, async () => ({ source: 'fake', label: 'legit', scam_type: null, confidence: .9, red_flags: [] }));
  const day = await service.start();
  for (let n = 0; n < 3; n++) await service.act(day.id, { type: 'reply', text: 'Tell me more.' });
  await risk.score(day.id);
  const saved = await service.get(day.id);
  assert.equal(saved.risk.calls[0].series.length, 7);
  assert.ok(saved.risk.calls[0].series.every(point => point.status === 'done'));
});
