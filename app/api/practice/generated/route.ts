import { createPracticeService, practiceView } from '../../../../lib/practice/service.ts';
import { createPracticeSpeech } from '../../../../lib/practice/speech.ts';
import { PracticeError } from '../../../../lib/practice/nvidia.ts';
import type { Action } from '../../../../lib/practice/types.ts';
import { DISCLOSURE } from '../../../../lib/challenge/recruiter.ts';

export const dynamic = 'force-dynamic';
const COOKIE = 'tell_practice';
const service = () => createPracticeService({ connectionString: process.env.DATABASE_URL || '' });
function session(request: Request) {
  const id = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? id : undefined;
}
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
function failure(error: unknown) {
  if (error instanceof PracticeError) return json({ error: error.message }, error.status);
  console.error('Practice request failed', error instanceof Error ? error.name : 'unknown error');
  return json({ error: 'Practice is unavailable. Please try again.' }, 503);
}
export async function GET(request: Request) {
  try { const id = session(request); return json({ practice: id ? practiceView(await service().get(id)) : null }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Use the practice page for this action.' }, 403);
    const id = session(request);
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      if (!id) return json({ error: 'Start a practice call first.' }, 401);
      if (Number(request.headers.get('content-length') || 0) > 5_100_000) return json({ error: 'Record a shorter reply.' }, 413);
      const day = await service().get(id);
      if (day.phase !== 'call') return json({ error: 'This call has ended.' }, 409);
      const file = (await request.formData()).get('audio');
      if (!(file instanceof File)) return json({ error: 'An audio reply is required.' }, 400);
      return json({ text: await createPracticeSpeech().transcribe(file) });
    }
    const raw = await request.text();
    if (raw.length > 2000) return json({ error: 'Use a shorter reply.' }, 413);
    let action;
    try { action = JSON.parse(raw); } catch { return json({ error: 'Invalid action.' }, 400); }
    if (action?.type === 'start') {
      const day = await service().start(action.theme);
      const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
      return json({ practice: practiceView(day) }, 201, { 'Set-Cookie': `${COOKIE}=${day.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}` });
    }
    if (!id) return json({ error: 'Start a practice call first.' }, 401);
    if (action?.type === 'speech') {
      const day = await service().get(id);
      const text = [...day.turns].reverse().find(t => t.role === 'assistant')?.text;
      if (!text) return json({ error: 'No caller line is available.' }, 409);
      return await createPracticeSpeech().speak(`${day.turns.length === 1 ? `${DISCLOSURE} ` : ''}${text}`);
    }
    const valid = action?.type === 'end' || (action?.type === 'reply' && typeof action.text === 'string') ||
      (action?.type === 'verdict' && ['scam', 'legit', 'unverified'].includes(action.verdict));
    if (!valid) return json({ error: 'Invalid action.' }, 400);
    return json({ practice: practiceView(await service().act(id, action as Action)) });
  } catch (error) { return failure(error); }
}
