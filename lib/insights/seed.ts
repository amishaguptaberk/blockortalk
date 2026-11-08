import type pg from 'pg';
import type { Scenario } from '../season/analysis.ts';
import { buildSyntheticDataset } from './synthetic.ts';

/**
 * Writes the synthetic demo Players and calls, all marked `synthetic = true`. Idempotent: it removes
 * the earlier synthetic rows and writes the same deterministic set again in one transaction, so a
 * second run leaves exactly the same data. Real rows are never read or changed. The Leaderboard
 * and the Player analysis already ignore synthetic rows.
 */
export async function seedSynthetic(client: pg.Client, scenarios: readonly Scenario[], now = new Date()) {
  const { players, calls } = buildSyntheticDataset(scenarios);
  await client.query('BEGIN');
  try {
    await removeSyntheticRows(client);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO players (email, nickname, nickname_key, synthetic)
       SELECT email, nickname, lower(nickname), true FROM unnest($1::text[], $2::text[]) AS p(email, nickname)
       RETURNING id, email`,
      [players.map(p => p.email), players.map(p => p.nickname)]) as unknown as { rows: { id: string; email: string }[] };
    const idByEmail = new Map(inserted.rows.map(row => [row.email, row.id]));
    const ids = calls.map(call => idByEmail.get(players[call.playerIndex]!.email)!);
    const started = calls.map(call => new Date(now.getTime() - call.minutesAgo * 60_000));
    await client.query(
      `INSERT INTO calls (player_id, scenario_id, version, scored, verdict, "right", wrong, blokbuks_delta, outcome, synthetic, started_at, ended_at)
       SELECT player_id, scenario_id, version, false, verdict, 0, 0, 0, outcome, true, started_at, started_at
         FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[])
              AS c(player_id, scenario_id, version, verdict, outcome, started_at)`,
      [ids, calls.map(c => c.scenarioId), calls.map(c => c.version), calls.map(c => c.verdict), calls.map(c => c.outcome), started]);
    await client.query('COMMIT');
    return { players: players.length, calls: calls.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function removeSyntheticRows(client: pg.Client) {
  const calls = await client.query('DELETE FROM calls WHERE synthetic');
  const players = await client.query('DELETE FROM players WHERE synthetic');
  return { players: players.rowCount ?? 0, calls: calls.rowCount ?? 0 };
}

/** Removes every row marked synthetic and nothing else. */
export async function removeSynthetic(client: pg.Client) {
  await client.query('BEGIN');
  try {
    const removed = await removeSyntheticRows(client);
    // Summaries written about synthetic totals go too, so they cannot outlive the data they describe.
    await client.query('DELETE FROM insights_summaries WHERE includes_synthetic');
    await client.query('COMMIT');
    return removed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
