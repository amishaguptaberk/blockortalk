import { after } from 'next/server';
import { createChallengeService, ChallengeError } from '../../../lib/challenge/service.ts';
import { createNemotronReply } from '../../../lib/challenge/nemotron.ts';
import { createRetrievalDetector } from '../../../lib/challenge/detector.ts';
import { createRiskService } from '../../../lib/challenge/risk.ts';
import { createChallengeHandlers } from '../../../lib/challenge/routes.ts';

export const dynamic = 'force-dynamic';
const handlers = createChallengeHandlers(() => {
  if (!process.env.DATABASE_URL) throw new ChallengeError('The challenge database is not configured.', 503);
  const connectionString = process.env.DATABASE_URL;
  const risk = createRiskService({ connectionString, detect: createRetrievalDetector(process.env) });
  return createChallengeService({ connectionString, reply: createNemotronReply(),
    scheduleRisk: id => after(() => risk.score(id).catch(() => { console.warn('Background detection unavailable'); })) });
});
export const GET = handlers.GET;
export const POST = handlers.POST;
