import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { createFinishStore } from '../lib/blokbuks/finish';

const database = process.env.TEST_DATABASE_URL;
// Migration 009 belongs to BS-01; this test runs once it is on the branch.
const migration = new URL('../migrations/009_players.sql', import.meta.url);
test.skipIf(!database || !existsSync(migration))('finishing a call writes once, floors the total and moves reached_at', async () => {
  const schema = 'finish_call_test_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!);
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(migration, 'utf8'));
    const player = (await db.query(`INSERT INTO players(email,nickname,nickname_key) VALUES('a@tell.test','Alex','alex') RETURNING id`)).rows[0].id as string;
    await db.query(`INSERT INTO seasons(id,name,starts_at,ends_at,prizes) VALUES('s1','Season 1',now() - interval '1 hour',now() + interval '1 hour','[]')`);
    await db.query(`INSERT INTO season_scores(season_id,player_id,blokbuks,reached_at) VALUES('s1',$1,30,now() - interval '1 day')`, [player]);
    const callId = (await db.query(`INSERT INTO calls(player_id,season_id,scenario_id,version,scored) VALUES($1,'s1','bank','scam',true) RETURNING id`, [player])).rows[0].id as string;

    const store = createFinishStore(url.toString());
    expect(await store.seasonOpen('s1', new Date())).toBe(true);
    expect(await store.finished(callId)).toBeNull();
    const call = { id: callId, playerId: player, seasonId: 's1', scored: true, verdict: 'Real' as const };
    const result = { moments: [], right: 0, wrong: 2, delta: -150, scoredBy: 'agent' as const, outcome: 'fell for' as const };
    const first = await store.finish(call, result);
    expect(first).toMatchObject({ callId, delta: -150, total: 0, outcome: 'fell for' });
    const again = await store.finish(call, { ...result, delta: 500 });
    expect(again).toEqual(first);

    const score = (await db.query(`SELECT blokbuks, "right", wrong, reached_at > now() - interval '1 minute' AS moved FROM season_scores WHERE player_id=$1`, [player])).rows[0];
    expect(score).toEqual({ blokbuks: 0, right: 0, wrong: 2, moved: true });
    const row = (await db.query(`SELECT verdict, blokbuks_delta, scored_by, outcome, ended_at IS NOT NULL AS ended FROM calls WHERE id=$1`, [callId])).rows[0];
    expect(row).toEqual({ verdict: 'Real', blokbuks_delta: -150, scored_by: 'agent', outcome: 'fell for', ended: true });
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
