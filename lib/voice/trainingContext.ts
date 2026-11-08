import { sameSecret } from './beats.ts';
import { BEAT_SECRET_HEADER } from './agentConfig.ts';
import { CHALLENGE_CALLER_IDS, type ChallengeCallerId } from './callers.ts';
import type { createPracticeCorpus } from '../practice/corpus.ts';

type Context = Awaited<ReturnType<ReturnType<typeof createPracticeCorpus>['forCaller']>>;

// Only an authenticated ElevenLabs tool can read reference examples and source labels.
export function trainingContextHandler({ secret, load }: {
  secret: string;
  load: (callerId: ChallengeCallerId) => Promise<Context>;
}) {
  return async (request: Request, callerId: string) => {
    if (!secret || !sameSecret(request.headers.get(BEAT_SECRET_HEADER) || '', secret)) return new Response('unauthorized', { status: 401 });
    if (!CHALLENGE_CALLER_IDS.includes(callerId as ChallengeCallerId)) return Response.json({ error: 'Unknown caller.' }, { status: 400 });
    try {
      return Response.json(await load(callerId as ChallengeCallerId), { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ error: 'Training examples unavailable. Follow the assigned script; do not invent references.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}
