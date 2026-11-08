import { describe, expect, it } from 'vitest';
import type { CallRow, Scenario } from '../lib/season/analysis';
import { createMeHandlers } from '../lib/season/me';
import { fixedSentences } from '../lib/season/analyst';
import { playerAnalysis } from '../lib/season/analysis';
import type { AnalysisRecord, AnalysisStore } from '../lib/season/refresh';

const scenarios: Scenario[] = [
  { id: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof' },
  { id: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency' },
];
const call = (over: Partial<CallRow> = {}): CallRow => ({ playerId: 'p1', scenarioId: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency', version: 'scam', verdict: 'Scam', leaked: false, synthetic: false, ...over });

function fixture(rows: CallRow[], stored: AnalysisRecord | null = null, playerId: string | null = 'p1') {
  let record = stored;
  const saves: AnalysisRecord[] = [];
  const store: AnalysisStore = { async get() { return record; }, async save(_id, value) { record = value; saves.push(value); } };
  const handlers = createMeHandlers({ getPlayerId: async () => playerId, loadCalls: async () => rows, scenarios, store });
  const get = async () => {
    const response = await handlers.GET(new Request('https://tell.test/api/me'));
    return { response, body: await response.json() as any };
  };
  return { get, saves };
}

describe('/me', () => {
  it('asks for a sign-in when there is no Player', async () => {
    const { response } = await fixture([], null, null).get();
    expect(response.status).toBe(401);
  });

  it('is locked with no finished calls and asks for two', async () => {
    const { response, body } = await fixture([]).get();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ state: 'locked', finished: 0, needed: 2, message: 'Play two more calls to unlock your analysis' });
  });

  it('is locked with one finished call and asks for one more', async () => {
    const { body } = await fixture([call()]).get();
    expect(body).toMatchObject({ state: 'locked', finished: 1, needed: 1, message: 'Play one more call to unlock your analysis' });
  });

  it('does not count a call without a Verdict', async () => {
    const { body } = await fixture([call(), call({ verdict: null })]).get();
    expect(body.state).toBe('locked');
  });

  it('unlocks at two finished calls with the four sections', async () => {
    const { body } = await fixture([call({ leaked: true }), call()]).get();
    expect(body.state).toBe('ready');
    expect(body.sections.map((s: any) => s.id)).toEqual(['missed', 'right', 'rejected', 'tryNext']);
    expect(body.sections[0].facts).toEqual(['Urgency: missed 1 of 2', 'Delivery or customs fee: missed 1 of 2']);
    expect(body.sections[2].facts).toEqual(['0 real callers called a scam']);
  });

  it('links Try next to the suggested Call scenario', async () => {
    const { body } = await fixture([call({ leaked: true }), call()]).get();
    const tryNext = body.sections[3];
    expect(tryNext.link).toEqual({ href: '/play/delivery', label: 'Delivery or customs fee' });
  });

  it('shows the stored sentences instantly, but the numbers always come from code', async () => {
    const rows = [call({ leaked: true }), call()];
    const analysis = playerAnalysis(rows, scenarios);
    if (analysis.locked) throw new Error('unlocked fixture');
    const sentences = { missed: 'Stored missed.', right: 'Stored right.', rejected: 'Stored rejected.', tryNext: 'Stored next.' };
    // Stored counts disagree with the real rows on purpose; they must not be shown.
    const stored: AnalysisRecord = { finished: 2, counts: { ...analysis, rejectedReal: 99 }, sentences, tryNext: analysis.tryNext, source: 'model' };
    const f = fixture(rows, stored);
    const { body } = await f.get();
    const saves = f.saves;
    expect(body.sections.map((s: any) => s.sentence)).toEqual(Object.values(sentences));
    expect(body.sections[2].facts).toEqual(['0 real callers called a scam']);
    expect(saves).toHaveLength(0);
  });

  it('falls back to fixed sentences, and stores them, when nothing usable is stored', async () => {
    const rows = [call({ leaked: true }), call()];
    const analysis = playerAnalysis(rows, scenarios);
    if (analysis.locked) throw new Error('unlocked fixture');
    const f = fixture(rows, null);
    const { body } = await f.get();
    const saves = f.saves;
    expect(body.sections.map((s: any) => s.sentence)).toEqual(Object.values(fixedSentences(analysis)));
    expect(saves).toHaveLength(1);
    expect(saves[0].source).toBe('fixed');
  });

  it('replaces a stale stored analysis from before the latest call', async () => {
    const rows = [call({ leaked: true }), call(), call()];
    const old = playerAnalysis(rows.slice(0, 2), scenarios);
    if (old.locked) throw new Error('unlocked fixture');
    const stored: AnalysisRecord = { finished: 2, counts: old, sentences: { missed: 'Old.', right: 'Old.', rejected: 'Old.', tryNext: 'Old.' }, tryNext: old.tryNext, source: 'model' };
    const { body } = await fixture(rows, stored).get();
    expect(body.finished).toBe(3);
    expect(body.sections[0].sentence).not.toBe('Old.');
  });

  it('still renders when the store is down', async () => {
    const handlers = createMeHandlers({
      getPlayerId: async () => 'p1', loadCalls: async () => [call({ leaked: true }), call()], scenarios,
      store: { async get() { throw new Error('db'); }, async save() { throw new Error('db'); } },
    });
    const response = await handlers.GET(new Request('https://tell.test/api/me'));
    expect(response.status).toBe(200);
    expect((await response.json() as any).state).toBe('ready');
  });

  it('keeps copy free of dataset mentions', async () => {
    const { body } = await fixture([call({ leaked: true }), call({ version: 'real', verdict: 'Scam' })]).get();
    expect(JSON.stringify(body)).not.toMatch(/dataset|kaggle|bothbosu|corpus/i);
  });
});
