import { describe, expect, it } from 'vitest';
import type { CallRow, Tactic, Verdict, Version } from '../lib/season/analysis';
import { createInsightsHandlers, INSIGHTS_COOKIE, type InsightsStore, type StoredSummary } from '../lib/insights/routes';
import { insightsHandlers } from '../lib/insights/server';
import { INSIGHTS_PASSWORD } from '../lib/insights/access';

const PASSWORD = 'correct horse battery staple';
const NOW = Date.parse('2026-11-08T12:00:00Z');
const minutes = (n: number) => new Date(NOW - n * 60_000).toISOString();

type Spec = { players: number; category: string; tactic: Tactic; version: Version; verdict: Verdict; leaked?: boolean; synthetic?: boolean };
/** `players` distinct Players, one finished call each. Ids and scenario ids are recognisable so a leak is findable. */
function calls(spec: Spec): CallRow[] {
  return Array.from({ length: spec.players }, (_, i) => ({
    playerId: `player-secret-${spec.category}-${spec.synthetic ? 's' : 'r'}-${i}`,
    scenarioId: `scenario-secret-${spec.category}`,
    category: spec.category, tactic: spec.tactic, version: spec.version, verdict: spec.verdict,
    leaked: spec.leaked ?? false, synthetic: spec.synthetic ?? false,
  }));
}

const realRows = [
  ...calls({ players: 6, category: 'Bank fraud alert', tactic: 'Details as proof', version: 'scam', verdict: 'Real' }), // fell for, shown
  ...calls({ players: 2, category: 'Tech support', tactic: 'Fear', version: 'scam', verdict: 'Scam' }),                // caught, hidden
];
const syntheticRows = [
  ...calls({ players: 9, category: 'Bank fraud alert', tactic: 'Details as proof', version: 'scam', verdict: 'Real', synthetic: true }),
  ...calls({ players: 7, category: 'Tech support', tactic: 'Fear', version: 'scam', verdict: 'Scam', synthetic: true }),
  ...calls({ players: 3, category: 'Prize or sweepstakes', tactic: 'Reward', version: 'real', verdict: 'Scam', synthetic: true }), // hidden
];

function fixture(options: { password?: string | undefined; summary?: StoredSummary | null; llm?: () => Promise<string | null>; now?: number; storeFails?: boolean } = {}) {
  let stored: StoredSummary | null = options.summary ?? null;
  const saved: StoredSummary[] = [];
  const analystCalls: unknown[] = [];
  const store: InsightsStore = {
    async loadCalls(include) {
      if (options.storeFails) throw new Error('database down');
      return include === 'synthetic' ? syntheticRows : realRows;
    },
    async latestSummary() { return stored; },
    async saveSummary(summary) { stored = summary; saved.push(summary); },
  };
  const handlers = createInsightsHandlers({
    password: 'password' in options ? options.password : PASSWORD,
    store,
    analyst: async (groups, synthetic) => { analystCalls.push({ groups, synthetic }); return options.llm ? options.llm() : 'Bank fraud alerts that lean on details as proof are the most common fall.'.replace(/\n/g, ' '); },
    now: () => options.now ?? NOW,
  });
  const request = (path: string, init: RequestInit & { cookie?: string } = {}) => {
    const { cookie, ...rest } = init;
    return new Request(`https://tell.test${path}`, { ...rest, headers: { ...(cookie ? { cookie } : {}), ...(rest.headers as Record<string, string> | undefined) } });
  };
  /** Sign in the way a browser does and return the cookie header to send back. */
  async function signIn(password = PASSWORD) {
    const response = await handlers.unlock(request('/api/insights/unlock', {
      method: 'POST', headers: { origin: 'https://tell.test', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }).toString(),
    }));
    const setCookie = response.headers.get('set-cookie');
    return { response, setCookie, cookie: setCookie ? setCookie.split(';')[0]! : undefined };
  }
  return { handlers, request, signIn, saved, analystCalls, stored: () => stored };
}

