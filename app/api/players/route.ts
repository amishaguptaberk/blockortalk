import { createPlayerHandlers } from '../../../lib/players/routes';
import { playerStore } from '../../../lib/players/store';

export const dynamic = 'force-dynamic';
function handlers() {
  const url = process.env.DATABASE_URL;
  return url ? createPlayerHandlers({ store: playerStore(url) }) : null;
}
function unavailable() {
  return Response.json({ error: 'Sign-in is unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(request: Request) { return handlers()?.GET(request) ?? unavailable(); }
export async function POST(request: Request) { return handlers()?.POST(request) ?? unavailable(); }
