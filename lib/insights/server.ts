import { createNemotronAnalystLlm } from '../season/analyst';
import { scenarios } from '../season/scenarios/server';
import { createInsightsAnalyst } from './analyst';
import { createInsightsHandlers } from './routes';
import { createInsightsStore } from './store';
import { INSIGHTS_PASSWORD } from './access';

const publicScenarios = scenarios.map(({ id, category, tactic }) => ({ id, category, tactic }));

/** Real wiring for /insights. The password is the fixed INSIGHTS_PASSWORD; DATABASE_URL and NVIDIA_API_KEY stay on the server. */
export function insightsHandlers(env = process.env) {
  return createInsightsHandlers({
    password: INSIGHTS_PASSWORD,
    store: createInsightsStore(env.DATABASE_URL ?? '', publicScenarios),
    analyst: createInsightsAnalyst(createNemotronAnalystLlm(env)),
  });
}
