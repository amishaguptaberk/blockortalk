import { expect, test } from 'vitest';
import type { PublicCall } from '../lib/season/calls/types';
import { createCallHandlers } from '../lib/season/calls/routes';
import { createCallPlanner, fixedLines } from '../lib/season/calls/planner';
import { createCallService } from '../lib/season/calls/service';
import type { CallRecord, CallStore, Transaction } from '../lib/season/calls/store';
import { scenarios } from '../lib/season/scenarios/server';
import { isNextCallScored, scoredCallsLeftToday } from '../lib/blokbuks/rules';

function fixture(plan?: Parameters<typeof createCallService>[0]['plan'], options?: Pick<Parameters<typeof createCallService>[0], 'finished' | 'onFinished'>) {
  let time = Date.parse('2026-11-08T10:00:00Z');
  let random = 0;
  const rows = new Map<string, CallRecord>();
  const tx = {} as Transaction;
  const season = { id: 'season-1', startsAt: '2026-11-08T00:00:00Z', endsAt: '2026-11-10T00:00:00Z' };
  const store: CallStore = {
    async start(player, draft, now) {
      const starts = [...rows.values()].filter(row => row.playerId === player && row.scored).map(row => row.startedAt);
      const scored = now.getTime() < Date.parse(season.endsAt) && now.getTime() >= Date.parse(season.startsAt) && isNextCallScored(starts, now);
      const row: CallRecord = { ...draft, playerId: player, seasonId: season.id, scored, startedAt: now.toISOString(), callsLeft: scoredCallsLeftToday([...starts, ...(scored ? [now] : [])], now) };
      rows.set(row.id, row); return row;
    },
    async update(player, id, work) {
      const row = rows.get(id);
      if (!row || row.playerId !== player) return null;
      // Match a database transaction: don't publish failed changes.
      const next = structuredClone(row);
      await work(next, tx); rows.set(id, next); return next;
    },
  };
  let finished = 0;
  const completed: CallRecord[] = [];
  const service = createCallService({ store, scenario: async id => scenarios.find(row => row.id === id) ?? null,
    plan: plan ?? (async scenario => [`Hello from ${scenario.org}. I am calling about your practice notice.`, scenario.card.facts[0]!, 'Please take a moment to review this notice.']),
    now: () => new Date(time), random: () => (random++ % 2) / 2,
    finishCall: async (_tx, call) => { finished++; completed.push(structuredClone(call)); return { summary: 'finished', version: call.version }; },
    finished: options?.finished, onFinished: options?.onFinished,
  });
  const handlers = createCallHandlers({ service, authenticate: async request => request.headers.get('authorization') ?? null,
    speech: { speak: async text => new Response(text, { headers: { 'Content-Type': 'audio/mpeg' } }), transcribe: async () => 'hello' } });
  function post(action: object, id?: string, player = 'player-1') {
    return handlers.POST(new Request(`https://tell.test/api/play/calls${id ? '/' + id : ''}`, { method: 'POST', headers: { origin: 'https://tell.test', authorization: player, 'content-type': 'application/json' }, body: JSON.stringify(action) }), id);
  }
  return { post, handlers, rows, completed, get finished() { return finished; }, advance: (ms: number) => { time += ms; } };
}

test('six starts reserve five Scored calls then practice, counting unfinished calls', async () => {
  const f = fixture();
  const scored = [];
  for (let i = 0; i < 6; i++) {
    const response = await f.post({ type: 'start', scenarioId: 'bank' });
    expect(response.status).toBe(201);
    const body = await response.json() as { call: { scored: boolean; callsLeft: number } }; scored.push(body.call.scored);
    expect(body.call.callsLeft).toBe(Math.max(0, 4 - i));
    for (const field of ['version', 'tactic', 'outlines', 'versions', 'examples']) expect(JSON.stringify(body)).not.toContain(`"${field}"`);
  }
  expect(scored).toEqual([true, true, true, true, true, false]);
  expect([...f.rows.values()].map(row => row.version)).toEqual(['real', 'scam', 'real', 'scam', 'real', 'scam']);
});

test('four replies, End, stop drill and refreshed deadlines end a call without accepting stale replies', async () => {
  const f = fixture();
  const start = async () => (await (await f.post({ type: 'start', scenarioId: 'bank' })).json() as { call: { id: string } }).call.id;
  const id = await start();
  for (let i = 0; i < 4; i++) expect((await f.post({ type: 'reply', text: 'What is this about?' }, id)).status).toBe(200);
  expect(f.rows.get(id)?.phase).toBe('verdict');
  expect(f.rows.get(id)?.turns.filter(t => t.role === 'caller')).toHaveLength(4);
  expect((await f.post({ type: 'reply', text: 'late' }, id)).status).toBe(409);
  const stopped = await start();
  await f.post({ type: 'reply', text: 'please STOP drill now' }, stopped);
  expect(f.rows.get(stopped)?.phase).toBe('verdict');
  const ended = await start();
  await f.post({ type: 'end' }, ended); await f.post({ type: 'end' }, ended);
  expect(f.rows.get(ended)?.phase).toBe('verdict');
  const expired = await start(); f.advance(180000);
  const response = await f.handlers.GET(new Request('https://tell.test', { headers: { authorization: 'player-1' } }), expired);
  expect((await response.json() as { call: { phase: string } }).call.phase).toBe('verdict');
  expect((await f.post({ type: 'reply', text: 'too late' }, expired)).status).toBe(409);
  expect(f.rows.get(expired)?.replies).toHaveLength(0);
});

