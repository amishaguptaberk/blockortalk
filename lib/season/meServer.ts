import { createMeHandlers } from './me.ts';
import { createAnalysisStore } from './analysisStore.ts';
import { createAnalysisRefresher } from './refresh.ts';
import { createNemotronAnalystLlm, createPlayerAnalyst } from './analyst.ts';
import { scenarios } from './scenarios/server.ts';
import { createFinishedCallReader } from './finishedCalls.ts';
import { currentPlayer } from '../players/routes.ts';
import { playerStore } from '../players/store.ts';

/**
 * /me and the analysis refresher read the same finished `calls` rows the Season
 * engine writes. A missing database leaves the page signed out.
 */
const publicScenarios = scenarios.map(({ id, category, tactic }) => ({ id, category, tactic }));

function readers(env: Record<string, string | undefined>) {
  const url = env.DATABASE_URL ?? '';
  return {
    async getPlayerId(request: Request) {
      if (!url) return null;
      return (await currentPlayer(request, playerStore(url)))?.id ?? null;
    },
    loadCalls: createFinishedCallReader(url),
  };
}

export function meHandlers(env = process.env) {
  const { getPlayerId, loadCalls } = readers(env);
  return createMeHandlers({ getPlayerId, loadCalls, scenarios: publicScenarios, store: createAnalysisStore(env.DATABASE_URL ?? '') });
}

/** For the finished-call hook: `await refreshPlayerAnalysis(playerId)` after every committed verdict. */
export function refreshPlayerAnalysis(playerId: string, env = process.env) {
  return createAnalysisRefresher({
    loadCalls: readers(env).loadCalls, scenarios: publicScenarios, store: createAnalysisStore(env.DATABASE_URL ?? ''),
    analyst: createPlayerAnalyst(createNemotronAnalystLlm(env)),
  })(playerId);
}
