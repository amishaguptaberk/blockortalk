import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { createPlayStore } from '../lib/season/play/server';
const database = process.env.TEST_DATABASE_URL;
test.skipIf(!database)('Play reads stored scores and treats a missing score row as zero but a missing table as unavailable', async () => {
  const schema = 'play_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database }); await admin.connect(); await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!); url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() }); await db.connect();
  try {
    await db.query(await readFile(new URL('../migrations/010_call_scenarios.sql', import.meta.url), 'utf8'));
    await db.query('CREATE TABLE seasons(id text,name text,starts_at timestamptz,ends_at timestamptz); CREATE TABLE season_scores(player_id text,season_id text,blokbuks int); CREATE TABLE calls(player_id text,scored boolean,started_at timestamptz)');
    await db.query("INSERT INTO seasons VALUES('s','Season 1','2026-11-01','2026-11-10'); INSERT INTO season_scores VALUES('p','s',250)");
    const store = createPlayStore(url.toString(), () => new Date('2026-11-08T18:00:00Z'));
    await db.query("INSERT INTO seasons VALUES('future','Season 2','2026-12-01','2026-12-10')");
    expect((await store('p')).season?.id).toBe('s');
    expect((await store('p')).blokbuks).toBe(250); expect((await store('absent')).blokbuks).toBe(0);
    await db.query('DROP TABLE season_scores'); await expect(store('p')).rejects.toThrow();
  } finally { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
