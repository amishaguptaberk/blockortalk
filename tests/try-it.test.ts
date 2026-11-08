import { expect, test } from 'vitest';
import { createTryItHandlers } from '../lib/try-it/routes';

function fixture(cap = 1000) {
  const starts = new Map<string, number>();
  const outcomes = new Map<string, unknown>();
  let total = 0;
  const handlers = createTryItHandlers({
    secret: 'test-secret-with-at-least-thirty-two-characters',
    reply: async ({ options }) => options[0],
    reserve: async visitor => {
      if ((starts.get(visitor) ?? 0) >= 3) return 'visitor';
      if (total >= cap) return 'global';
      starts.set(visitor, (starts.get(visitor) ?? 0) + 1); total++; return null;
    },
    count: async (id, outcome) => { outcomes.set(id, outcome); },
  });
  let token: string | undefined;
  let cookie = '';
  async function post(action: object) {
    const response = await handlers.POST(new Request('https://tell.test/api/try-it', { method: 'POST', headers: { origin: 'https://tell.test', cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token }) }));
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    const body = await response.json() as { token?: string; reveal: { calls: unknown[] }; error?: string };
    if (body.token) token = body.token;
    return { response, body };
  }
  return { post, outcomes, handlers };
}

test('an anonymous text day reaches the reveal and stores only an outcome', async () => {
  const f = fixture();
  expect((await f.post({ type: 'start' })).response.status).toBe(201);
  for (let call = 0; call < 3; call++) {
    await f.post({ type: 'reply', text: 'I will check through a source I have.' });
    await f.post({ type: 'end' });
    await f.post({ type: 'verdict', verdict: 'Unverified' });
    if (call < 2) await f.post({ type: 'next' });
  }
  const result = await f.post({ type: 'reveal' });
  expect(result.body.reveal.calls).toHaveLength(3);
  expect(f.outcomes.size).toBe(1);
  expect([...f.outcomes.values()]).toEqual([{ balance: 1000, interview: 'OPEN', bank: 'OPEN' }]);
});

test('the fourth day is blocked with a friendly retry message', async () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) expect((await f.post({ type: 'start' })).response.status).toBe(201);
  const fourth = await f.post({ type: 'start' });
  expect(fourth.response.status).toBe(429);
  expect(fourth.body.error).toContain('come back in an hour');
  expect(f.outcomes.size).toBe(0);
});

test('the global cap blocks another start', async () => {
  const f = fixture(1);
  expect((await f.post({ type: 'start' })).response.status).toBe(201);
  const second = await f.post({ type: 'start' });
  expect(second.response.status).toBe(429);
  expect(second.body.error).toContain('come back tomorrow');
});

test('a visitor cannot reveal a day early or submit plain state', async () => {
  const f = fixture();
  await f.post({ type: 'start' });
  expect((await f.post({ type: 'reveal' })).response.status).toBe(409);
  const response = await f.handlers.POST(new Request('https://tell.test/api/try-it', { method: 'POST', headers: { origin: 'https://tell.test' }, body: JSON.stringify({ action: { type: 'end' }, token: '{"balance":1000}' }) }));
  expect(response.status).toBe(401);
  expect(f.outcomes.size).toBe(0);
});
