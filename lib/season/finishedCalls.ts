/**
 * Finished Season calls already live in `calls`. This is the read side /me and the
 * call planner share. A row with a bad tactic or version is skipped, not invented.
 */
import pg from 'pg';
import { playerAnalysis, TACTICS, type CallRow, type Tactic } from './analysis.ts';

export type StoredCall = {
  playerId: string;
  scenarioId: string;
  category: string;
  tactic: string;
  version: string;
  verdict: string | null;
  synthetic: boolean;
  leaks: unknown;
};

const VERDICTS = ['Real', 'Scam', 'Unverified'] as const;

export function toCallRow(row: StoredCall): CallRow | null {
  if (!row.scenarioId || !row.category) return null;
  if (!TACTICS.includes(row.tactic as Tactic)) return null;
  if (row.version !== 'real' && row.version !== 'scam') return null;
  if (row.verdict !== null && !VERDICTS.includes(row.verdict as typeof VERDICTS[number])) return null;
  const leaks = Array.isArray(row.leaks) ? row.leaks.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
  return {
    playerId: row.playerId,
    scenarioId: row.scenarioId,
    category: row.category,
    tactic: row.tactic as Tactic,
    version: row.version,
    verdict: row.verdict as CallRow['verdict'],
    leaked: leaks.length > 0,
    synthetic: row.synthetic === true,
  };
}

/** The tactic this player misses most, once two real calls are finished. */
export function weakestTactic(rows: readonly CallRow[]): Tactic | null {
  const analysis = playerAnalysis(rows, []);
  return analysis.locked ? null : analysis.weakest?.tactic ?? null;
}

export function createFinishedCallReader(connectionString: string) {
  return async (playerId: string): Promise<CallRow[]> => {
    if (!connectionString) return [];
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      const result = await client.query(
        `SELECT c.player_id, c.scenario_id, s.category, s.tactic, c.version, c.verdict, c.synthetic,
                COALESCE(c.state->'leaks', '[]'::jsonb) AS leaks
           FROM calls c
           JOIN call_scenarios s ON s.id = c.scenario_id
          WHERE c.player_id = $1 AND c.verdict IS NOT NULL
          ORDER BY c.ended_at NULLS LAST, c.started_at, c.id`,
        [playerId],
      );
      return result.rows.flatMap(row => {
        const call = toCallRow({
          playerId: row.player_id,
          scenarioId: row.scenario_id,
          category: row.category,
          tactic: row.tactic,
          version: row.version,
          verdict: row.verdict,
          synthetic: row.synthetic,
          leaks: row.leaks,
        });
        return call ? [call] : [];
      });
    } finally {
      await client.end();
    }
  };
}
