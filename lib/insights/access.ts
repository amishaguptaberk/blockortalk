/**
 * Access to /insights is one shared password, typed once. The cookie holds an HMAC of the password,
 * never the password itself. An empty password never matches.
 */
/** The Carrier insights password. It lives in the public repo, so it only keeps out casual visitors; the page shows anonymous totals only (ADR 0002). */
export const INSIGHTS_PASSWORD = 'tmobile';
export const INSIGHTS_COOKIE = 'tell_insights';
export const COOKIE_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

/** Hex HMAC-SHA256 of a fixed message, keyed by the password. Always 64 characters. */
export async function accessToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode('tell-insights-access-v1'));
  return [...new Uint8Array(mac)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Compares equal-length strings without stopping at the first difference. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export function readCookie(request: Request): string | null {
  return request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${INSIGHTS_COOKIE}=([a-f0-9]{64})(?:;|$)`))?.[1] ?? null;
}

export async function isAuthorized(request: Request, password: string | undefined): Promise<boolean> {
  if (!password) return false;
  const given = readCookie(request);
  return given !== null && sameText(given, await accessToken(password));
}

export async function passwordMatches(submitted: string, password: string | undefined): Promise<boolean> {
  if (!password || !submitted) return false;
  return sameText(await accessToken(submitted), await accessToken(password));
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${INSIGHTS_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_SECONDS}; HttpOnly; SameSite=Strict${secure}`;
}