describe('access', () => {
  it('blocks every route without the cookie', async () => {
    const { handlers, request, analystCalls } = fixture();
    const json = await handlers.GET(request('/api/insights'));
    const csv = await handlers.CSV(request('/api/insights/csv'));
    expect(json.status).toBe(401);
    expect(csv.status).toBe(401);
    expect(await json.json()).toEqual({ locked: true });
    expect(analystCalls).toEqual([]);
  });

  it('a wrong password sets no cookie and sends the Player back to the prompt', async () => {
    const { signIn } = fixture();
    const { response, setCookie } = await signIn('guess');
    expect(setCookie).toBeNull();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://tell.test/insights?error=1');
  });

  it('the right password sets an HttpOnly cookie that does not contain the password', async () => {
    const { signIn } = fixture();
    const { response, setCookie } = await signIn();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://tell.test/insights');
    expect(setCookie).toMatch(new RegExp(`^${INSIGHTS_COOKIE}=[a-f0-9]{64};`));
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).not.toContain(PASSWORD);
    expect(setCookie).not.toContain(encodeURIComponent(PASSWORD));
  });

  it('the cookie opens the totals; a tampered cookie does not', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    expect((await handlers.GET(request('/api/insights', { cookie }))).status).toBe(200);
    expect((await handlers.GET(request('/api/insights', { cookie: `${INSIGHTS_COOKIE}=${'0'.repeat(64)}` }))).status).toBe(401);
    expect((await handlers.GET(request('/api/insights', { cookie: `${INSIGHTS_COOKIE}=${PASSWORD}` }))).status).toBe(401);
  });

  it('refuses a sign-in from another origin', async () => {
    const { handlers, request } = fixture();
    const response = await handlers.unlock(request('/api/insights/unlock', {
      method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(PASSWORD)}`,
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('fails closed with an empty password, even for an empty submission or a cookie made from an empty password', async () => {
    for (const password of [undefined, '']) {
      const { handlers, request, signIn } = fixture({ password });
      const { setCookie } = await signIn('');
      expect(setCookie).toBeNull();
      const forged = `${INSIGHTS_COOKIE}=${'a'.repeat(64)}`;
      expect((await handlers.GET(request('/api/insights', { cookie: forged }))).status).toBe(401);
    }
  });

  it('does not set a Secure cookie on plain http (local dev)', async () => {
    const { handlers } = fixture();
    const response = await handlers.unlock(new Request('http://localhost:5173/api/insights/unlock', {
      method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(PASSWORD)}`,
    }));
    expect(response.headers.get('set-cookie')).not.toMatch(/Secure/i);
  });
});

describe('totals', () => {
  it('defaults to real Players only and hides small groups without counts', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    const response = await handlers.GET(request('/api/insights', { cookie }));
    const body = await response.json() as any;
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.synthetic).toBe(false);
    expect(body.label).toBe('Real Players');
    expect(body.groups).toEqual([
      { category: 'Bank fraud alert', tactic: 'Details as proof', outcome: 'fell for', hidden: false, calls: 6, players: 6 },
      { category: 'Tech support', tactic: 'Fear', outcome: 'caught', hidden: true, note: 'Fewer than 5 Players' },
    ]);
  });

  it('the synthetic toggle shows only synthetic rows, labelled, never mixed with real ones', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    const body = await (await handlers.GET(request('/api/insights?synthetic=1', { cookie }))).json() as any;
    expect(body.synthetic).toBe(true);
    expect(body.label).toBe('Synthetic demo data');
    expect(body.groups.map((g: any) => [g.category, g.hidden ? 'hidden' : g.players])).toEqual([
      ['Bank fraud alert', 9], ['Prize or sweepstakes', 'hidden'], ['Tech support', 7],
    ]);
    expect(body.summary.synthetic).toBe(true);
  });

  it('reports a store failure without a stack or details', async () => {
    const { handlers, request, signIn } = fixture({ storeFails: true });
    const { cookie } = await signIn();
    const response = await handlers.GET(request('/api/insights', { cookie }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('database down');
  });
});

