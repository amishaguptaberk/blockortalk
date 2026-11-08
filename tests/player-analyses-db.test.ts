import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { createAnalysisStore } from '../lib/season/analysisStore';
import type { AnalysisRecord } from '../lib/season/refresh';

const database = process.env.TEST_DATABASE_URL;
const record = (finished: number, text: string): AnalysisRecord => ({
  finished, tryNext: 'bank', source: 'model',
  sentences: { missed: text, right: text, rejected: text, tryNext: text },
  counts: { locked: false, finished } as never,
});

test.skipIf(!database)('stores one analysis per Player and never goes back to an older call count', async () => {
  const schema = 'analyses_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(new URL('../migrations/20261110_player_analyses.sql', import.meta.url), 'utf8'));
    const store = createAnalysisStore(url.toString());
    expect(await store.get('p1')).toBeNull();
    await store.save('p1', record(2, 'first'));
    await store.save('p1', record(3, 'third'));
    await store.save('p1', record(2, 'late and stale'));
    expect(await store.get('p1')).toMatchObject({ finished: 3, tryNext: 'bank', source: 'model', sentences: { missed: 'third' } });
    expect((await db.query('SELECT count(*)::int AS n FROM player_analyses')).rows[0].n).toBe(1);
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