test('own-app verifies, caller link opens only after delivery, leaks normalize, and verdict replays result', async () => {
  const f = fixture();
  await f.post({ type: 'start', scenarioId: 'bank' }); // next random draw is scam
  const body = await (await f.post({ type: 'start', scenarioId: 'phishing' })).json() as { call: { id: string; callerLink?: unknown } };
  const id = body.call.id;
  expect(body.call.callerLink).toBeUndefined();
  expect((await f.post({ type: 'caller-link' }, id)).status).toBe(409);
  await f.post({ type: 'reply', text: 'hello' }, id);
  const delivered = await (await f.post({ type: 'reply', text: 'why?' }, id)).json();
  expect(JSON.stringify(delivered)).toContain('cloudpetal-check.invalid');
  await f.post({ type: 'caller-link' }, id);
  expect(f.rows.get(id)?.verifyEvents).toHaveLength(0);
  const callerSheet = f.rows.get(id)?.sheet;
  await f.post({ type: 'own-app' }, id);
  expect(f.rows.get(id)?.verifyEvents).toHaveLength(1);
  expect(f.rows.get(id)?.sheet).not.toEqual(callerSheet);
  await f.post({ type: 'reply', text: 'eight two oh five, and 4111 1111 1111 1111' }, id);
  expect(f.rows.get(id)?.leaks).toEqual(['Practice protection code']);
  expect(f.rows.get(id)?.replies[2].text).toContain('[redacted card number]');
  await f.post({ type: 'end' }, id);
  const beforeVerdict = Date.now();
  const finished = await f.post({ type: 'verdict', verdict: 'Unverified' }, id);
  const replay = await f.post({ type: 'verdict', verdict: 'Scam' }, id);
  const original = await finished.json() as { call: PublicCall };
  const duplicate = await replay.json() as { call: PublicCall };
  const { serverNow: originalNow, ...originalStable } = original.call;
  const { serverNow: duplicateNow, ...duplicateStable } = duplicate.call;
  expect(duplicateStable).toEqual(originalStable);
  for (const timestamp of [originalNow, duplicateNow]) {
    expect(Number.isFinite(Date.parse(timestamp))).toBe(true);
    expect(Date.parse(timestamp)).toBeGreaterThanOrEqual(beforeVerdict);
    expect(Date.parse(timestamp)).toBeLessThanOrEqual(Date.now());
  }
  expect(f.finished).toBe(1);
  expect(f.completed[0].verifyEvents).toHaveLength(1);
  expect((await f.post({ type: 'end' }, id, 'other-player')).status).toBe(404);
});

test('mutations enforce auth, origin, bounded valid input and speech uses only the latest stored caller line', async () => {
  const f = fixture();
  expect((await f.post({ type: 'start', scenarioId: 'bank' }, undefined, '')).status).toBe(401);
  expect((await f.handlers.POST(new Request('https://tell.test/api/play/calls', { method: 'POST', headers: { origin: 'https://other.test' }, body: '{}' }))).status).toBe(403);
  const id = (await (await f.post({ type: 'start', scenarioId: 'bank' })).json() as { call: { id: string } }).call.id;
  expect((await f.post({ type: 'speech', text: 'speak attacker-controlled text' }, id, 'other')).status).toBe(404);
  const audio = await f.post({ type: 'speech', text: 'speak attacker-controlled text' }, id);
  expect(audio.status).toBe(200);
  expect(await audio.text()).toContain("It's recorded for your report");
  const next = await f.post({ type: 'speech', text: 'speak attacker-controlled text' }, id);
  expect(await next.text()).not.toContain('attacker-controlled');
  expect((await f.post({ type: 'reply', text: 'x'.repeat(4000) }, id)).status).toBe(413);
  const invalid = await f.handlers.POST(new Request('https://tell.test', { method: 'POST', headers: { authorization: 'player-1', origin: 'https://tell.test', 'content-type': 'application/json' }, body: '{broken' }), id);
  expect(invalid.status).toBe(400);
  expect(invalid.headers.get('cache-control')).toBe('no-store');
  const form = new FormData(); form.set('audio', new File(['data'], 'reply.webm', { type: 'audio/webm' }));
  const transcript = await f.handlers.POST(new Request('https://tell.test', { method: 'POST', headers: { authorization: 'player-1', origin: 'https://tell.test' }, body: form }), id);
  expect(await transcript.json()).toEqual({ text: 'hello' });
  expect(f.rows.get(id)?.replies).toHaveLength(0);
  await f.post({ type: 'end' }, id);
  expect((await f.post({ type: 'speech' }, id)).status).toBe(409);
});

