import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { expect, test } from 'vitest';
import { removeSynthetic, seedSynthetic } from '../lib/insights/seed';
import { createInsightsStore } from '../lib/insights/store';
import { insightTotals } from '../lib/season/analysis';
import { scenarios } from '../lib/season/scenarios/server';

const database = process.env.TEST_DATABASE_URL;
const publicScenarios = scenarios.map(({ id, category, tactic }) => ({ id, category, tactic }));

test.skipIf(!database)('seeds synthetic rows idempotently, keeps them apart from real rows, and removes only them', async () => {
  const schema = 'insights_' + crypto.randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: database });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(database!);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(await readFile(new URL('../migrations/009_players.sql', import.meta.url), 'utf8'));
    const count = async (sql: string) => (await db.query(sql)).rows[0].n as number;

    // One real Player with one finished call, which seeding and removal must never touch.
    const real = (await db.query(`INSERT INTO players (email, nickname, nickname_key) VALUES ('real@example.com','RealOne','realone') RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO calls (player_id, scenario_id, version, scored, verdict, outcome) VALUES ($1, $2, 'scam', true, 'Real', 'fell for')`, [real, publicScenarios[0]!.id]);

    const first = await seedSynthetic(db, publicScenarios);
    const second = await seedSynthetic(db, publicScenarios);
    expect(second).toEqual(first);
    expect(first.players).toBe(200);
    expect(await count('SELECT count(*)::int AS n FROM players WHERE synthetic')).toBe(200);
    expect(await count('SELECT count(*)::int AS n FROM calls WHERE synthetic')).toBe(first.calls);
    expect(await count('SELECT count(*)::int AS n FROM calls WHERE NOT synthetic')).toBe(1);
    expect(await count('SELECT count(*)::int AS n FROM players WHERE NOT synthetic')).toBe(1);
    expect(await count('SELECT count(*)::int AS n FROM calls c JOIN players p ON p.id = c.player_id WHERE c.synthetic <> p.synthetic')).toBe(0);

    const store = createInsightsStore(url.toString(), publicScenarios);
    const realRows = await store.loadCalls('real');
    expect(realRows).toHaveLength(1);
    expect(insightTotals(realRows, { include: 'real' })).toEqual([
      { category: publicScenarios[0]!.category, tactic: publicScenarios[0]!.tactic, outcome: 'fell for', hidden: true },
    ]);
    const syntheticRows = await store.loadCalls('synthetic');
    expect(syntheticRows).toHaveLength(first.calls);
    expect(syntheticRows.every(row => row.synthetic)).toBe(true);
    const groups = insightTotals(syntheticRows, { include: 'synthetic' });
    expect(groups.some(group => !group.hidden)).toBe(true);
    expect(groups.some(group => group.hidden)).toBe(true);

    // Summaries are kept per dataset, newest first.
    expect(await store.latestSummary(true)).toBeNull();
    await store.saveSummary({ text: 'Older.', source: 'model', generatedAt: '2026-11-08T10:00:00.000Z', synthetic: true });
    await store.saveSummary({ text: 'Newer.', source: 'model', generatedAt: '2026-11-08T11:00:00.000Z', synthetic: true });
    expect(await store.latestSummary(true)).toEqual({ text: 'Newer.', source: 'model', generatedAt: '2026-11-08T11:00:00.000Z', synthetic: true });
    expect(await store.latestSummary(false)).toBeNull();

    const removed = await removeSynthetic(db);
    expect(removed).toEqual({ players: 200, calls: first.calls });
    expect(await count('SELECT count(*)::int AS n FROM calls')).toBe(1);
    expect(await count('SELECT count(*)::int AS n FROM players')).toBe(1);
    expect(await count('SELECT count(*)::int AS n FROM insights_summaries')).toBe(0);
    await removeSynthetic(db); // removing again is a no-op
    expect(await count('SELECT count(*)::int AS n FROM players')).toBe(1);
  } finally {
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
