import { createNemotronClient } from '../../debrief/index.mjs';
import { createPracticeSpeech } from '../../practice/speech';
import { createScenarioStore } from '../scenarios/server';
import { createScenarioCorpus } from '../scenarios/corpus';
import { createCallStore, readCurrentSeason, withCallDatabase } from './store';
import { CallError, createCallService, type FinishCall } from './service';
import { createCallPlanner } from './planner';
import { createCallHandlers } from './routes';
import { currentPlayer } from '../../players/routes';
import { playerStore } from '../../players/store';
import { createTransactionalFinalizer } from './finalizer';
import { createFinishedCallReader } from '../finishedCalls';
import { refreshPlayerAnalysis } from '../meServer';

export async function authenticatePlayer(request: Request, connectionString = process.env.DATABASE_URL ?? '', at = new Date()): Promise<string | null> {
  // Keep the UI helper stable while sharing the canonical session implementation.
  if (!connectionString && /(?:^|;\s*)tell_player=[a-f0-9]{64}(?:;|$)/.test(request.headers.get('cookie') ?? '')) {
    throw new CallError(503, 'Calls are unavailable. Please try again.');
  }
  return (await currentPlayer(request, playerStore(connectionString), at.getTime()))?.id ?? null;
}
export async function currentSeason(connectionString = process.env.DATABASE_URL ?? '', at = new Date()) {
  return withCallDatabase(connectionString, client => readCurrentSeason(client, at));
}
export function createProductionCallHandlers(env = process.env, finishCall: FinishCall = createTransactionalFinalizer(env)) {
  const connectionString = env.DATABASE_URL ?? '';
  const scenarios = createScenarioStore(connectionString);
  const corpus = createScenarioCorpus(connectionString);
  const readFinished = createFinishedCallReader(connectionString);
  const service = createCallService({ store: createCallStore(connectionString, () => new Date()), scenario: scenarios.get,
    plan: createCallPlanner({ examples: corpus.examples, model: createNemotronClient(env) }), finishCall,
    finished: readFinished, onFinished: playerId => refreshPlayerAnalysis(playerId, env) });
  return createCallHandlers({ service, authenticate: request => authenticatePlayer(request, connectionString), speech: createPracticeSpeech(env) });
}