describe('nothing identifying leaves the server', () => {
  const forbidden = [/player-secret/, /scenario-secret/, /email/i, /nickname/i, /playerId/, /player_id/, /transcript/i, /@/, /[0-9a-f]{8}-[0-9a-f]{4}-/];

  it('JSON and CSV carry no Player, scenario, email, nickname or transcript field', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    for (const query of ['', '?synthetic=1']) {
      const json = await (await handlers.GET(request(`/api/insights${query}`, { cookie }))).text();
      const csv = await (await handlers.CSV(request(`/api/insights/csv${query}`, { cookie }))).text();
      for (const pattern of forbidden) {
        expect(json, `json ${query} ${pattern}`).not.toMatch(pattern);
        expect(csv, `csv ${query} ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('only whitelisted keys appear on a group', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    const body = await (await handlers.GET(request('/api/insights?synthetic=1', { cookie }))).json() as any;
    for (const group of body.groups) {
      expect(Object.keys(group).sort()).toEqual(group.hidden
        ? ['category', 'hidden', 'note', 'outcome', 'tactic']
        : ['calls', 'category', 'hidden', 'outcome', 'players', 'tactic']);
    }
  });
});

describe('the summary', () => {
  const fresh = (minutesAgo: number, synthetic = false): StoredSummary => ({ text: 'Stored summary.', source: 'model', generatedAt: minutes(minutesAgo), synthetic });

  it('is written from visible totals only and stored with its time and synthetic flag', async () => {
    const { handlers, request, signIn, saved, analystCalls } = fixture();
    const { cookie } = await signIn();
    const body = await (await handlers.GET(request('/api/insights', { cookie }))).json() as any;
    expect(analystCalls).toHaveLength(1);
    const seen = analystCalls[0] as { groups: any[]; synthetic: boolean };
    expect(seen.synthetic).toBe(false);
    expect(seen.groups).toEqual([{ category: 'Bank fraud alert', tactic: 'Details as proof', outcome: 'fell for', calls: 6, players: 6 }]);
    expect(saved).toEqual([{ text: expect.any(String), source: 'model', generatedAt: new Date(NOW).toISOString(), synthetic: false }]);
    expect(body.summary).toMatchObject({ text: saved[0]!.text, generatedAt: new Date(NOW).toISOString(), synthetic: false, stale: false });
  });

  it('is not regenerated while it is 15 minutes old or newer', async () => {
    const { handlers, request, signIn, analystCalls } = fixture({ summary: fresh(15) });
    const { cookie } = await signIn();
    const body = await (await handlers.GET(request('/api/insights', { cookie }))).json() as any;
    expect(analystCalls).toEqual([]);
    expect(body.summary).toMatchObject({ text: 'Stored summary.', stale: false });
  });

  it('is regenerated on open once it is older than 15 minutes', async () => {
    const { handlers, request, signIn, analystCalls, saved } = fixture({ summary: fresh(16) });
    const { cookie } = await signIn();
    await handlers.GET(request('/api/insights', { cookie }));
    expect(analystCalls).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });

  it('keeps real and synthetic summaries apart', async () => {
    const { handlers, request, signIn, analystCalls } = fixture({ summary: fresh(1, false) });
    const { cookie } = await signIn();
    // The store only returns the real summary for the real view, so the synthetic view must generate its own.
    const store: InsightsStore = {
      async loadCalls(include) { return include === 'synthetic' ? syntheticRows : realRows; },
      async latestSummary(synthetic) { return synthetic ? null : fresh(1, false); },
      async saveSummary() {},
    };
    const other = createInsightsHandlers({ password: PASSWORD, store, analyst: async (g, s) => { analystCalls.push({ g, s }); return 'Synthetic summary.'; }, now: () => NOW });
    const body = await (await other.GET(request('/api/insights?synthetic=1', { cookie }))).json() as any;
    expect(body.summary).toMatchObject({ text: 'Synthetic summary.', synthetic: true });
    void handlers;
  });

  it('on model failure shows the last summary, marked as older', async () => {
    const { handlers, request, signIn, saved } = fixture({ summary: fresh(60), llm: async () => null });
    const { cookie } = await signIn();
    const body = await (await handlers.GET(request('/api/insights', { cookie }))).json() as any;
    expect(body.summary).toMatchObject({ text: 'Stored summary.', generatedAt: minutes(60), stale: true });
    expect(saved).toEqual([]);
  });

  it('on model failure with no earlier summary shows a fixed sentence', async () => {
    const { handlers, request, signIn, saved } = fixture({ llm: async () => null });
    const { cookie } = await signIn();
    const body = await (await handlers.GET(request('/api/insights', { cookie }))).json() as any;
    expect(body.summary.text).toBe('A written summary is not available right now. The totals below are current.');
    expect(body.summary.generatedAt).toBeNull();
    expect(saved).toEqual([]);
  });

  it('a model that throws is treated like a failure', async () => {
    const { handlers, request, signIn } = fixture({ llm: async () => { throw new Error('boom'); } });
    const { cookie } = await signIn();
    const response = await handlers.GET(request('/api/insights', { cookie }));
    expect(response.status).toBe(200);
    expect((await response.json() as any).summary.generatedAt).toBeNull();
  });

  it('does not call the model when no group is visible', async () => {
    const hiddenOnly = createInsightsHandlers({
      password: PASSWORD,
      store: { async loadCalls() { return calls({ players: 2, category: 'Tech support', tactic: 'Fear', version: 'scam', verdict: 'Scam' }); }, async latestSummary() { return fresh(60); }, async saveSummary() { throw new Error('should not save'); } },
      analyst: async () => { throw new Error('should not be called'); },
      now: () => NOW,
    });
    const unlock = await hiddenOnly.unlock(new Request('https://tell.test/api/insights/unlock', { method: 'POST', headers: { origin: 'https://tell.test', 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(PASSWORD)}` }));
    const cookie = unlock.headers.get('set-cookie')!.split(';')[0]!;
    const body = await (await hiddenOnly.GET(new Request('https://tell.test/api/insights', { headers: { cookie } }))).json() as any;
    expect(body.summary.text).toMatch(/no group/i);
    expect(body.groups).toEqual([{ category: 'Tech support', tactic: 'Fear', outcome: 'caught', hidden: true, note: 'Fewer than 5 Players' }]);
  });
});

