import { expect, test } from 'vitest';
import { createSeasonHandlers, type SeasonStore, type Score } from '../lib/season/routes';

const season = { id: 'season-1', name: 'Season 1', startsAt: '2026-11-08T00:00:00.000Z', endsAt: '2026-11-10T07:00:00.000Z', prizes: [{ place: 1, prize: 'iPhone 18' }] };
function setup(scores: Score[] = []) {
  let time = Date.parse(season.startsAt);
  const store: SeasonStore = {
    async current() { return season; },
    async scores() { return scores; },
    async claim() { return true; },
  };
  const handlers = createSeasonHandlers({ store, now: () => time, player: async () => ({ id: 'me', email: 'private@example.com', nickname: 'My name' }) });
  return { ...handlers, end() { time = Date.parse(season.endsAt); } };
}
test('Season status changes at the exact end time and never returns email', async () => {
  const api = setup();
  const live = await api.GET(new Request('https://tell.test/api/season'));
  expect(await live.json()).toMatchObject({ season: { status: 'live', scoringOpen: true }, final: false });
  expect(live.headers.get('cache-control')).toBe('no-store');
  api.end();
  const ended = await api.GET(new Request('https://tell.test/api/season'));
  const body = await ended.text();
  expect(JSON.parse(body)).toMatchObject({ season: { status: 'ended', scoringOpen: false }, final: true });
  expect(body).not.toContain('email');
  expect(body).not.toContain('private@example.com');
});

test('rank uses Blokbuks, accuracy, then reached time; own rank remains visible below 100', async () => {
  const row = (playerId: string, right: number, reachedAt = season.startsAt): Score => ({ playerId, nickname: playerId, blokbuks: 100, right, wrong: 1, reachedAt });
  const api = setup([row('late', 9, '2026-11-08T01:00:00Z'), row('less-accurate', 1), row('early', 9),
    ...Array.from({ length: 100 }, (_, i) => ({ ...row(`other-${i}`, 0), blokbuks: 50 })), { ...row('me', 0), blokbuks: 0 }]);
  const body = await (await api.GET(new Request('https://tell.test/api/season'))).json() as { leaderboard: { nickname: string }[]; ownRank: unknown };
  expect(body.leaderboard).toHaveLength(100);
  expect(body.leaderboard.slice(0, 3).map((r: { nickname: string }) => r.nickname)).toEqual(['early', 'late', 'less-accurate']);
  expect(body.ownRank).toEqual({ rank: 104, nickname: 'me', blokbuks: 0 });
});

test('only a signed-in top-three Player after the end can record a confirmed claim', async () => {
  const score: Score = { playerId: 'me', nickname: 'Winner', blokbuks: 100, right: 4, wrong: 0, reachedAt: season.startsAt };
  const api = setup([score]);
  const request = (body: unknown) => new Request('https://tell.test/api/season/claim', { method: 'POST', headers: { origin: 'https://tell.test' }, body: JSON.stringify(body) });
  const valid = { email: 'private@example.com', adult: true, usResident: true };
  expect((await api.POST(request(valid))).status).toBe(409);
  api.end();
  expect((await api.POST(request({ ...valid, adult: false }))).status).toBe(400);
  expect((await api.POST(request({ ...valid, email: 'other@example.com' }))).status).toBe(400);
  const response = await api.POST(request(valid));
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain('private@example.com');
  const outside = setup(Array.from({ length: 4 }, (_, i) => ({ ...score, playerId: i === 3 ? 'me' : `other-${i}`, blokbuks: 400 - i })));
  outside.end();
  expect((await outside.POST(request(valid))).status).toBe(403);
});
