import { authenticatePlayer } from '../../../lib/season/calls/server';
import { createPlayRoute } from '../../../lib/season/play/routes';
import { createPlayStore } from '../../../lib/season/play/server';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => createPlayRoute({
  currentPlayer: async request => { const id = await authenticatePlayer(request); return id ? { id } : null; },
  read: createPlayStore(process.env.DATABASE_URL ?? ''),
})(request);
