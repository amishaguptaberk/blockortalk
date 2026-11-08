import { trainingContextHandler } from '../../../../../lib/voice/trainingContext.ts';
import { createPracticeCorpus } from '../../../../../lib/practice/corpus.ts';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ callerId: string }> }) {
  const corpus = createPracticeCorpus(process.env.DATABASE_URL || '');
  const handler = trainingContextHandler({ secret: process.env.TELL_TOOL_SECRET || '', load: id => corpus.forCaller(id) });
  return handler(request, (await context.params).callerId);
}
