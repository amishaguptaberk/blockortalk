import pg from 'pg';
import { expect, test } from 'vitest';
import { createCallStore } from '../lib/season/calls/store';
import { createCallService } from '../lib/season/calls/service';
import { fixedLines } from '../lib/season/calls/planner';
import { authenticatePlayer, currentSeason } from '../lib/season/calls/server';
import { createHash } from 'node:crypto';
import { scenarios } from '../lib/season/scenarios/server';

const database = process.env.TEST_DATABASE_URL;
test.skipIf(!database)('concurrent starts reserve only five and concurrent Verdicts finalize once in the same transaction', async () => {
  const schema = 'calls_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!); url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() }); await db.connect();
  try {
    await db.query(`CREATE TABLE players(id uuid PRIMARY KEY,email text,nickname text);
      CREATE TABLE player_sessions(token_hash text PRIMARY KEY,player_id uuid REFERENCES players,expires_at timestamptz);
      CREATE TABLE seasons(id text PRIMARY KEY,starts_at timestamptz,ends_at timestamptz);
      CREATE TABLE calls(id uuid PRIMARY KEY,player_id uuid REFERENCES players,season_id text REFERENCES seasons,scenario_id text,version text,scored boolean,state jsonb,verdict text,moments jsonb,"right" int,wrong int,blokbuks_delta int,scored_by text,outcome text,synthetic boolean DEFAULT false,started_at timestamptz,ended_at timestamptz);
      CREATE TABLE finalized(call_id uuid PRIMARY KEY REFERENCES calls);
      INSERT INTO seasons VALUES ('one','2026-11-07T00:00:00Z','2026-11-10T00:00:00Z');`);
    const player = crypto.randomUUID(); await db.query('INSERT INTO players VALUES($1)', [player]);
    let at = new Date('2026-11-08T10:00:00Z');
    const token = 'a'.repeat(64);
    const hash = createHash('sha256').update(token).digest('hex');
    await db.query('INSERT INTO player_sessions VALUES($1,$2,$3)', [hash, player, '2026-11-09T00:00:00Z']);
    const request = new Request('https://tell.test', { headers: { cookie: `tell_player=${token}` } });
    expect(await authenticatePlayer(request, url.toString(), at)).toBe(player);
    expect(await authenticatePlayer(request, url.toString(), new Date('2026-11-09T00:00:00Z'))).toBeNull();
    expect(await authenticatePlayer(new Request('https://tell.test', { headers: { cookie: 'tell_player=invalid' } }), url.toString(), at)).toBeNull();
    expect((await currentSeason(url.toString(), at))?.id).toBe('one');
    let finishes = 0;
    let fail = false;
    const service = createCallService({ store: createCallStore(url.toString()), scenario: async () => scenarios[0], plan: async (s,v) => fixedLines(s,v), now: () => at,
      finishCall: async (tx, call) => {
        finishes++;
        await tx.query('INSERT INTO finalized VALUES($1)', [call.id]);
        if (fail) throw new Error('simulated scoring failure');
        return { persisted: true };
      },
    });
    const starts = await Promise.all(Array.from({ length: 6 }, () => service.start(player, 'bank')));
    expect(starts.filter(row => row.scored)).toHaveLength(5);
    expect(starts.map(row => row.callsLeft).sort()).toEqual([0, 0, 1, 2, 3, 4]);
    const id = starts[0].id;
    await service.act(player, id, { type: 'end' });
    const results = await Promise.all(Array.from({ length: 3 }, () => service.act(player, id, { type: 'verdict', verdict: 'Real' })));
    expect(finishes).toBe(1);
    expect(results.every(row => row.phase === 'complete' && row.result?.persisted === true)).toBe(true);
    await expect(service.get(crypto.randomUUID(), id)).rejects.toMatchObject({ status: 404 });
    fail = true;
    const retry = starts[1].id;
    await service.act(player, retry, { type: 'end' });
    await expect(service.act(player, retry, { type: 'verdict', verdict: 'Real' })).rejects.toThrow('simulated');
    expect((await service.get(player, retry)).phase).toBe('verdict');
    expect((await db.query('SELECT * FROM finalized WHERE call_id=$1', [retry])).rowCount).toBe(0);
    fail = false;
    await service.act(player, retry, { type: 'verdict', verdict: 'Real' });
    expect((await db.query('SELECT * FROM finalized WHERE call_id=$1', [retry])).rowCount).toBe(1);
    at = new Date('2026-11-09T06:00:00Z');
    expect((await service.start(player, 'bank')).scored).toBe(true);
    at = new Date('2026-11-10T00:00:00Z');
    expect((await service.start(player, 'bank')).scored).toBe(false);
  } finally { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
