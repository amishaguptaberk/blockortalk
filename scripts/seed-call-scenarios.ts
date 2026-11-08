import { createScenarioStore, scenarios } from '../lib/season/scenarios/server.ts';

const connectionString = process.env.DATABASE_URL_DIRECT;
if (!connectionString) throw new Error('DATABASE_URL_DIRECT is required');
await createScenarioStore(connectionString).seed();
console.log(`Seeded ${scenarios.length} Call scenarios.`);
