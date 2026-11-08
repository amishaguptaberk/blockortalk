/** Public Leaderboard row. Nicknames only: emails never reach this copy. */
export interface PublicRank { rank: number; nickname: string; blokbuks: number }

/** English ordinal for a place. 11, 12 and 13 stay "th". */
export function placeLabel(rank: number) {
  const n = Math.abs(Math.trunc(rank));
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** Fixed-width clock. Hours grow past 99 instead of wrapping. */
export function seasonClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

/** Spoken form of the same clock, for the timer's accessible name. */
export function seasonClockLabel(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${unit(Math.floor(seconds / 3600), 'hour')}, ${unit(Math.floor((seconds % 3600) / 60), 'minute')}, ${unit(seconds % 60, 'second')}`;
}

/** 2nd, 1st, 3rd, so the leader is centered. Missing steps are dropped. */
export function podiumOrder<T>(rows: readonly T[]): T[] {
  const top = rows.slice(0, 3);
  return [top[1], top[0], top[2]].filter((row): row is T => row != null);
}

function gapSentence(gap: number, nickname: string, trail = '') {
  if (gap <= 0) return `Tied on Blokbuks with ${nickname}. Accuracy and time decide the order.`;
  const amount = `${gap.toLocaleString('en-US')} ${gap === 1 ? 'Blokbuk' : 'Blokbuks'}`;
  return `${amount} behind ${nickname}${trail}.`;
}

/** One sentence for the signed-in Player. Null when they have no rank yet. */
export function standingLine(leaderboard: readonly PublicRank[], own: PublicRank | null, final = false) {
  if (!own) return null;
  if (own.rank === 1) return final ? 'You finished first.' : 'You are leading the Season.';
  const above = leaderboard.find(row => row.rank === own.rank - 1);
  if (above) return gapSentence(above.blokbuks - own.blokbuks, above.nickname);
  const last = leaderboard.at(-1);
  if (!last || own.rank <= last.rank) return null;
  const where = leaderboard.length >= 100 ? 'the last Player in the top 100' : 'the last Player on this Leaderboard';
  return gapSentence(last.blokbuks - own.blokbuks, last.nickname, `, ${where}`);
}

/** Positive means the Player climbed since the previous board. */
export function moveLabel(delta: number) {
  if (delta > 0) return `Up ${delta} ${delta === 1 ? 'place' : 'places'}`;
  if (delta < 0) return `Down ${-delta} ${delta === -1 ? 'place' : 'places'}`;
  return null;
}
