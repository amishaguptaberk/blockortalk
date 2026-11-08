import pg from 'pg';
import { removeSynthetic, seedSynthetic } from '../lib/insights/seed.ts';
import { scenarios } from '../lib/season/scenarios/server.ts';

// Seeds (or with --remove, deletes) the synthetic demo Players and calls for /insights.
const connectionString = process.env.DATABASE_URL_DIRECT;
if (!connectionString) throw new Error('DATABASE_URL_DIRECT is required');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  if (process.argv.includes('--remove')) {
    const removed = await removeSynthetic(client);
    console.log(`Removed ${removed.players} synthetic Players and ${removed.calls} synthetic calls.`);
  } else {
    const written = await seedSynthetic(client, scenarios.map(({ id, category, tactic }) => ({ id, category, tactic })));
    console.log(`Seeded ${written.players} synthetic Players and ${written.calls} synthetic calls.`);
  }
} finally {
  await client.end();
}
