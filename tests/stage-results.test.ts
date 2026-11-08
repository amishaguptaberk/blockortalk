import { describe, expect, it } from 'vitest';
import { NOT_MEASURED, parseStageResults, resultsSlide, type StageResults } from '../lib/stage/results';
import shipped from '../data/stage/results.json';

const empty = { syntheticF1: null, realCallDetectionRate: null, hardNegativeFalseAlarmRate: null, medianDetectionSeconds: null };
function results(retrieval: Partial<StageResults['detectors']['retrieval']> = {}): StageResults {
  return {
    measuredOn: '2026-11-07', source: 'docs/DETECTION_RESULTS.md',
    realCalls: { n: 859 }, hardNegatives: { n: 44 },
    detectors: {
      baseline: { syntheticF1: 1, realCallDetectionRate: 0.0489, hardNegativeFalseAlarmRate: 0, medianDetectionSeconds: 0.0007 },
      nemotron: { ...empty },
      retrieval: { ...empty, ...retrieval },
    },
  };
}

describe('results slide', () => {
  it('shows measured values and marks every missing one as not measured, never as zero', () => {
    const slide = resultsSlide(results());
    expect(slide.headline).toEqual([
      { metric: 'Real scam calls caught', retrieval: NOT_MEASURED, baseline: '4.9%' },
      { metric: 'False alarms on urgent legit calls', retrieval: NOT_MEASURED, baseline: '0.0%' },
    ]);
    expect(slide.table.map(row => row.detector)).toEqual(['Nemotron + retrieval', 'Nemotron zero-shot', 'Keyword baseline']);
    expect(slide.table[2]).toEqual({ detector: 'Keyword baseline', syntheticF1: '1.00', realCalls: '4.9%', falseAlarms: '0.0%', seconds: '0.7 ms' });
    expect(slide.table[1]).toEqual({ detector: 'Nemotron zero-shot', syntheticF1: NOT_MEASURED, realCalls: NOT_MEASURED, falseAlarms: NOT_MEASURED, seconds: NOT_MEASURED });
    expect(slide.complete).toBe(false);
    expect(JSON.stringify(slide)).not.toMatch(/NaN|undefined|null/);
  });
  it('is complete once the headline pair is measured for both detectors', () => {
    const slide = resultsSlide(results({ realCallDetectionRate: 0.62, hardNegativeFalseAlarmRate: 0.0455, medianDetectionSeconds: 3.37 }));
    expect(slide.complete).toBe(true);
    expect(slide.headline[0].retrieval).toBe('62.0%');
    expect(slide.table[0].seconds).toBe('3.4 s');
  });
  it('carries one honesty line naming synthetic training data and both test-set sizes', () => {
    const { honesty } = resultsSlide(results());
    expect(honesty).toMatch(/synthetic/i);
    expect(honesty).toContain('859');
    expect(honesty).toContain('44');
    expect(honesty.split(/(?<=\.)\s/).length).toBe(1);
  });
  it('gives an outsider a one-sentence reading of the numbers', () => {
    expect(resultsSlide(results()).takeaway).toBe('The baseline catches about 5 of every 100 real scam calls; Nemotron + retrieval is not measured yet.');
    expect(resultsSlide(results({ realCallDetectionRate: 0.62, hardNegativeFalseAlarmRate: 0.0455 })).takeaway)
      .toBe('Nemotron + retrieval catches about 62 of every 100 real scam calls (baseline: 5), with 5 false alarms per 100 urgent legit calls (baseline: 0).');
  });
  it('says plainly when not even the baseline is measured', () => {
    const r = results();
    r.detectors.baseline = { ...empty };
    expect(resultsSlide(r).takeaway).toBe('Neither the baseline nor Nemotron + retrieval is measured yet.');
  });
  it('rejects results that would put an invented or impossible number on stage', () => {
    expect(() => parseStageResults({ ...results(), realCalls: { n: 0 } })).toThrow();
    expect(() => parseStageResults({ ...results(), detectors: { ...results().detectors, baseline: { ...empty, realCallDetectionRate: 1.4 } } })).toThrow();
    expect(() => parseStageResults({ ...results(), detectors: { ...results().detectors, nemotron: { ...empty, syntheticF1: '0.9' } } })).toThrow();
    expect(() => parseStageResults({ ...results(), detectors: { baseline: results().detectors.baseline } })).toThrow();
  });
  it('ships a results file that passes validation', () => {
    expect(() => parseStageResults(shipped)).not.toThrow();
  });
});
