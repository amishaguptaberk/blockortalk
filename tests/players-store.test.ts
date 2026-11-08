import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { playerStore } from '../lib/players/store';

const database = process.env.TEST_DATABASE_URL;
test.skipIf(!database)('migration 009 creates the Player contract; store enforces identity and session expiry', async () => {
  const schema = 'players_test_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!);
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(new URL('../migrations/008_try_it.sql', import.meta.url), 'utf8'));
    await db.query(await readFile(new URL('../migrations/009_players.sql', import.meta.url), 'utf8'));
    const tables = await db.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [schema]);
    expect(tables.rows.map(row => row.tablename)).toEqual(['calls', 'insights_summaries', 'player_analyses', 'player_sessions', 'players', 'season_scores', 'seasons', 'tell_try_it_limits', 'tell_try_it_outcomes']);
    const store = playerStore(url.toString());
    const first = (await store.createPlayer('one@example.com', 'River'))!;
    expect(first.nickname).toBe('River');
    expect(await store.createPlayer('two@example.com', 'rIVER')).toBeNull();
    const concurrent = await Promise.all([store.createPlayer('one@example.com', 'Other'), store.createPlayer('one@example.com', 'Third')]);
    expect(concurrent.map(player => player?.id)).toEqual([first.id, first.id]);
    await expect(db.query('INSERT INTO players (email, nickname, nickname_key) VALUES ($1, $2, $3)', ['ONE@EXAMPLE.COM', 'Other', 'other'])).rejects.toThrow();
    await store.saveSession('hash-only', first, 1000);
    expect(await store.findSession('hash-only', 999)).toEqual(first);
    expect(await store.findSession('hash-only', 1000)).toBeNull();
    await store.deleteSession('hash-only');
    expect(await store.findSession('hash-only', 0)).toBeNull();
    await db.query("INSERT INTO seasons (id, name, starts_at, ends_at, prizes) VALUES ('one', 'One', now(), now() + interval '55 hours', '[]')");
    await expect(db.query("INSERT INTO season_scores (season_id, player_id, blokbuks) VALUES ('one', $1, -1)", [first.id])).rejects.toThrow();
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}, 30000);
