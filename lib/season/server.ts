import { currentPlayer } from '../players/routes';
import { playerStore } from '../players/store';
import { createSeasonHandlers } from './routes';
import { seasonStore } from './store';

export function seasonHandlers() {
  const url = process.env.DATABASE_URL;
  return url ? createSeasonHandlers({ store: seasonStore(url), player: request => currentPlayer(request, playerStore(url)) }) : null;
}
export function unavailable() {
  return Response.json({ error: 'The Season is unavailable. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
