import { authenticatePlayer } from './calls/server';
import { withCallDatabase, type CallRecord } from './calls/store';
import { createResultsHandlers, type ResultsStore } from './resultsRoutes';
import { seasonStore } from './store';
import type { FinishedCallView } from './results';

/** Reads the call engine's stored state (BS-06); never writes. */
export function resultsStore(connectionString: string): ResultsStore {
  return {
    call: (playerId, id) => withCallDatabase(connectionString, async client => {
      const row = (await client.query<{ state: CallRecord }>('SELECT state FROM calls WHERE id = $1 AND player_id = $2', [id, playerId])).rows[0];
      if (!row) return null;
      const s = row.state;
      return {
        id: s.id, playerId: s.playerId, seasonId: s.seasonId ?? null,
        scenario: { id: s.scenario.id, category: s.scenario.category, org: s.scenario.org },
        version: s.version, phase: s.phase, scored: s.scored, callsLeft: s.callsLeft, verdict: s.verdict,
        replies: s.replies.map(({ step, text }) => ({ step, text })),
        result: s.result as FinishedCallView['result'],
      };
    }),
    scores: seasonId => seasonStore(connectionString).scores(seasonId),
    finishedCalls: playerId => withCallDatabase(connectionString, async client =>
      Number((await client.query<{ n: string }>('SELECT count(*) AS n FROM calls WHERE player_id = $1 AND blokbuks_delta IS NOT NULL AND NOT synthetic', [playerId])).rows[0]?.n ?? 0)),
  };
}

export function resultsHandlers(env = process.env) {
  const connectionString = env.DATABASE_URL ?? '';
  return createResultsHandlers({ authenticate: request => authenticatePlayer(request, connectionString), store: resultsStore(connectionString) });
}
