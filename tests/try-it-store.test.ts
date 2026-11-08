import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { tryItStore } from '../lib/try-it/store';
import { createTryItHandlers } from '../lib/try-it/routes';

const database = process.env.TEST_DATABASE_URL;
test.skipIf(!database)('Postgres limits concurrent starts and saves only anonymous outcomes', async () => {
  const schema = 'try_it_test_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(new URL('../migrations/008_try_it.sql', import.meta.url), 'utf8'));
    const store = tryItStore(url.toString(), 4);
    const reservations = await Promise.all(Array.from({ length: 4 }, () => store.reserve('anonymous-a')));
    expect(reservations.filter(value => value === null)).toHaveLength(3);
    expect(reservations.filter(value => value === 'visitor')).toHaveLength(1);
    expect(await store.reserve('anonymous-b')).toBeNull();
    expect(await store.reserve('anonymous-c')).toBe('global');
    // One expired start frees only one of the visitor's three rolling-hour places.
    await db.query("UPDATE tell_try_it_limits SET expires_at = now() - interval '1 second' WHERE key = 'anonymous-a:0'");
    await db.query("DELETE FROM tell_try_it_limits WHERE key LIKE 'global:%'");
    expect(await store.reserve('anonymous-a')).toBeNull();
    expect(await store.reserve('anonymous-a')).toBe('visitor');

    const handlers = createTryItHandlers({ secret: 'test-only-secret-with-more-than-32-characters', reply: async ({ options }) => options[0], ...store });
    let token: string | undefined;
    let cookie = '';
    async function post(action: object) {
      const response = await handlers.POST(new Request('https://tell.test/api/try-it', { method: 'POST', headers: { origin: 'https://tell.test', cookie }, body: JSON.stringify({ action, token }) }));
      expect(response.ok).toBe(true);
      cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
      const body = await response.json() as { token?: string };
      token = body.token ?? token;
    }
    await post({ type: 'start' });
    await post({ type: 'reply', text: 'I will check through a source I have.' });
    for (let i = 0; i < 3; i++) {
      await post({ type: 'end' });
      await post({ type: 'verdict', verdict: 'Unverified' });
      if (i < 2) await post({ type: 'next' });
    }
    await post({ type: 'reveal' });
    await post({ type: 'reveal' });
    const rows = await db.query('SELECT * FROM tell_try_it_outcomes');
    expect(rows.rows).toHaveLength(1);
    expect(Object.keys(rows.rows[0]).sort()).toEqual(['balance', 'bank', 'interview', 'play_id']);
    expect(rows.rows[0].balance).toBe(1000);
    await post({ type: 'bank' });
    await post({ type: 'callback_start' });
    await post({ type: 'callback_next' });
    await post({ type: 'callback_next' });
    await post({ type: 'reveal' });
    expect((await db.query('SELECT bank FROM tell_try_it_outcomes')).rows).toEqual([{ bank: 'RESOLVED' }]);
    const tables = await db.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [schema]);
    expect(tables.rows.map(row => row.tablename)).toEqual(['tell_try_it_limits', 'tell_try_it_outcomes']);
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}, 60000);
