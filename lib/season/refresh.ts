/**
 * Rewrites a Player's stored analysis. The BS-07 finished-call hook calls the function this
 * returns after every finished call, practice included. It never throws: a failing model or
 * database must not fail the call that triggered it.
 */
import { playerAnalysis, type CallRow, type Scenario } from './analysis.ts';
import type { AnalystSource, Sentences, UnlockedAnalysis, createPlayerAnalyst } from './analyst.ts';

export type AnalysisRecord = {
  finished: number;
  /** The code-computed counts the sentences were written around. */
  counts: UnlockedAnalysis;
  sentences: Sentences;
  tryNext: string | null;
  source: AnalystSource;
};

export interface AnalysisStore {
  get(playerId: string): Promise<AnalysisRecord | null>;
  /** Must not replace a record that covers more finished calls than this one. */
  save(playerId: string, record: AnalysisRecord): Promise<void>;
}

export interface RefresherDeps {
  loadCalls(playerId: string): Promise<CallRow[]>;
  scenarios: readonly Scenario[];
  analyst: ReturnType<typeof createPlayerAnalyst>;
  store: AnalysisStore;
}

export function recordOf(analysis: UnlockedAnalysis, written: { sentences: Sentences; source: AnalystSource }): AnalysisRecord {
  return { finished: analysis.finished, counts: analysis, sentences: written.sentences, tryNext: analysis.tryNext, source: written.source };
}

/** Resolves true when an analysis was stored, false when locked or on any failure. */
export function createAnalysisRefresher(deps: RefresherDeps) {
  return async (playerId: string): Promise<boolean> => {
    try {
      const analysis = playerAnalysis(await deps.loadCalls(playerId), deps.scenarios);
      if (analysis.locked) return false;
      await deps.store.save(playerId, recordOf(analysis, await deps.analyst(analysis)));
      return true;
    } catch {
      return false;
    }
  };
}
