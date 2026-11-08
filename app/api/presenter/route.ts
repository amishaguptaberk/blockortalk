import { after } from 'next/server';
import { createChallengeService } from '../../../lib/challenge/service.ts';
import { createRiskService } from '../../../lib/challenge/risk.ts';
import { createRetrievalDetector } from '../../../lib/challenge/detector.ts';
import { createPresenterHandlers } from '../../../lib/challenge/presenter.ts';

export const dynamic = 'force-dynamic';
function risk() {
  if (!process.env.DATABASE_URL) throw new Error('Presenter database not configured');
  return createRiskService({ connectionString: process.env.DATABASE_URL, detect: createRetrievalDetector(process.env) });
}
const handlers = createPresenterHandlers({
  service: () => createChallengeService({ connectionString: process.env.DATABASE_URL ?? '', reply: async ({ options }) => options[0] }),
  risk,
  scheduleRisk: id => after(() => risk().score(id).catch(() => { console.warn('Background detection unavailable'); })),
});
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
