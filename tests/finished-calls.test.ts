import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { createFinishedCallReader, toCallRow, weakestTactic, type StoredCall } from '../lib/season/finishedCalls';

const stored = (overrides: Partial<StoredCall> = {}): StoredCall => ({
  playerId: 'p', scenarioId: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof',
  version: 'scam', verdict: 'Real', synthetic: false, leaks: [], ...overrides,
});

test('a stored call becomes one analysis row, and a bad tactic or version is dropped', () => {
  expect(toCallRow(stored({ leaks: ['Practice protection code'] }))).toMatchObject({ leaked: true, verdict: 'Real', version: 'scam' });
  expect(toCallRow(stored({ tactic: 'Hijacked' }))).toBeNull();
  expect(toCallRow(stored({ version: 'hijacked' }))).toBeNull();
  expect(toCallRow(stored({ verdict: 'yes' }))).toBeNull();
  expect(toCallRow(stored({ leaks: ['', 3] }))).toMatchObject({ leaked: false });
});

test('one finished call does not name a tactic to press', () => {
  const row = toCallRow(stored())!;
  expect(weakestTactic([row])).toBeNull();
  expect(weakestTactic([row, { ...row, synthetic: true }])).toBeNull();
  expect(weakestTactic([row, row])).toBe('Details as proof');
});

const database = process.env.TEST_DATABASE_URL;
test.skipIf(!database)('each player reads only their own finished calls', async () => {
  const schema = 'finished_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(new URL('../migrations/010_call_scenarios.sql', import.meta.url), 'utf8'));
    await db.query(`CREATE TABLE calls (
      id uuid PRIMARY KEY, player_id text NOT NULL, scenario_id text NOT NULL, version text NOT NULL,
      verdict text, synthetic boolean NOT NULL DEFAULT false, state jsonb NOT NULL DEFAULT '{}',
      started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
    )`);
    const versions = JSON.stringify({
      real: { steps: ['a', 'b', 'c', 'd'], next_step: 'check' },
      scam: { steps: ['a', 'b', 'c', 'd'], ask_line: 'code' },
    });
    await db.query(`INSERT INTO call_scenarios(id,category,tactic,org,card,secrets,versions) VALUES
      ('bank','Bank fraud alert','Fear','Puffinvale','{}','[]',$1::jsonb)`, [versions]);
    await db.query(`INSERT INTO calls(id,player_id,scenario_id,version,verdict,state,ended_at) VALUES
      ('00000000-0000-4000-8000-000000000001','ada','bank','scam','Real','{"leaks":["Practice protection code"]}',now()),
      ('00000000-0000-4000-8000-000000000002','ada','bank','scam',NULL,'{"leaks":["ignored"]}',NULL),
      ('00000000-0000-4000-8000-000000000003','bea','bank','real','Scam','{}',now())`);
    const read = createFinishedCallReader(url.toString());
    expect(await read('ada')).toEqual([expect.objectContaining({ playerId: 'ada', leaked: true, verdict: 'Real', tactic: 'Fear' })]);
    expect(await read('bea')).toEqual([expect.objectContaining({ playerId: 'bea', leaked: false, version: 'real' })]);
    expect(await read('nope')).toEqual([]);
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
