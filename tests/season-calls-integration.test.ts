import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test, vi } from 'vitest';
import { createPlayerHandlers } from '../lib/players/routes';
import { playerStore } from '../lib/players/store';
import { createScenarioStore } from '../lib/season/scenarios/server';
import { createProductionCallHandlers } from '../lib/season/calls/server';
import type { PublicCall } from '../lib/season/calls/types';

const database = process.env.TEST_DATABASE_URL;
test.skipIf(!database)('production signup, call and Scorekeeper commit atomically, cache results and stop scoring at Season end', async () => {
  const schema = 'call_integration_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!); url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() }); await db.connect();
  try {
    for (const migration of ['009_players.sql', '010_call_scenarios.sql', '011_season_leaderboard.sql']) {
      await db.query(await readFile(new URL('../migrations/' + migration, import.meta.url), 'utf8'));
    }
    await createScenarioStore(url.toString()).seed();
    const signup = await createPlayerHandlers({ store: playerStore(url.toString()) }).POST(new Request('https://tell.test/api/players', {
      method: 'POST', headers: { origin: 'https://tell.test' }, body: JSON.stringify({ action: 'signup', email: 'fern@example.invalid', nickname: 'Fern' }),
    }));
    expect(signup.status).toBe(200);
    const firstPlayer = (await signup.json() as { player: { id: string } }).player.id;
    let cookie = signup.headers.get('set-cookie')!.split(';')[0];
    const handlers = createProductionCallHandlers({ NODE_ENV: 'test', DATABASE_URL: url.toString() });
    const post = (action: object, id?: string) => handlers.POST(new Request('https://tell.test/api/play/calls' + (id ? '/' + id : ''), {
      method: 'POST', headers: { origin: 'https://tell.test', cookie, 'content-type': 'application/json' }, body: JSON.stringify(action),
    }), id);
    const start = async () => {
      const response = await post({ type: 'start', scenarioId: 'bank' });
      expect(response.status).toBe(201);
      return (await response.json() as { call: PublicCall }).call;
    };
    const verdict = async (id: string) => (await db.query('SELECT version FROM calls WHERE id=$1', [id])).rows[0].version === 'real' ? 'Real' : 'Scam';
    const first = await start();
    await post({ type: 'reply', text: 'Who is calling?' }, first.id);
    await post({ type: 'reply', text: "I won't share codes." }, first.id);
    await post({ type: 'own-app' }, first.id); await post({ type: 'end' }, first.id);
    const action = { type: 'verdict', verdict: await verdict(first.id) };
    const responses = await Promise.all([post(action, first.id), post(action, first.id)]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const original = (await responses[0].json() as { call: PublicCall }).call;
    const duplicate = (await responses[1].json() as { call: PublicCall }).call;
    expect(original.phase).toBe('complete');
    expect(original.result).toMatchObject({ delta: 150, total: 150, scoredBy: 'rules', right: 2, wrong: 0 });
    expect(duplicate.result).toEqual(original.result);
    expect((await db.query('SELECT blokbuks,"right",wrong FROM season_scores')).rows).toEqual([{ blokbuks: 150, right: 2, wrong: 0 }]);
    const second = await start(); await post({ type: 'end' }, second.id);
    // A failing persistence operation must roll back both scoring and engine state.
    await db.query(`CREATE FUNCTION reject_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.blokbuks_delta IS NOT NULL THEN RAISE EXCEPTION 'fixture persistence failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER reject_finish BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION reject_finish()`);
    const secondAction = { type: 'verdict', verdict: await verdict(second.id) };
    expect((await post(secondAction, second.id)).status).toBe(503);
    const failed = (await db.query('SELECT state,blokbuks_delta FROM calls WHERE id=$1', [second.id])).rows[0];
    expect(failed.state.phase).toBe('verdict'); expect(failed.blokbuks_delta).toBeNull();
    expect((await db.query('SELECT blokbuks FROM season_scores')).rows[0].blokbuks).toBe(150);
    await db.query('DROP TRIGGER reject_finish ON calls');
    expect((await post(secondAction, second.id)).status).toBe(200);
    expect((await db.query('SELECT blokbuks FROM season_scores')).rows[0].blokbuks).toBe(250);
    const replay = await post(action, first.id);
    expect((await replay.json() as { call: PublicCall }).call.result).toEqual(original.result);
    const originalCookie = cookie;
    const secondSignup = await createPlayerHandlers({ store: playerStore(url.toString()) }).POST(new Request('https://tell.test/api/players', {
      method: 'POST', headers: { origin: 'https://tell.test' }, body: JSON.stringify({ action: 'signup', email: 'moss@example.invalid', nickname: 'Moss' }),
    }));
    expect(secondSignup.status).toBe(200);
    const secondPlayer = (await secondSignup.json() as { player: { id: string } }).player.id;
    cookie = secondSignup.headers.get('set-cookie')!.split(';')[0];
    let zeroReached: string | undefined;
    for (let i = 0; i < 2; i++) {
      const negative = await start(); await post({ type: 'end' }, negative.id);
      const wrong = await verdict(negative.id) === 'Real' ? 'Scam' : 'Real';
      const response = await post({ type: 'verdict', verdict: wrong }, negative.id);
      expect(response.status).toBe(200);
      expect((await response.json() as { call: PublicCall }).call.result).toMatchObject({ delta: -50, total: 0 });
      const score = (await db.query('SELECT blokbuks,reached_at FROM season_scores WHERE player_id=$1', [secondPlayer])).rows[0];
      expect(score.blokbuks).toBe(0);
      const reached = score.reached_at.toISOString();
      if (i === 0) zeroReached = reached;
      else expect(reached).toBe(zeroReached);
    }
    cookie = originalCookie;
    const closing = await start();
    await post({ type: 'reply', text: "I won't share codes." }, closing.id);
    await post({ type: 'end' }, closing.id);
    // Only the external model transport is faked. Expire the real Season while
    // labeling is in flight; the actual finisher must recompute as practice.
    vi.stubGlobal('fetch', async () => {
      await db.query("UPDATE seasons SET starts_at=clock_timestamp()-interval '1 hour', ends_at=clock_timestamp()-interval '1 millisecond'");
      return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'label_replies', arguments: JSON.stringify({ labels: [{ step: 1, move: 'Protect', quote: "I won't share codes." }] }) } }] } }] });
    });
    const closingHandlers = createProductionCallHandlers({ NODE_ENV: 'test', DATABASE_URL: url.toString(), NVIDIA_API_KEY: 'fixture-only' });
    let closedResponse: Response;
    try {
      closedResponse = await closingHandlers.POST(new Request('https://tell.test/api/play/calls/' + closing.id, {
        method: 'POST', headers: { origin: 'https://tell.test', cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'verdict', verdict: await verdict(closing.id) }),
      }), closing.id);
    } finally { vi.unstubAllGlobals(); }
    expect(closedResponse.status).toBe(200);
    const closed = (await closedResponse.json() as { call: PublicCall }).call;
    expect(closed.scored).toBe(false);
    expect(closed.result).toMatchObject({ delta: 0, total: null });
    const storedClosed = (await db.query('SELECT scored,state,blokbuks_delta FROM calls WHERE id=$1', [closing.id])).rows[0];
    expect(storedClosed.scored).toBe(false); expect(storedClosed.state.scored).toBe(false); expect(storedClosed.blokbuks_delta).toBe(0);
    expect((await db.query('SELECT blokbuks FROM season_scores WHERE player_id=$1', [firstPlayer])).rows[0].blokbuks).toBe(250);
    expect((await start()).scored).toBe(false);
  } finally { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}, 30000);
