import pg from 'pg';
import type { AnalysisRecord, AnalysisStore } from './refresh.ts';

/** A client per request, no ORM. The upsert never replaces a record covering more finished calls. */
export function createAnalysisStore(connectionString: string): AnalysisStore {
  async function query<T>(work: (client: pg.Client) => Promise<T>) {
    if (!connectionString) throw new Error('The analysis database is not configured.');
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await work(client); } finally { await client.end(); }
  }
  return {
    get: playerId => query(async client => {
      const row = (await client.query('SELECT finished_calls, counts, sentences, try_next, source FROM player_analyses WHERE player_id=$1', [playerId])).rows[0];
      return row ? { finished: row.finished_calls, counts: row.counts, sentences: row.sentences, tryNext: row.try_next, source: row.source } as AnalysisRecord : null;
    }),
    save: (playerId, record) => query(async client => {
      await client.query(
        `INSERT INTO player_analyses(player_id, finished_calls, counts, sentences, try_next, source) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(player_id) DO UPDATE SET finished_calls=excluded.finished_calls, counts=excluded.counts, sentences=excluded.sentences,
           try_next=excluded.try_next, source=excluded.source, updated_at=now()
         WHERE player_analyses.finished_calls <= excluded.finished_calls`,
        [playerId, record.finished, JSON.stringify(record.counts), JSON.stringify(record.sentences), record.tryNext, record.source]);
    }),
  };
}
