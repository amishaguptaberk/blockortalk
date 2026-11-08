import { scoredCallsLeftToday } from '../../blokbuks/rules';
import { playerAnalysis, TACTICS, type CallRow, type Tactic } from '../analysis';
import type { PlayModel } from './types';
export type SeasonRow = { id: string; name: string; startsAt: string; endsAt: string };
export type CatalogRow = { id: string; category: string; org: string; tactic?: string };
export function createPlayReadModel(deps: {
  now: () => Date; currentSeason: () => Promise<SeasonRow | null>;
  catalog: () => Promise<CatalogRow[]>;
  score: (playerId: string, seasonId: string) => Promise<number>;
  scoredStarts: (playerId: string) => Promise<string[]>;
  finished?: (playerId: string) => Promise<CallRow[]>;
}) {
  return async (playerId: string): Promise<PlayModel> => {
    const now = deps.now(); const season = await deps.currentSeason();
    const [catalog, blokbuks, starts, finished] = await Promise.all([
      deps.catalog(),
      season ? deps.score(playerId, season.id) : Promise.resolve(0),
      deps.scoredStarts(playerId),
      deps.finished ? deps.finished(playerId).catch(() => [] as CallRow[]) : Promise.resolve([] as CallRow[]),
    ]);
    const scoredCallsLeft = scoredCallsLeftToday(starts, now);
    const status = season ? now < new Date(season.startsAt) ? 'upcoming' : now >= new Date(season.endsAt) ? 'ended' : 'live' : null;
    const known = catalog.flatMap(row => TACTICS.includes(row.tactic as Tactic) ? [{ id: row.id, category: row.category, tactic: row.tactic as Tactic }] : []);
    const analysis = playerAnalysis(finished, known);
    const next = analysis.locked ? null : known.find(row => row.id === analysis.tryNext);
    return {
      scenarios: catalog.map(({ id, category, org }) => ({ id, category, org })),
      blokbuks, scoredCallsLeft, nextCallScored: status === 'live' && scoredCallsLeft > 0,
      season: season && { ...season, status: status! }, serverNow: now.toISOString(),
      suggested: next ? { id: next.id, category: next.category } : null,
    };
  };
}
