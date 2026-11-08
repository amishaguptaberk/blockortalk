import pg from 'pg';
import { isNextCallScored, scoredCallsLeftToday } from '../../blokbuks/rules';
import { CallError } from './service';
import type { Scenario, Version, Sheet } from '../scenarios/types';
import type { PublicCall, Verdict } from './types';

export type Transaction = Pick<pg.Client, 'query'>;
export type CallRecord = {
  id: string; playerId: string; seasonId: string; scenario: Scenario; version: Version;
  lines: [string, string, string, string]; startedAt: string; scored: boolean; callsLeft: number;
  phase: PublicCall['phase']; turns: PublicCall['turns'];
  replies: { step: number; text: string; leaks: string[] }[];
  verifyEvents: { at: string; step: number }[]; leaks: string[];
  sheet?: Sheet; verdict?: Verdict; result?: Record<string, unknown>; endedAt?: string;
};
export type CallDraft = Omit<CallRecord, 'playerId' | 'seasonId' | 'startedAt' | 'scored' | 'callsLeft'>;
export type CallStore = {
  start(playerId: string, draft: CallDraft, now: Date): Promise<CallRecord>;
  update(playerId: string, id: string, work: (call: CallRecord, tx: Transaction) => Promise<void>): Promise<CallRecord | null>;
};

export async function withCallDatabase<T>(connectionString: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  if (!connectionString) throw new CallError(503, 'Calls are unavailable. Please try again.');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
export type CurrentSeason = { id: string; startsAt: string; endsAt: string };
export async function readCurrentSeason(client: pg.Client, now: Date): Promise<CurrentSeason | null> {
  const row = (await client.query('SELECT id,starts_at,ends_at FROM seasons WHERE starts_at<=$1 ORDER BY starts_at DESC,id LIMIT 1', [now])).rows[0];
  return row ? { id: row.id, startsAt: new Date(row.starts_at).toISOString(), endsAt: new Date(row.ends_at).toISOString() } : null;
}
export function createCallStore(connectionString: string, clock?: () => Date): CallStore {
  async function transaction<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
    return withCallDatabase(connectionString, async client => {
      await client.query('BEGIN');
      try { const result = await work(client); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    });
  }
  return {
    async start(playerId, draft, now) {
      return transaction(async client => {
        // Stable Player row serializes reservations across all sessions/processes.
        const player = await client.query('SELECT id FROM players WHERE id=$1 FOR UPDATE', [playerId]);
        if (!player.rowCount) throw new CallError(401, 'Sign in to play a call.');
        // Evaluate after acquiring the lock, including waits across midnight/end.
        now = clock?.() ?? now;
        const season = await readCurrentSeason(client, now);
        if (!season) throw new CallError(503, 'Calls are unavailable. Please try again.');
        const starts = (await client.query('SELECT started_at FROM calls WHERE player_id=$1 AND scored=true AND started_at >= $2', [playerId, new Date(now.getTime() - 48 * 3600000)])).rows.map(row => new Date(row.started_at));
        const live = now.getTime() < Date.parse(season.endsAt);
        const scored = live && isNextCallScored(starts, now);
        const call: CallRecord = { ...draft, playerId, seasonId: season.id, startedAt: now.toISOString(), scored,
          callsLeft: live ? scoredCallsLeftToday([...starts, ...(scored ? [now] : [])], now) : 0 };
        await client.query('INSERT INTO calls(id,player_id,season_id,scenario_id,version,scored,state,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [call.id, playerId, season.id, draft.scenario.id, draft.version, scored, JSON.stringify(call), now]);
        return call;
      });
    },
    async update(playerId, id, work) {
      return transaction(async client => {
        const row = (await client.query('SELECT state FROM calls WHERE id=$1 AND player_id=$2 FOR UPDATE', [id, playerId])).rows[0];
        if (!row) return null;
        const call = row.state as CallRecord;
        await work(call, client);
        await client.query('UPDATE calls SET state=$2,verdict=$3,ended_at=$4 WHERE id=$1', [id, JSON.stringify(call), call.verdict ?? null, call.endedAt ?? null]);
        return call;
      });
    },
  };
}
