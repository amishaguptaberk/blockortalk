import { expect, test } from 'vitest';
import { createPlayRoute } from '../lib/season/play/routes';
test('signed-out visitors cannot read the Play catalog', async () => {
  const route = createPlayRoute({ currentPlayer: async () => null, read: async () => { throw new Error('must not read'); } });
  expect((await route(new Request('https://tell.test/api/play'))).status).toBe(401);
});
import { createPlayReadModel } from '../lib/season/play/read-model';
test('the sixth call is practice and catalog exposes only Category and fictional org', async () => {
  const read = createPlayReadModel({ now: () => new Date('2026-11-08T18:00:00Z'), currentSeason: async () => ({ id: 's', name: 'Season 1', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T00:00:00Z' }), catalog: async () => [{ id: 'bank', category: 'Bank fraud alert', org: 'Corvanta Bank', version: 'scam', secrets: ['hidden'] }], score: async () => 250, scoredStarts: async () => Array(5).fill('2026-11-08T17:00:00Z') });
  const model = await read('player');
  expect(model).toMatchObject({ blokbuks: 250, scoredCallsLeft: 0, nextCallScored: false });
  expect(model.scenarios).toEqual([{ id: 'bank', category: 'Bank fraud alert', org: 'Corvanta Bank' }]);
});
test('two missed calls suggest the matching scenario and one call suggests nothing', async () => {
  const catalog = async () => [
    { id: 'bank', category: 'Bank fraud alert', org: 'Puffinvale Bank', tactic: 'Details as proof' },
    { id: 'delivery', category: 'Delivery or customs fee', org: 'Mossparcel', tactic: 'Urgency' },
  ];
  const base = { now: () => new Date('2026-11-08T18:00:00Z'), currentSeason: async () => ({ id: 's', name: 'Season 1', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T00:00:00Z' }), catalog, score: async () => 0, scoredStarts: async () => [] };
  const missed = { playerId: 'p', scenarioId: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency' as const, version: 'scam' as const, verdict: 'Real' as const, leaked: false, synthetic: false };
  const suggested = await createPlayReadModel({ ...base, finished: async () => [missed, missed] })('p');
  expect(suggested.suggested).toEqual({ id: 'delivery', category: 'Delivery or customs fee' });
  expect(suggested.scenarios[0]).toEqual({ id: 'bank', category: 'Bank fraud alert', org: 'Puffinvale Bank' });
  expect((await createPlayReadModel({ ...base, finished: async () => [missed] })('p')).suggested).toBeNull();
});
test('unavailable Season dependencies return retryable 503 rather than invented totals', async()=>{
 const route=createPlayRoute({currentPlayer:async()=>({id:'p'}),read:async()=>{throw new Error('missing season_scores');}});
 const response=await route(new Request('https://tell.test/api/play'));expect(response.status).toBe(503);expect(await response.text()).not.toContain('blokbuks');
});