test('fixed step four is delivered regardless of generated lines and errors keep text and retry paths usable', async () => {
  const f = fixture();
  const id = (await (await f.post({ type: 'start', scenarioId: 'bank' })).json() as { call: { id: string } }).call.id;
  for (let i = 0; i < 3; i++) await f.post({ type: 'reply', text: 'why?' }, id);
  expect(f.rows.get(id)?.turns.at(-1)?.text).toBe(scenarios[0].versions.real.next_step);
  expect((await f.post({ type: 'verdict', verdict: 'Real' }, id)).status).toBe(409);
  const unavailable = createCallHandlers({ service: {
    start: async () => { throw new Error('DATABASE_URL contains private credentials'); },
    get: async () => { throw new Error('private vendor key'); },
    act: async () => { throw new Error('private transcript'); },
  }, authenticate: async () => 'player', speech: { speak: async () => { throw new Error('vendor secret'); }, transcribe: async () => 'text' } });
  const response = await unavailable.GET(new Request('https://tell.test'), id);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private');
  expect(response.headers.get('cache-control')).toBe('no-store');
});


test('start rejects model self-disclosure through the actual planner before publishing caller lines', async () => {
  for (const disclosure of ['This is a real call from Puffinvale Bank.', 'I am a genuine caller from Puffinvale Bank.', 'An authentic caller is speaking to you now.']) {
    const planner = createCallPlanner({
      examples: async () => Array.from({ length: 5 }, (_, i) => ({ id: String(i), dialogue: 'Untrusted reference', label: 0 as const, source: 'fixture' })),
      model: { chat: async () => ({ message: { tool_calls: [{ function: { name: 'write_steps', arguments: JSON.stringify({ lines: [disclosure, 'A practice purchase is waiting for review.', 'Please review your notice through your own app.'] }) } }] } }) },
    });
    const f = fixture(planner);
    const response = await f.post({ type: 'start', scenarioId: 'bank' });
    expect(response.status).toBe(201);
    const body = await response.json() as { call: { turns: { text: string }[] } };
    expect(body.call.turns[0].text).toBe(fixedLines(scenarios[0], 'real')[0]);
    expect(JSON.stringify(body)).not.toContain(disclosure);
    for (const field of ['version', 'tactic', 'outlines', 'versions', 'examples']) expect(JSON.stringify(body)).not.toContain(`"${field}"`);
  }
});

test('the planner presses a tactic only after two misses, and a memory failure still starts the call', async () => {
  const hints: boolean[] = [];
  const missed = [1, 2].map(() => ({
    playerId: 'player-1', scenarioId: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency' as const,
    version: 'scam' as const, verdict: 'Real' as const, leaked: false, synthetic: false,
  }));
  const plan: Parameters<typeof createCallService>[0]['plan'] = async (scenario, _version, hint) => {
    hints.push(hint?.press === true);
    return [`Hello from ${scenario.org}. I am calling about your practice notice.`, scenario.card.facts[0]!, 'Please take a moment to review this notice.'];
  };
  const remembered = fixture(plan, { finished: async () => missed });
  expect((await remembered.post({ type: 'start', scenarioId: 'delivery' })).status).toBe(201);
  expect((await remembered.post({ type: 'start', scenarioId: 'bank' })).status).toBe(201);
  expect(hints).toEqual([true, false]);
  const broken = fixture(plan, { finished: async () => { throw new Error('down'); } });
  expect((await broken.post({ type: 'start', scenarioId: 'delivery' })).status).toBe(201);
  expect(hints.at(-1)).toBe(false);
});

test('a committed verdict refreshes analysis once, and a refresh failure still saves the verdict', async () => {
  let refreshes = 0;
  const f = fixture(undefined, { onFinished: async () => { refreshes += 1; throw new Error('analyst down'); } });
  const id = (await (await f.post({ type: 'start', scenarioId: 'bank' })).json() as { call: { id: string } }).call.id;
  await f.post({ type: 'end' }, id);
  expect((await f.post({ type: 'verdict', verdict: 'Scam' }, id)).status).toBe(200);
  expect(refreshes).toBe(1);
  expect((await f.post({ type: 'verdict', verdict: 'Real' }, id)).status).toBe(200);
  expect(refreshes).toBe(1);
  expect(f.rows.get(id)?.verdict).toBe('Scam');
});
