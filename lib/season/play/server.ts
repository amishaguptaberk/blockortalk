import pg from 'pg';
import { createFinishedCallReader } from '../finishedCalls';
import { createPlayReadModel, type SeasonRow } from './read-model';
export function createPlayStore(connectionString: string, now = () => new Date()) {
  async function query(sql: string, values: unknown[] = []) {
    if (!connectionString) throw new Error('Play database is not configured.');
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 }); await client.connect();
    try { return (await client.query(sql, values)).rows; } finally { await client.end(); }
  }
  return createPlayReadModel({ now,
    currentSeason: async () => {
      const rows = await query('SELECT id,name,starts_at,ends_at FROM seasons WHERE starts_at<=$1 ORDER BY starts_at DESC,id LIMIT 1', [now()]);
      if (!rows.length) rows.push(...await query('SELECT id,name,starts_at,ends_at FROM seasons WHERE starts_at>$1 ORDER BY starts_at,id LIMIT 1', [now()]));
      const row = rows[0]; return row ? { id: row.id, name: row.name, startsAt: new Date(row.starts_at).toISOString(), endsAt: new Date(row.ends_at).toISOString() } as SeasonRow : null;
    },
    catalog: async () => await query('SELECT id,category,org,tactic FROM call_scenarios ORDER BY id'),
    score: async (player, season) => (await query('SELECT blokbuks FROM season_scores WHERE player_id=$1 AND season_id=$2', [player, season]))[0]?.blokbuks ?? 0,
    scoredStarts: async player => (await query('SELECT started_at FROM calls WHERE player_id=$1 AND scored=true', [player])).map(row => new Date(row.started_at).toISOString()),
    finished: async player => {
      try { return await createFinishedCallReader(connectionString)(player); }
      catch { return []; }
    },
  });
}
