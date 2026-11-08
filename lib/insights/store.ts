import pg from 'pg';
import type { CallRow, Scenario, Verdict } from '../season/analysis.ts';
import type { Dataset, InsightsStore, StoredSummary } from './routes.ts';

const KEEP_SUMMARIES = 20;
const verdicts = new Set<string>(['Real', 'Scam', 'Unverified']);

type Row = { player_id: string; scenario_id: string; version: 'real' | 'scam'; verdict: string; outcome: string | null; synthetic: boolean };

/**
 * A client per request, no ORM. Category and Tactic come from the in-code Call scenario list, so the
 * dashboard does not depend on the `call_scenarios` table having been seeded. A call whose scenario is
 * unknown is skipped. The rows returned here stay on the server: only `insightTotals` output is sent.
 */
export function createInsightsStore(connectionString: string, scenarios: readonly Scenario[]): InsightsStore {
  const byId = new Map(scenarios.map(scenario => [scenario.id, scenario]));
  async function query<T>(work: (client: pg.Client) => Promise<T>) {
    if (!connectionString) throw new Error('The insights database is not configured.');
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await work(client); } finally { await client.end(); }
  }
  return {
    loadCalls: (include: Dataset) => query(async client => {
      const rows = (await client.query<Row>(
        'SELECT player_id, scenario_id, version, verdict, outcome, synthetic FROM calls WHERE verdict IS NOT NULL AND synthetic = $1',
        [include === 'synthetic'])).rows;
      return rows.flatMap((row): CallRow[] => {
        const scenario = byId.get(row.scenario_id);
        if (!scenario || !verdicts.has(row.verdict)) return [];
        return [{
          playerId: row.player_id, scenarioId: row.scenario_id, category: scenario.category, tactic: scenario.tactic,
          version: row.version, verdict: row.verdict as Verdict,
          // The stored outcome already folds in a leak, so a "fell for" on a scam is read back as one.
          leaked: row.outcome === 'fell for', synthetic: row.synthetic,
        }];
      });
    }),
    latestSummary: synthetic => query(async client => {
      const row = (await client.query<{ body: { text?: unknown }; generated_at: Date }>(
        'SELECT body, generated_at FROM insights_summaries WHERE includes_synthetic = $1 ORDER BY generated_at DESC LIMIT 1', [synthetic])).rows[0];
      if (!row || typeof row.body?.text !== 'string') return null;
      return { text: row.body.text, source: 'model', generatedAt: row.generated_at.toISOString(), synthetic } as StoredSummary;
    }),
    saveSummary: summary => query(async client => {
      await client.query('INSERT INTO insights_summaries (includes_synthetic, body, generated_at) VALUES ($1, $2, $3)',
        [summary.synthetic, JSON.stringify({ text: summary.text, source: summary.source }), new Date(summary.generatedAt)]);
      await client.query(
        `DELETE FROM insights_summaries WHERE includes_synthetic = $1 AND id NOT IN
           (SELECT id FROM insights_summaries WHERE includes_synthetic = $1 ORDER BY generated_at DESC LIMIT ${KEEP_SUMMARIES})`, [summary.synthetic]);
    }),
  };
}
