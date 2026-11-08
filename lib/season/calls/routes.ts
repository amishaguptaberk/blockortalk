import type { CallAction } from './types';
import { CallError, publicCall, type createCallService } from './service';
import { DISCLOSURE_LINE } from '../../voice/disclosure';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function limitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new CallError(413, 'Use a shorter reply.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
export function createCallHandlers(deps: {
  service: ReturnType<typeof createCallService>;
  authenticate(request: Request): Promise<string | null>;
  speech: { speak(text: string): Promise<Response>; transcribe(file: File): Promise<string> };
}) {
  function failure(error: unknown) {
    return error instanceof CallError ? json({ error: error.message }, error.status) : json({ error: 'Calls are unavailable. Please try again, or continue by text.' }, 503);
  }
  async function player(request: Request) {
    const id = await deps.authenticate(request);
    if (!id) throw new CallError(401, 'Sign in to play a call.');
    return id;
  }
  return {
    async GET(request: Request, id: string) {
      try { return json({ call: publicCall(await deps.service.get(await player(request), id)) }); }
      catch (error) { return failure(error); }
    },
    async POST(request: Request, id?: string) {
      try {
        if (request.headers.get('origin') !== new URL(request.url).origin) throw new CallError(403, 'Use the call page for this action.');
        const playerId = await player(request);
        if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
          if (!id) throw new CallError(400, 'Choose a call first.');
          if ((await deps.service.get(playerId, id)).phase !== 'call') throw new CallError(409, 'This call has ended.');
          const body = await limitedBody(request, 5_100_000);
          let form: FormData;
          try { form = await new Request(request.url, { method: 'POST', headers: request.headers, body }).formData(); }
          catch { throw new CallError(400, 'Record an audio reply under 5 MB.'); }
          const file = form.get('audio');
          if (!(file instanceof File) || !file.size || file.size > 5_000_000 || !/^(audio\/|video\/webm)/.test(file.type)) throw new CallError(400, 'Record an audio reply under 5 MB.');
          const text = await deps.speech.transcribe(file);
          if ((await deps.service.get(playerId, id)).phase !== 'call') throw new CallError(409, 'This call has ended.');
          if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new CallError(400, 'Try a shorter reply, or type your reply.');
          return json({ text });
        }
        const bytes = await limitedBody(request, 3000);
        let raw: unknown;
        try { raw = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CallError(400, 'Invalid call action.'); }
        if (!raw || typeof raw !== 'object') throw new CallError(400, 'Invalid call action.');
        const action = raw as Record<string, unknown>;
        if (!id) {
          if (action.type !== 'start' || typeof action.scenarioId !== 'string' || action.scenarioId.length > 100) throw new CallError(400, 'Invalid call action.');
          return json({ call: publicCall(await deps.service.start(playerId, action.scenarioId)) }, 201);
        }
        if (action.type === 'speech') {
          const call = await deps.service.get(playerId, id);
          if (call.phase !== 'call') throw new CallError(409, 'This call has ended.');
          const text = [...call.turns].reverse().find(turn => turn.role === 'caller')?.text;
          if (!text) throw new CallError(409, 'No caller line is available.');
          const response = await deps.speech.speak(`${call.replies.length === 0 ? DISCLOSURE_LINE + ' ' : ''}${text}`);
          if (!response.ok) throw new Error('Speech unavailable');
          return new Response(response.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
        }
        const valid = ['end', 'own-app', 'caller-link'].includes(String(action.type)) ||
          (action.type === 'reply' && typeof action.text === 'string') ||
          (action.type === 'verdict' && ['Real', 'Scam', 'Unverified'].includes(String(action.verdict)));
        if (!valid) throw new CallError(400, 'Invalid call action.');
        return json({ call: publicCall(await deps.service.act(playerId, id, action as CallAction)) });
      } catch (error) { return failure(error); }
    },
  };
}