describe('CSV', () => {
  it('is exactly the totals on screen, with hidden groups shown as hidden', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    const response = await handlers.CSV(request('/api/insights/csv', { cookie }));
    expect(response.headers.get('content-type')).toMatch(/text\/csv/);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="tell-carrier-insights-real.csv"');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.text()).trimEnd().split('\r\n')).toEqual([
      'Data,Category,Tactic,Outcome,Calls,Players,Note',
      'Real Players,Bank fraud alert,Details as proof,fell for,6,6,',
      'Real Players,Tech support,Fear,caught,,,Fewer than 5 Players',
    ]);
  });

  it('labels every row synthetic when the toggle is on', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    const response = await handlers.CSV(request('/api/insights/csv?synthetic=1', { cookie }));
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="tell-carrier-insights-synthetic.csv"');
    const [header, ...rows] = (await response.text()).trimEnd().split('\r\n');
    expect(header).toBe('Data,Category,Tactic,Outcome,Calls,Players,Note');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.startsWith('Synthetic demo data,')).toBe(true);
  });

  it('matches the JSON groups one for one', async () => {
    const { handlers, request, signIn } = fixture();
    const { cookie } = await signIn();
    for (const query of ['', '?synthetic=1']) {
      const body = await (await handlers.GET(request(`/api/insights${query}`, { cookie }))).json() as any;
      const rows = (await (await handlers.CSV(request(`/api/insights/csv${query}`, { cookie }))).text()).trimEnd().split('\r\n').slice(1);
      expect(rows.map(r => r.split(',').slice(1, 4).join(','))).toEqual(body.groups.map((g: any) => `${g.category},${g.tactic},${g.outcome}`));
    }
  });
});

describe('production password', () => {
  const unlock = (password: string) => insightsHandlers({} as NodeJS.ProcessEnv).unlock(new Request('https://tell.test/api/insights/unlock', {
    method: 'POST', headers: { origin: 'https://tell.test', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }).toString(),
  }));

  it('opens with "tmobile" and needs no Worker secret', async () => {
    expect(INSIGHTS_PASSWORD).toBe('tmobile');
    const response = await unlock('tmobile');
    expect(response.headers.get('location')).toBe('https://tell.test/insights');
    expect(response.headers.get('set-cookie')).toMatch(/^tell_insights=[a-f0-9]{64};.*HttpOnly/);
  });

  it('rejects anything else', async () => {
    for (const wrong of ['', 'TMobile', 'tmobile ', 'secret']) {
      const response = await unlock(wrong);
      expect(response.headers.get('location'), wrong).toBe('https://tell.test/insights?error=1');
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  });
});
