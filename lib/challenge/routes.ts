import { ChallengeError, type createChallengeService } from './service.ts';
import type { Action, Challenge } from './types.ts';

export const COOKIE = 'tell_challenge';
export function session(request: Request) {
  const id = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ? id : undefined;
}
export function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
/** Player responses never include presenter capability, scores or cached reveal. */
export function playerView(day: Challenge | null) {
  if (!day) return day;
  const { reveal: _reveal, risk: _risk, voiceReceived: _voiceReceived, voiceSession: _voiceSession, ...rest } = day;
  return rest;
}
function failure(error: unknown) {
  if (error instanceof ChallengeError) return json({ error: error.message }, error.status);
  console.error('Challenge request failed');
  return json({ error: 'The challenge could not be saved. Please try again.' }, 503);
}

export function createChallengeHandlers(service: () => ReturnType<typeof createChallengeService>) {
  return {
    async GET(request: Request) {
      try {
        const id = session(request);
        if (new URL(request.url).searchParams.has('stage_plan')) return json({ stagePlan: id ? await service().stagePlan(id) ?? null : null });
        return json({ day: id ? playerView(await service().get(id)) : null });
      } catch (error) { return failure(error); }
    },
    async POST(request: Request) {
      try {
        if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Use the challenge page to make this request.' }, 403);
        const raw = await request.text();
        if (raw.length > 40000) return json({ error: 'This reply is too long.' }, 400);
        let action: unknown;
        try { action = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        if (!action || typeof action !== 'object' || !('type' in action)) return json({ error: 'Choose a challenge action.' }, 400);
        if (action.type === 'start') {
          const day = await service().start();
          const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
          return json({ day: playerView(day) }, 201, { 'Set-Cookie': `${COOKIE}=${day.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}` });
        }
        const voice = (action.type === 'voice_turns' || action.type === 'voice_live') && 'turns' in action && Array.isArray(action.turns) && action.turns.length <= 40 && action.turns.every((turn: unknown) => !!turn && typeof turn === 'object' && 'text' in turn && typeof turn.text === 'string' && turn.text.length <= 1000 && 'role' in turn && (turn.role === 'assistant' || turn.role === 'user'));
        const voiceSession = 'sessionId' in action && typeof action.sessionId === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(action.sessionId);
        const live = voiceSession && 'callerId' in action && ['recruiter', 'onboarding', 'fraud_team'].includes(String(action.callerId)) && 'startedAt' in action && typeof action.startedAt === 'string';
        const valid = ['end', 'portal', 'next', 'bank', 'callback_start', 'callback_next',
          'rewind_end', 'rewind_portal', 'rewind_bank', 'rewind_callback_start', 'rewind_callback_next'].includes(String(action.type)) ||
          ((action.type === 'reply' || action.type === 'rewind_reply') && 'text' in action && typeof action.text === 'string' && action.text.length <= 2000) ||
          (action.type === 'rewind_start' && 'callIndex' in action && Number.isInteger(action.callIndex) && 'turn' in action && Number.isInteger(action.turn)) ||
          (action.type === 'rewind_verdict' && 'verdict' in action && typeof action.verdict === 'string' && ['Real', 'Scam', 'Unverified'].includes(action.verdict)) ||
          (voice && (action.type === 'voice_live' ? live : !('sessionId' in action) || voiceSession)) || (action.type === 'voice_start' && live) ||
          (action.type === 'verdict' && 'verdict' in action && typeof action.verdict === 'string' && ['Real', 'Scam', 'Unverified'].includes(action.verdict));
        if (!valid) return json({ error: 'Invalid challenge action.' }, 400);
        const id = session(request);
        if (!id) return json({ error: 'Start a challenge first.' }, 401);
        return json({ day: playerView(await service().act(id, action as Action)) });
      } catch (error) { return failure(error); }
    },
  };
}
