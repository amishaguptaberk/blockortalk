import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { createPlayerHandlers, currentPlayer, type PlayerStore, type Player } from '../lib/players/routes';

type Payload = { player: { id: string; nickname: string } | null; errors?: { nickname?: string } };
const payload = async (response: Response) => await response.json() as Payload;

function setup() {
  const players = new Map<string, Player>();
  const sessions = new Map<string, { player: Player; expires: number }>();
  let time = Date.parse('2026-11-08T12:00:00Z');
  const store: PlayerStore = {
    async findByEmail(email) { return players.get(email) ?? null; },
    async createPlayer(email, nickname) {
      if ([...players.values()].some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) return null;
      const player = { id: crypto.randomUUID(), email, nickname };
      players.set(email, player); return player;
    },
    async saveSession(hash, player, expires) { sessions.set(hash, { player, expires }); },
    async findSession(hash, now) { const session = sessions.get(hash); return session && session.expires > now ? session.player : null; },
    async deleteSession(hash) { sessions.delete(hash); },
  };
  const handlers = createPlayerHandlers({ store, now: () => time });
  function post(body: unknown, cookie = '', origin = 'https://tell.test') {
    return handlers.POST(new Request('https://tell.test/api/players', { method: 'POST', headers: { origin, cookie }, body: JSON.stringify(body) }));
  }
  return { store, handlers, post, sessions, players, now: () => time, expire() { time += 30 * 86400000; } };
}

test('signup issues a private 30-day cookie and restores the current Player using only its hash', async () => {
  const s = setup();
  const response = await s.post({ action: 'signup', email: ' Player@Example.com ', nickname: 'River' });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!;
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=2592000']) expect(cookie).toContain(flag);
  const token = cookie.split(';')[0].split('=')[1];
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(s.sessions.has(token)).toBe(false);
  expect(s.sessions.has(createHash('sha256').update(token).digest('hex'))).toBe(true);
  const request = new Request('https://tell.test', { headers: { cookie: cookie.split(';')[0] } });
  expect(await currentPlayer(request, s.store, s.now())).toMatchObject({ email: 'player@example.com', nickname: 'River' });
  expect(await response.json()).toEqual({ player: { id: s.players.get('player@example.com')!.id, nickname: 'River' } });
});

test('nickname failures are field errors; existing email signs in without changing the Player', async () => {
  const s = setup();
  const first = await s.post({ action: 'signup', email: 'one@example.com', nickname: 'River' });
  const original = (await payload(first)).player;
  const taken = await s.post({ action: 'signup', email: 'two@example.com', nickname: 'rIVER' });
  expect(taken.status).toBe(409);
  expect(await payload(taken)).toEqual({ errors: { nickname: 'This nickname is taken. Choose another.' } });
  for (const nickname of ['ab', 'a'.repeat(21), 'shithead', 'a\u200bb']) {
    const response = await s.post({ action: 'signup', email: 'two@example.com', nickname });
    expect(response.status).toBe(400);
    expect((await payload(response)).errors?.nickname).toBeTruthy();
  }
  for (const action of ['signup', 'signin']) {
    const response = await s.post({ action, email: 'ONE@EXAMPLE.COM', nickname: 'x' });
    expect(response.status).toBe(200);
    expect((await payload(response)).player).toEqual(original);
  }
  expect(s.players.size).toBe(1);
});

test('missing, unknown and expired sessions return none; sign-out removes the session', async () => {
  const s = setup();
  expect(await currentPlayer(new Request('https://tell.test'), s.store, s.now())).toBeNull();
  expect(await currentPlayer(new Request('https://tell.test', { headers: { cookie: 'tell_player=' + 'f'.repeat(64) } }), s.store, s.now())).toBeNull();
  const response = await s.post({ action: 'signup', email: 'one@example.com', nickname: 'River' });
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const request = new Request('https://tell.test', { headers: { cookie } });
  expect((await payload(await s.handlers.GET(request))).player?.nickname).toBe('River');
  s.expire();
  expect(await currentPlayer(request, s.store, s.now())).toBeNull();
  const out = await s.post({ action: 'signout' }, cookie);
  expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(s.sessions.size).toBe(0);
});

test('rejects invalid inputs and cross-origin session changes without setting cookies', async () => {
  const s = setup();
  for (const body of [null, [], { action: 'other' }, { action: 'signup', email: 'bad' }, { action: 'signin', email: 'missing@example.com' }]) {
    const response = await s.post(body);
    expect(response.status).toBe(400);
    expect(response.headers.has('set-cookie')).toBe(false);
  }
  expect((await s.post({ action: 'signout' }, '', 'https://other.test')).status).toBe(403);
});
