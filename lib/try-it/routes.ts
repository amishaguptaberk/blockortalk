import { createHash } from 'node:crypto';
import { createChallengeService, ChallengeError, type ChallengeStore } from '../challenge/service';
import { createChallengeHandlers, COOKIE, json, playerView } from '../challenge/routes';
import { buildReveal, revealReady } from '../challenge/reveal';
import type { Challenge, Reply } from '../challenge/types';

export type Outcome = Pick<Challenge, 'balance' | 'interview' | 'bank'>;
export interface TryItDeps {
  secret: string;
  reply: Reply;
  reserve(visitor: string): Promise<'visitor' | 'global' | null>;
  count(id: string, outcome: Outcome): Promise<void>;
  now?: () => number;
  revealOptions?: Parameters<typeof buildReveal>[1];
  voiceToken?: (callerId: Challenge['callerId']) => Promise<Response>;
}

/** State is authenticated and encrypted. It stays in the browser, never in a database row. */
export function createTryItHandlers(deps: TryItDeps) {
  const now = deps.now ?? Date.now;
  const key = crypto.subtle.importKey('raw', new Uint8Array(createHash('sha256').update(deps.secret).digest()), 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function seal(day: Challenge, visitor: string, expires: number) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key, new TextEncoder().encode(JSON.stringify({ day, visitor, expires })));
    return Buffer.concat([iv, new Uint8Array(data)]).toString('base64url');
  }
  async function open(token: string) {
    try {
      const bytes = new Uint8Array(Buffer.from(token, 'base64url'));
      const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await key, bytes.slice(12));
      return JSON.parse(new TextDecoder().decode(data)) as { day: Challenge; visitor: string; expires: number };
    } catch { throw new ChallengeError('This practice day has expired. Start a new day.', 401); }
  }
  return {
    async POST(request: Request) {
      try {
        if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Use the try-it page to play.' }, 403);
        if (deps.secret.length < 32) throw new ChallengeError('Try-it is not configured yet. Please come back soon.', 503);
        const raw = await request.text();
        if (raw.length > 200000) return json({ error: 'This request is too long.' }, 413);
        let body: { action?: { type?: string }; token?: string };
        try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        if (!body?.action || typeof body.action.type !== 'string') return json({ error: 'Choose a practice action.' }, 400);
        const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)tell_visitor=([0-9a-f-]{36})(?:;|$)/)?.[1];
        const visitor = cookie ?? crypto.randomUUID();
        const visitorHash = createHash('sha256').update(deps.secret + visitor).digest('hex');
        let day: Challenge | undefined;
        let expires = now() + 3600000;
        if (body.action.type === 'start') {
          const limit = await deps.reserve(visitorHash);
          if (limit) return json({ error: limit === 'visitor' ? 'You have tried three days this hour. Please come back in an hour.' : 'Today’s practice places are full. Please come back tomorrow.' }, 429, { 'Retry-After': limit === 'visitor' ? '3600' : '86400' });
        } else {
          if (typeof body.token !== 'string') return json({ error: 'Start a practice day first.' }, 401);
          const saved = await open(body.token);
          if (saved.visitor !== visitorHash || saved.expires <= now()) return json({ error: 'This practice day has expired. Start a new day.' }, 401);
          day = saved.day; expires = saved.expires;
        }
        const store: ChallengeStore = {
          async create(value) { day = value; },
          async update(id, work) { if (!day || day.id !== id) throw new ChallengeError('Start a practice day first.', 401); day = await work(day); return day; },
          async saveReveal() { /* Browser state holds the report. */ },
        };
        const service = createChallengeService({ store, trackRisk: false, reply: deps.reply, now });
        const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
        const headers = { 'Set-Cookie': `tell_visitor=${visitor}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${secure}` };
        if (body.action.type === 'voice_token') {
          if (!day || day.phase !== 'call' || !deps.voiceToken) return json({ error: 'Browser voice is unavailable. Please use text.' }, 409);
          return deps.voiceToken(day.callerId);
        }
        if (body.action.type === 'reveal') {
          if (!day || !revealReady(day)) return json({ error: 'Finish all three calls to open the reveal.' }, 409);
          await deps.count(day.id, { balance: day.balance, interview: day.interview, bank: day.bank });
          return json({ reveal: await buildReveal(day, { mode: 'fixed', detector: async () => ({ source: 'retrieval unavailable', label: null, scam_type: null, confidence: 0, red_flags: [] }), ...deps.revealOptions }) }, 200, headers);
        }
        // Reuse the Challenge action validation and scoring without its database storage.
        const response = await createChallengeHandlers(() => service).POST(new Request(request.url, {
          method: 'POST', headers: { origin: new URL(request.url).origin, cookie: `${COOKIE}=${day?.id ?? ''}` }, body: JSON.stringify(body.action),
        }));
        if (!response.ok) return response;
        if (!day) throw new Error('Missing day');
        return json({ day: playerView(day), token: await seal(day, visitorHash, expires) }, response.status, headers);
      } catch (error) {
        if (error instanceof ChallengeError) return json({ error: error.message }, error.status);
        console.error('Try-it request failed', error instanceof Error ? error.name : 'unknown', (error as { code?: string })?.code ?? '');
        return json({ error: 'Practice is unavailable. Please try again shortly.' }, 503);
      }
    },
  };
}
