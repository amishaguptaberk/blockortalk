export type PlaySeason = { id: string; name: string; startsAt: string; endsAt: string; status: 'upcoming' | 'live' | 'ended' };
export type PlayModel = {
  scenarios: { id: string; category: string; org: string }[];
  blokbuks: number;
  scoredCallsLeft: number;
  nextCallScored: boolean;
  season: PlaySeason | null;
  serverNow: string;
  /** The scenario code picked from this player's finished calls. Null until two are finished and one was missed. */
  suggested?: { id: string; category: string } | null;
};
