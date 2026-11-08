import type { StagePlan } from '../stage/plan.ts';

export type PresenterSnapshot = {
  callerName: string; organization: string; phase: 'call' | 'verdict' | 'between' | 'complete';
  risk: number | null; tactics: string[]; scoredTurn: number | null; currentTurn: number | null;
  status: 'waiting' | 'scoring' | 'ready' | 'uncertain' | 'unavailable' | 'rate-limited';
  firstCorrectTurn: number | null; firstCorrectSeconds: number | null;
  /** The live stage fallback plan for the Kai call; 'phone' (Plan A) until the presenter switches. */
  plan: StagePlan;
  /** Taps so far; the presenter sends it back so a retried tap cannot switch twice. */
  planSeq: number;
  series: Array<{ turn: number; at: string; risk: number | null; status: 'pending' | 'scoring' | 'done' | 'unavailable' }>;
};
