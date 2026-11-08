import type { PlayModel } from './types';
export function createPlayRoute(deps: { currentPlayer: (request: Request) => Promise<{ id: string } | null>; read: (playerId: string) => Promise<PlayModel> }) {
  return async (request: Request) => {
    try {
      const player = await deps.currentPlayer(request);
      if (!player) return Response.json({ error: 'Sign up to play.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      return Response.json(await deps.read(player.id), { headers: { 'Cache-Control': 'no-store' } });
    } catch { return Response.json({ error: 'Play is unavailable. Please try again shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
  };
}
