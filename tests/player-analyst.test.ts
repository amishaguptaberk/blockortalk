import { describe, expect, it } from 'vitest';
import { playerAnalysis, type CallRow, type Scenario } from '../lib/season/analysis';
import { createPlayerAnalyst, fixedSentences, type Sentences } from '../lib/season/analyst';
import { createAnalysisRefresher, type AnalysisRecord, type AnalysisStore } from '../lib/season/refresh';

const scenarios: Scenario[] = [
  { id: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof' },
  { id: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency' },
];

function row(over: Partial<CallRow> = {}): CallRow {
  return { playerId: 'p1', scenarioId: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency', version: 'scam', verdict: 'Scam', leaked: false, synthetic: false, ...over };
}

const missedTwice = [row({ leaked: true }), row({ verdict: 'Real' }), row({ version: 'real', verdict: 'Scam', scenarioId: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof' })];

function unlocked(rows: CallRow[]) {
  const analysis = playerAnalysis(rows, scenarios);
  if (analysis.locked) throw new Error('fixture should be unlocked');
  return analysis;
}

const good: Sentences = {
  missed: 'Urgency calls are the ones that tripped you up most often.',
  right: 'You often caught the scams that asked for a code.',
  rejected: 'Some real callers were turned away, which is understandable.',
  tryNext: 'A bank call is a good next step.',
};

describe('player analyst', () => {
  it('uses the model sentences and keeps the code counts untouched', async () => {
    const analysis = unlocked(missedTwice);
    const before = JSON.stringify(analysis);
    const result = await createPlayerAnalyst(async () => JSON.stringify(good))(analysis);
    expect(result).toEqual({ sentences: good, source: 'model' });
    expect(JSON.stringify(analysis)).toBe(before);
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const result = await createPlayerAnalyst(async () => '```json\n' + JSON.stringify(good) + '\n```')(unlocked(missedTwice));
    expect(result.source).toBe('model');
  });

  it.each([
    ['the model throws', async () => { throw new Error('NVIDIA returned HTTP 500'); }],
    ['the reply is not JSON', async () => 'Sure! Here is your analysis.'],
    ['a section is missing', async () => JSON.stringify({ missed: good.missed })],
    ['a section is empty', async () => JSON.stringify({ ...good, right: '  ' })],
    ['a sentence carries its own numbers', async () => JSON.stringify({ ...good, missed: 'You missed 99 calls.' })],
    ['a sentence is far too long', async () => JSON.stringify({ ...good, missed: 'You take care. '.repeat(40) })],
    ['a sentence mentions a dataset', async () => JSON.stringify({ ...good, right: 'Compared with the Kaggle dataset you did well.' })],
    ['a sentence shames the Player', async () => JSON.stringify({ ...good, missed: 'You were gullible about urgent calls.' })],
  ])('falls back to fixed sentences when %s', async (_name, llm) => {
    const analysis = unlocked(missedTwice);
    const result = await createPlayerAnalyst(llm as never)(analysis);
    expect(result).toEqual({ sentences: fixedSentences(analysis), source: 'fixed' });
  });

  it('uses fixed sentences when no model is configured', async () => {
    const analysis = unlocked(missedTwice);
    expect(await createPlayerAnalyst(undefined)(analysis)).toEqual({ sentences: fixedSentences(analysis), source: 'fixed' });
  });

  it('never hands the model anything but code-computed numbers and names', async () => {
    let prompt = '';
    await createPlayerAnalyst(async request => { prompt = request.system + request.user; return JSON.stringify(good); })(unlocked(missedTwice));
    expect(prompt).toContain('Urgency');
    expect(prompt).not.toMatch(/p1|synthetic/);
  });
});

describe('fixed sentences', () => {
  it('are calm, plain, number-free and cover every section, even when nothing was missed', () => {
    for (const rows of [missedTwice, [row(), row({ scenarioId: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof' })]]) {
      const sentences = fixedSentences(unlocked(rows));
      for (const text of Object.values(sentences)) {
        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toMatch(/\d|dataset|kaggle|bothbosu/i);
      }
    }
  });
});

describe('analysis refresher', () => {
  function memoryStore() {
    const rows = new Map<string, AnalysisRecord>();
    const store: AnalysisStore = { async get(id) { return rows.get(id) ?? null; }, async save(id, record) { rows.set(id, record); } };
    return { rows, store };
  }

  it('stores the analyst sentences next to the code counts', async () => {
    const { rows, store } = memoryStore();
    const refresh = createAnalysisRefresher({ loadCalls: async () => missedTwice, scenarios, analyst: createPlayerAnalyst(async () => JSON.stringify(good)), store });
    expect(await refresh('p1')).toBe(true);
    const saved = rows.get('p1')!;
    expect(saved.sentences).toEqual(good);
    expect(saved.source).toBe('model');
    expect(saved.finished).toBe(3);
    expect(saved.counts).toEqual(unlocked(missedTwice));
    expect(saved.tryNext).toBe(unlocked(missedTwice).tryNext);
  });

  it('stores fixed sentences when the model fails', async () => {
    const { rows, store } = memoryStore();
    const refresh = createAnalysisRefresher({ loadCalls: async () => missedTwice, scenarios, analyst: createPlayerAnalyst(async () => { throw new Error('down'); }), store });
    expect(await refresh('p1')).toBe(true);
    expect(rows.get('p1')!.source).toBe('fixed');
  });

  it('writes nothing below two finished calls', async () => {
    const { rows, store } = memoryStore();
    const refresh = createAnalysisRefresher({ loadCalls: async () => [row()], scenarios, analyst: createPlayerAnalyst(undefined), store });
    expect(await refresh('p1')).toBe(false);
    expect(rows.size).toBe(0);
  });

  it('never throws, so a failing refresh cannot fail the finished call', async () => {
    const refresh = createAnalysisRefresher({
      loadCalls: async () => { throw new Error('database down'); }, scenarios, analyst: createPlayerAnalyst(undefined),
      store: { async get() { return null; }, async save() { throw new Error('nope'); } },
    });
    expect(await refresh('p1')).toBe(false);
  });

  it('changes after a third call with a different mistake', async () => {
    const { rows, store } = memoryStore();
    let calls = missedTwice.slice(0, 2);
    const refresh = createAnalysisRefresher({ loadCalls: async () => calls, scenarios, analyst: createPlayerAnalyst(undefined), store });
    await refresh('p1');
    const first = JSON.stringify(rows.get('p1'));
    calls = missedTwice;
    await refresh('p1');
    expect(JSON.stringify(rows.get('p1'))).not.toBe(first);
    expect(rows.get('p1')!.finished).toBe(3);
  });
});
