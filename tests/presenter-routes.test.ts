import { describe, expect, it } from 'vitest';
import { createPresenterHandlers } from '../lib/challenge/presenter';
import type { PresenterSnapshot } from '../lib/challenge/presenter-types';
import type { StagePlan } from '../lib/stage/plan';

const id = '11111111-1111-4111-8111-111111111111';
const token = 'a'.repeat(64);
const snapshot: PresenterSnapshot = { callerName: 'Ren', organization: 'Bluebonnet Labs onboarding', phase: 'call', risk: 91,
  tactics: ['urgency'], scoredTurn: 4, currentTurn: 4, status: 'ready', firstCorrectTurn: 4, firstCorrectSeconds: 5, series: [], plan: 'phone', planSeq: 0 };
function fixture({ fail = false } = {}) {
  const read = async (_id: string, proof: string) => proof === token ? snapshot : null;
  const plans: Array<{ id: string; plan: string }> = [];
  let seq = 0;
  let current: { plan: StagePlan; seq: number } | undefined;
  const setPlan = async (planId: string, proof: string, plan: StagePlan, expected: number) => {
    if (fail) throw new Error('database down');
    if (proof !== token) return null;
    if (expected !== seq) return { applied: false, stagePlan: current };
    plans.push({ id: planId, plan });
    current = { plan, seq: ++seq };
    return { applied: true, stagePlan: current };
  };
  const handlers = createPresenterHandlers({
    service: () => ({ get: async () => ({ id, risk: { token, calls: [] } }) }),
    risk: () => ({ read, setPlan }), scheduleRisk: () => {},
  });
  return Object.assign(handlers, { plans });
}
const put = (body: unknown, authorization = `Bearer ${id}.${token}`) => new Request('https://tell.test/api/presenter', {
  method: 'PUT', headers: { authorization, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
describe('presenter routes', () => {
  it('requires a separate capability even when the browser has the player cookie', async () => {
    const h = fixture();
    const response = await h.GET(new Request('https://tell.test/api/presenter', { headers: { cookie: `tell_challenge=${id}` } }));
    expect(response.status).toBe(401);
  });
  it('serves only the authorized projection without caching', async () => {
    const h = fixture();
    const response = await h.GET(new Request('https://tell.test/api/presenter', { headers: { authorization: `Bearer ${id}.${token}` } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ snapshot });
  });
  it('rejects a wrong capability', async () => {
    const h = fixture();
    const response = await h.GET(new Request('https://tell.test/api/presenter', { headers: { authorization: `Bearer ${id}.${'b'.repeat(64)}` } }));
    expect(response.status).toBe(401);
  });
  it('creates a share link only for a same-origin request with a player session', async () => {
    const h = fixture();
    expect((await h.POST(new Request('https://tell.test/api/presenter', { method: 'POST', headers: { origin: 'https://elsewhere.test', cookie: `tell_challenge=${id}` } }))).status).toBe(403);
    expect((await h.POST(new Request('https://tell.test/api/presenter', { method: 'POST', headers: { origin: 'https://tell.test' } }))).status).toBe(401);
    const response = await h.POST(new Request('https://tell.test/api/presenter', { method: 'POST', headers: { origin: 'https://tell.test', cookie: `tell_challenge=${id}` } }));
    expect(await response.json()).toEqual({ path: `/presenter#${id}.${token}` });
  });
  it('switches the stage plan in one request with the presenter capability', async () => {
    const h = fixture();
    const response = await h.PUT(put({ plan: 'voice', seq: 0 }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ stagePlan: { plan: 'voice', seq: 1 } });
    expect(await (await h.PUT(put({ plan: 'text', seq: 1 }))).json()).toEqual({ stagePlan: { plan: 'text', seq: 2 } });
    expect(h.plans).toEqual([{ id, plan: 'voice' }, { id, plan: 'text' }]);
  });
  it('never lets the player cookie or a wrong capability switch the plan', async () => {
    const h = fixture();
    const cookieOnly = new Request('https://tell.test/api/presenter', { method: 'PUT', headers: { cookie: `tell_challenge=${id}` }, body: JSON.stringify({ plan: 'text', seq: 0 }) });
    expect((await h.PUT(cookieOnly)).status).toBe(401);
    expect((await h.PUT(put({ plan: 'text', seq: 0 }, `Bearer ${id}.${'b'.repeat(64)}`))).status).toBe(401);
    expect(h.plans).toEqual([]);
  });
  it('rejects anything but one of the three plans', async () => {
    const h = fixture();
    for (const body of [{ plan: 'scam', seq: 0 }, { plan: 'VOICE', seq: 0 }, { plan: 'voice' }, { plan: 'voice', seq: -1 }, { plan: 'voice', seq: 1.5 }, {}, 'not json', { plan: 'voice', seq: 0, extra: 'x'.repeat(5000) }])
      expect((await h.PUT(put(body))).status).toBe(400);
    const declaredHuge = new Request('https://tell.test/api/presenter', { method: 'PUT',
      headers: { authorization: `Bearer ${id}.${token}`, 'content-length': '5000000' }, body: JSON.stringify({ plan: 'voice', seq: 0 }) });
    expect((await h.PUT(declaredHuge)).status).toBe(400);
    expect(h.plans).toEqual([]);
  });
  it('refuses a tap based on a stale plan, so a retried tap after a timeout never switches twice', async () => {
    const h = fixture();
    expect((await h.PUT(put({ plan: 'voice', seq: 0 }))).status).toBe(200);
    const retry = await h.PUT(put({ plan: 'voice', seq: 0 }));
    expect(retry.status).toBe(409);
    expect(await retry.json()).toMatchObject({ stagePlan: { plan: 'voice', seq: 1 } });
    expect(h.plans).toEqual([{ id, plan: 'voice' }]);
  });
  it('reports a storage failure without claiming the switch happened', async () => {
    const response = await fixture({ fail: true }).PUT(put({ plan: 'voice', seq: 0 }));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('stagePlan');
  });
});
