import { createTryItHandlers } from '../../../lib/try-it/routes';
import { tryItStore } from '../../../lib/try-it/store';
import { createNemotronReply } from '../../../lib/challenge/nemotron';
import { createRetrievalDetector } from '../../../lib/challenge/detector';
import { createNemotronClient } from '../../../lib/debrief/index.mjs';
import { voiceRoutes } from '../../../lib/voice/server';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const cap = Number(process.env.TRY_IT_DAILY_CAP ?? 1000);
  if (!process.env.DATABASE_URL || !Number.isInteger(cap) || cap < 1) {
    return Response.json({ error: 'Practice is not ready yet. Please come back soon.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return createTryItHandlers({
    secret: process.env.TRY_IT_SECRET ?? '',
    reply: createNemotronReply(),
    revealOptions: { mode: 'auto', llm: createNemotronClient(process.env), detector: createRetrievalDetector(process.env) },
    async voiceToken(callerId) {
      if (process.env.TRY_IT_BROWSER_VOICE !== 'true') {
        return Response.json({ error: 'Browser voice is not ready yet. Please use text.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
      }
      return voiceRoutes().session(new Request(request.url, { method: 'POST', body: JSON.stringify({ callerId }) }));
    },
    ...tryItStore(process.env.DATABASE_URL, cap),
  }).POST(request);
}
