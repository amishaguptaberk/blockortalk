import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL_DIRECT) throw new Error('DATABASE_URL_DIRECT is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_DIRECT });
await client.connect();
try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');
  for (const name of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
    await client.query('BEGIN');
    try {
      await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      const result = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (!result.rowCount) {
        await client.query(await readFile(`migrations/${name}`, 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        console.log(`Applied ${name}`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
