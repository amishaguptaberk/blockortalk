import type { Player } from '../players/routes';

export interface Season {
  id: string; name: string; startsAt: string; endsAt: string;
  prizes: { place: number; prize: string }[];
}
export interface Score {
  playerId: string; nickname: string; blokbuks: number; right: number; wrong: number; reachedAt: string;
}
export interface SeasonStore {
  current(): Promise<Season | null>;
  scores(seasonId: string): Promise<Score[]>;
  claim(seasonId: string, playerId: string, email: string, now: number): Promise<boolean>;
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Status and Player rank are shared with the call engine and results screen. */
export function seasonStatus(season: Season, now: number) {
  const status = now >= Date.parse(season.endsAt) ? 'ended' : now < Date.parse(season.startsAt) ? 'upcoming' : 'live';
  return { ...season, status, scoringOpen: status === 'live' };
}

/** Rank the full Season before taking the top 100. A Player ID makes exact ties stable. */
export function rankScores(scores: Score[]) {
  const accuracy = (score: Score) => score.right / (score.right + score.wrong || 1);
  return [...scores].sort((a, b) => b.blokbuks - a.blokbuks || accuracy(b) - accuracy(a)
    || Date.parse(a.reachedAt) - Date.parse(b.reachedAt) || a.playerId.localeCompare(b.playerId));
}

export function createSeasonHandlers({ store, player, now = Date.now }: {
  store: SeasonStore; player(request: Request): Promise<Player | null>; now?: () => number;
}) {
  return {
    async POST(request: Request) {
      if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Use the claim page.' }, 403);
      try {
        const asking = await player(request);
        if (!asking) return json({ error: 'Sign in to claim a prize.' }, 401);
        const season = await store.current();
        if (!season || seasonStatus(season, now()).status !== 'ended') return json({ error: 'Claims open when the Season ends.' }, 409);
        const ranked = rankScores(await store.scores(season.id));
        const index = ranked.findIndex(score => score.playerId === asking.id);
        if (index < 0 || index >= 3) return json({ error: 'Only the final top three Players can claim.' }, 403);
        const raw = await request.text();
        if (raw.length > 4096) return json({ error: 'This request is too long.' }, 413);
        let body: { email?: unknown; adult?: unknown; usResident?: unknown };
        try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
        if (!body || typeof body.email !== 'string' || body.email.trim().toLowerCase() !== asking.email.toLowerCase()
          || body.adult !== true || body.usResident !== true) return json({ error: 'Confirm your profile email, that you are 18 or older, and that you live in the US.' }, 400);
        if (!await store.claim(season.id, asking.id, asking.email, now())) return json({ error: 'The claim could not be recorded. Please try again.' }, 503);
        return json({ message: 'Your request is recorded. The sponsor will be in touch. Email verification and prize approval are still required.' });
      } catch { return json({ error: 'Claims are unavailable. Please try again.' }, 503); }
    },
    async GET(request: Request) {
      try {
        const season = await store.current();
        if (!season) return json({ error: 'No Season is available.' }, 404);
        const status = seasonStatus(season, now());
        const [scores, asking] = await Promise.all([store.scores(season.id), player(request)]);
        const ranked = rankScores(scores);
        const publicRank = (score: Score, index: number) => ({ rank: index + 1, nickname: score.nickname, blokbuks: score.blokbuks });
        const index = ranked.findIndex(score => score.playerId === asking?.id);
        return json({ season: status, final: status.status === 'ended', leaderboard: ranked.slice(0, 100).map(publicRank),
          ownRank: index < 0 ? null : publicRank(ranked[index], index), claimEligible: status.status === 'ended' && index >= 0 && index < 3 });
      } catch { return json({ error: 'The Leaderboard is unavailable. Please try again.' }, 503); }
    },
  };
}
