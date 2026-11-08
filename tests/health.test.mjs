import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHealth } from '../lib/health.mjs';

test('reports missing dependencies without crashing', async () => {
  assert.deepEqual(await getHealth({}), { database: false, nvidia: false, elevenlabs: false });
});

test('reports key presence and an unreachable database', async () => {
  const result = await getHealth({ DATABASE_URL: 'postgres://localhost:1/test', NVIDIA_API_KEY: 'example', ELEVENLABS_API_KEY: 'example' });
  assert.deepEqual(result, { database: false, nvidia: true, elevenlabs: true });
});

test('reports a malformed database URL as unreachable', async () => {
  assert.equal((await getHealth({ DATABASE_URL: 'postgres://%' })).database, false);
});
