/**
 * The stage results slide (docs/SPEC.md, "Detection pitch slide"). The numbers come only from
 * data/stage/results.json, copied from a finished evaluation (docs/DETECTION_RESULTS.md).
 * A value that was not measured is shown as not measured: never as zero, never estimated.
 */
export type DetectorResult = {
  syntheticF1: number | null;
  realCallDetectionRate: number | null;
  hardNegativeFalseAlarmRate: number | null;
  medianDetectionSeconds: number | null;
};
export type StageResults = {
  measuredOn: string;
  source: string;
  realCalls: { n: number };
  hardNegatives: { n: number };
  detectors: { baseline: DetectorResult; nemotron: DetectorResult; retrieval: DetectorResult };
};
export const NOT_MEASURED = 'Not measured yet';

const DETECTORS = [['retrieval', 'Nemotron + retrieval'], ['nemotron', 'Nemotron zero-shot'], ['baseline', 'Keyword baseline']] as const;
const RATES = ['syntheticF1', 'realCallDetectionRate', 'hardNegativeFalseAlarmRate'] as const;

function fail(message: string): never { throw new Error(`Invalid stage results: ${message}`); }
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Throws on any shape or value that could put an invented or impossible number on stage. */
export function parseStageResults(value: unknown): StageResults {
  if (!isObject(value)) fail('not an object');
  for (const key of ['measuredOn', 'source'] as const) if (typeof value[key] !== 'string' || !value[key]) fail(`${key} missing`);
  for (const key of ['realCalls', 'hardNegatives'] as const) {
    const n = isObject(value[key]) ? value[key].n : undefined;
    if (!Number.isInteger(n) || (n as number) <= 0) fail(`${key}.n must be a positive integer`);
  }
  if (!isObject(value.detectors)) fail('detectors missing');
  for (const [id] of DETECTORS) {
    const result = value.detectors[id];
    if (!isObject(result)) fail(`${id} missing`);
    for (const key of RATES) {
      const x = result[key];
      if (x !== null && (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1)) fail(`${id}.${key} must be null or within 0–1`);
    }
    const seconds = result.medianDetectionSeconds;
    if (seconds !== null && (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0)) fail(`${id}.medianDetectionSeconds must be null or non-negative`);
  }
  return value as StageResults;
}

const percent = (rate: number | null) => rate === null ? NOT_MEASURED : `${(rate * 100).toFixed(1)}%`;
const per100 = (rate: number) => Math.round(rate * 100);
const f1 = (value: number | null) => value === null ? NOT_MEASURED : value.toFixed(2);
const seconds = (value: number | null) => value === null ? NOT_MEASURED : value < 1 ? `${(value * 1000).toFixed(1)} ms` : `${value.toFixed(1)} s`;

export function resultsSlide(results: StageResults) {
  const { baseline, retrieval } = results.detectors;
  const complete = [retrieval, baseline].every(r => r.realCallDetectionRate !== null && r.hardNegativeFalseAlarmRate !== null);
  const baseCaught = baseline.realCallDetectionRate;
  const takeaway = retrieval.realCallDetectionRate === null || retrieval.hardNegativeFalseAlarmRate === null
    ? baseCaught === null ? 'Neither the baseline nor Nemotron + retrieval is measured yet.'
      : `The baseline catches about ${per100(baseCaught)} of every 100 real scam calls; Nemotron + retrieval is not measured yet.`
    : `Nemotron + retrieval catches about ${per100(retrieval.realCallDetectionRate)} of every 100 real scam calls (baseline: ${baseCaught === null ? NOT_MEASURED : per100(baseCaught)}), with ${per100(retrieval.hardNegativeFalseAlarmRate)} false alarms per 100 urgent legit calls (baseline: ${baseline.hardNegativeFalseAlarmRate === null ? NOT_MEASURED : per100(baseline.hardNegativeFalseAlarmRate)}).`;
  return {
    complete,
    headline: [
      { metric: 'Real scam calls caught', retrieval: percent(retrieval.realCallDetectionRate), baseline: percent(baseline.realCallDetectionRate) },
      { metric: 'False alarms on urgent legit calls', retrieval: percent(retrieval.hardNegativeFalseAlarmRate), baseline: percent(baseline.hardNegativeFalseAlarmRate) },
    ],
    table: DETECTORS.map(([id, detector]) => {
      const r = results.detectors[id];
      return { detector, syntheticF1: f1(r.syntheticF1), realCalls: percent(r.realCallDetectionRate), falseAlarms: percent(r.hardNegativeFalseAlarmRate), seconds: seconds(r.medianDetectionSeconds) };
    }),
    honesty: `Trained on synthetic dialogues only, and tested on ${results.realCalls.n} real scam-call transcripts and just ${results.hardNegatives.n} hard negatives, so treat small differences as noise.`,
    takeaway,
    measuredOn: results.measuredOn,
    source: results.source,
  };
}
