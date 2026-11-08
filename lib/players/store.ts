import pg from 'pg';
import type { Player, PlayerStore } from './routes';

/** Open and close a connection for each operation; session tokens must already be hashed. */
export function playerStore(connectionString: string): PlayerStore {
  async function query<T extends pg.QueryResultRow>(sql: string, values: unknown[]) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await client.query<T>(sql, values); }
    finally { await client.end(); }
  }
  return {
    async findByEmail(email) {
      return (await query<Player>('SELECT id, email, nickname FROM players WHERE email = $1', [email])).rows[0] ?? null;
    },
    async createPlayer(email, nickname) {
      const result = await query<Player>(`INSERT INTO players (email, nickname, nickname_key)
        VALUES ($1, $2, lower($2)) ON CONFLICT DO NOTHING RETURNING id, email, nickname`, [email, nickname]);
      // A concurrent signup for the same email must restore the existing Player.
      return result.rows[0] ?? await this.findByEmail(email);
    },
    async saveSession(hash, player, expires) {
      await query('INSERT INTO player_sessions (token_hash, player_id, expires_at) VALUES ($1, $2, $3)', [hash, player.id, new Date(expires)]);
    },
    async findSession(hash, now) {
      return (await query<Player>(`SELECT p.id, p.email, p.nickname FROM player_sessions s
        JOIN players p ON p.id = s.player_id WHERE s.token_hash = $1 AND s.expires_at > $2`, [hash, new Date(now)])).rows[0] ?? null;
    },
    async deleteSession(hash) { await query('DELETE FROM player_sessions WHERE token_hash = $1', [hash]); },
  };
}
