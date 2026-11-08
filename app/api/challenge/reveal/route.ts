import { createChallengeService, ChallengeError } from '../../../../lib/challenge/service.ts';
import { buildReveal, revealReady, revealSignature } from '../../../../lib/challenge/reveal.ts';
import { createRetrievalDetector } from '../../../../lib/challenge/detector.ts';
import { createNemotronClient } from '../../../../lib/debrief/index.mjs';

export const dynamic = 'force-dynamic';
const COOKIE = 'tell_challenge';
function session(request: Request) {
  const id = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? id : undefined;
}
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * The detective reveal. Only available after the third verdict, so no caller identity or call type
 * can leak earlier. `?mode=fixed` skips Nemotron and runs the fixed sequence of the same tools.
 */
export async function GET(request: Request) {
  try {
    const id = session(request);
    if (!id) return json({ error: 'Start a challenge first.' }, 401);
    if (!process.env.DATABASE_URL) throw new ChallengeError('The challenge database is not configured.', 503);
    const service = createChallengeService({ connectionString: process.env.DATABASE_URL, reply: async ({ options }) => options[0] });
    const day = await service.get(id);
    if (!revealReady(day)) return json({ error: 'The reveal opens after your third verdict.' }, 409);
    if (new URL(request.url).searchParams.get('mode') === 'basic') return json({ reveal: await buildReveal(day, { mode: 'fixed' }) });
    const fixed = new URL(request.url).searchParams.get('mode') === 'fixed';
    // Reuse the saved reveal unless the day changed since (for example the bank callback came after the last verdict).
    if (day.reveal && day.reveal.signature === revealSignature(day) && (!fixed || day.reveal.mode === 'fixed')) return json({ reveal: day.reveal });
    const options = { llm: fixed ? null : createNemotronClient(process.env), mode: fixed ? 'fixed' as const : 'auto' as const, detector: createRetrievalDetector(process.env) };
    if (request.headers.get('accept') === 'application/x-ndjson') {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({ async start(controller) {
        const send = (value: unknown) => { try { controller.enqueue(encoder.encode(JSON.stringify(value) + '\n')); } catch { /* reader disconnected */ } };
        try {
          send({ phase: 'thinking' });
          const reveal = await buildReveal(day, { ...options, onStep: step => send({ phase: step.tool === 'submit_debrief' ? 'typing' : 'thinking' }) });
          await service.saveReveal(id, reveal);
          send({ reveal });
        } catch { send({ error: 'The report could not be completed. Please try again.' }); }
        finally { try { controller.close(); } catch { /* reader disconnected */ } }
      } });
      return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
    }
    const reveal = await buildReveal(day, options);
    await service.saveReveal(id, reveal);
    return json({ reveal });
  } catch (error) {
    if (error instanceof ChallengeError) return json({ error: error.message }, error.status);
    console.error('Reveal request failed');
    return json({ error: 'The reveal could not be built. Please try again.' }, 503);
  }
}
