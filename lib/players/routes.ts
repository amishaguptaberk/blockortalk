import { createHash, randomBytes } from 'node:crypto';

export interface Player { id: string; email: string; nickname: string }
export interface PlayerStore {
  findByEmail(email: string): Promise<Player | null>;
  /** Returns null when another Player already has the nickname. */
  createPlayer(email: string, nickname: string): Promise<Player | null>;
  saveSession(hash: string, player: Player, expires: number): Promise<void>;
  findSession(hash: string, now: number): Promise<Player | null>;
  deleteSession(hash: string): Promise<void>;
}
const COOKIE = 'tell_player';
const SESSION_SECONDS = 30 * 86400;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
function sessionHash(request: Request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)tell_player=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token ? hashToken(token) : null;
}
function json(body: unknown, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
}
function cookie(token: string, seconds: number) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
const publicPlayer = (player: Player | null) => player ? { id: player.id, nickname: player.nickname } : null;

/** Pass the request and a Player store. Missing, unknown and expired sessions return null. */
export async function currentPlayer(request: Request, store: PlayerStore, now = Date.now()): Promise<Player | null> {
  const hash = sessionHash(request);
  return hash ? store.findSession(hash, now) : null;
}

/** Build Player routes with a store and an optional clock for tests. */
export function createPlayerHandlers({ store, now = Date.now }: { store: PlayerStore; now?: () => number }) {
  return {
    async GET(request: Request) {
      try { return json({ player: publicPlayer(await currentPlayer(request, store, now())) }); }
      catch { return json({ error: 'Sign-in is unavailable. Please try again.' }, 503); }
    },
    async POST(request: Request) {
      if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Use the Tell page to sign in.' }, 403);
      try {
        const raw = await request.text();
        if (raw.length > 4096) return json({ error: 'This request is too long.' }, 413);
        let body: Record<string, unknown>;
        try {
          const value: unknown = JSON.parse(raw);
          if (!value || typeof value !== 'object' || Array.isArray(value)) return json({ error: 'Invalid request.' }, 400);
          body = value as Record<string, unknown>;
        } catch { return json({ error: 'Invalid request.' }, 400); }
        if (body.action === 'signout') {
          const hash = sessionHash(request);
          if (hash) await store.deleteSession(hash);
          return json({ player: null }, 200, cookie('', 0));
        }
        if (body.action !== 'signup' && body.action !== 'signin') return json({ error: 'Choose sign up or sign in.' }, 400);
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ errors: { email: 'Enter a valid email address.' } }, 400);
        let player = await store.findByEmail(email);
        if (!player && body.action === 'signin') return json({ errors: { email: 'No Player has this email. Sign up first.' } }, 400);
        if (!player) {
          const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
          const length = [...nickname].length;
          if (length < 3 || length > 20) return json({ errors: { nickname: 'Use 3 to 20 characters.' } }, 400);
          if (/[\p{Cc}\p{Cf}]/u.test(nickname)) return json({ errors: { nickname: 'Use visible characters for your nickname.' } }, 400);
          if (/(fuck|shit|bitch|cunt|nigger|faggot)/i.test(nickname.normalize('NFKC'))) return json({ errors: { nickname: 'Choose a different nickname.' } }, 400);
          player = await store.createPlayer(email, nickname);
          if (!player) return json({ errors: { nickname: 'This nickname is taken. Choose another.' } }, 409);
        }
        const token = randomBytes(32).toString('hex');
        await store.saveSession(hashToken(token), player, now() + SESSION_SECONDS * 1000);
        return json({ player: publicPlayer(player) }, 200, cookie(token, SESSION_SECONDS));
      } catch { return json({ error: 'Sign-in is unavailable. Please try again.' }, 503); }
    },
  };
}
