import pg from 'pg';
import type { Outcome, TryItDeps } from './routes';

/** Only expiring counters and anonymous, idempotent outcomes reach Postgres. */
export function tryItStore(connectionString: string, dailyCap = 1000): Pick<TryItDeps, 'reserve' | 'count'> {
  async function transaction<T>(work: (client: pg.Client) => Promise<T>) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { await client.end(); }
  }
  return {
    reserve(visitor) {
      return transaction(async client => {
        // Serialize reservations so concurrent requests cannot exceed either cap.
        await client.query('SELECT pg_advisory_xact_lock(13130013)');
        await client.query('DELETE FROM tell_try_it_limits WHERE expires_at <= now()');
        const globalKey = 'global:' + new Date().toISOString().slice(0, 10);
        const slots = [0, 1, 2].map(slot => `${visitor}:${slot}`);
        const rows = await client.query('SELECT key, count FROM tell_try_it_limits WHERE key = ANY($1)', [[...slots, globalKey]]);
        const counts = new Map<string, number>(rows.rows.map(row => [row.key, row.count]));
        const slot = slots.find(key => !counts.has(key));
        if (!slot) return 'visitor';
        if ((counts.get(globalKey) ?? 0) >= dailyCap) return 'global';
        await client.query(`INSERT INTO tell_try_it_limits (key, count, expires_at) VALUES ($1, 1, now() + interval '1 hour'), ($2, 1, (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC') ON CONFLICT (key) DO UPDATE SET count = tell_try_it_limits.count + 1`, [slot, globalKey]);
        return null;
      });
    },
    async count(id: string, outcome: Outcome) {
      await transaction(async client => {
        await client.query('INSERT INTO tell_try_it_outcomes (play_id, balance, interview, bank) VALUES ($1, $2, $3, $4) ON CONFLICT (play_id) DO UPDATE SET balance = EXCLUDED.balance, interview = EXCLUDED.interview, bank = EXCLUDED.bank', [id, outcome.balance, outcome.interview, outcome.bank]);
      });
    },
  };
}
