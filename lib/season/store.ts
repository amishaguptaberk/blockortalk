import pg from 'pg';
import type { Season, SeasonStore, Score } from './routes';

/** The database trigger keeps Season scores immutable after the deadline. */
export function seasonStore(connectionString: string): SeasonStore {
  async function query<T extends pg.QueryResultRow>(sql: string, values: unknown[] = []) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await client.query<T>(sql, values); } finally { await client.end(); }
  }
  return {
    async current() {
      const row = (await query<{ id: string; name: string; starts_at: Date; ends_at: Date; prizes: Season['prizes'] }>(
        'SELECT id, name, starts_at, ends_at, prizes FROM seasons ORDER BY starts_at DESC, id LIMIT 1')).rows[0];
      return row ? { id: row.id, name: row.name, startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString(), prizes: row.prizes } : null;
    },
    async scores(seasonId) {
      return (await query<Score>(`SELECT p.id AS "playerId", p.nickname, COALESCE(s.blokbuks, 0) AS blokbuks,
        COALESCE(s."right", 0) AS "right", COALESCE(s.wrong, 0) AS wrong,
        COALESCE(s.reached_at, p.created_at)::text AS "reachedAt"
        FROM players p JOIN seasons season ON season.id = $1
        LEFT JOIN season_scores s ON s.player_id = p.id AND s.season_id = season.id
        WHERE NOT p.synthetic AND p.created_at < season.ends_at`, [seasonId])).rows;
    },
    async claim(seasonId, playerId, email, now) {
      await query(`INSERT INTO season_claims(season_id, player_id, email, adult, us_resident, requested_at)
        VALUES ($1, $2, $3, true, true, $4) ON CONFLICT (season_id, player_id) DO NOTHING`,
      [seasonId, playerId, email, new Date(now)]);
      return true;
    },
  };
}
