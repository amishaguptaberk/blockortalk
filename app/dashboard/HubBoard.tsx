'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { moveLabel, placeLabel, podiumOrder, seasonClock, seasonClockLabel, standingLine, type PublicRank } from '../../lib/season/standing';

type Board = {
  season: { name: string; endsAt: string; status: string; prizes: { place: number; prize: string }[] };
  final: boolean;
  leaderboard: PublicRank[];
  ownRank: PublicRank | null;
  claimEligible: boolean;
};

function changedRanks(previous: Map<string, number>, ranks: PublicRank[]) {
  const moves: Record<string, number> = {};
  for (const rank of ranks) {
    const was = previous.get(rank.nickname);
    if (was != null && was !== rank.rank) moves[rank.nickname] = was - rank.rank;
  }
  return moves;
}

/** The Season board, drawn in the practice-home cards. */
export function HubStandings({ board, remaining, moves }: { board: Board; remaining: number; moves: Record<string, number> }) {
  const you = board.ownRank?.nickname;
  const steps = podiumOrder(board.leaderboard);
  const lead = board.leaderboard[0]?.blokbuks ?? 0;
  const meter = (amount: number) => lead > 0 ? Math.min(1, Math.max(0, amount / lead)) : 0;
  const phase = board.final ? 'Final' : board.season.status === 'upcoming' ? 'Starts soon' : 'Live';
  const line = standingLine(board.leaderboard, board.ownRank, board.final);
  return <section className="hub-standings" id="standings" aria-labelledby="standings-title">
    <div className="hub-standings-head">
      <div>
        <p><span className="hub-chip">{board.season.name} · {phase}</span></p>
        <h2 id="standings-title">Who&apos;s ahead.</h2>
        {line && <p>{line}</p>}
      </div>
      {!board.final && <p className="hub-standings-clock" role="timer" aria-label={`Time until Season ends, ${seasonClockLabel(remaining)}`}>{seasonClock(remaining)}</p>}
      {board.final && <p>The Season has ended. Scores are final.</p>}
    </div>
    {steps.length > 0 && <ol className="hub-podium" data-count={steps.length} aria-hidden="true">
      {steps.map(rank => {
        const prize = board.season.prizes.find(item => item.place === rank.rank)?.prize;
        return <li key={rank.nickname} className={rank.rank === 1 ? 'hub-card is-first' : 'hub-card'}>
          <p className="hub-place">{placeLabel(rank.rank)}</p>
          <h3 className="hub-name">{rank.nickname}{rank.nickname === you ? ' · You' : ''}</h3>
          <p className="hub-score"><span className="ui-sr-only">Blokbuks </span><span aria-hidden="true">B </span>{rank.blokbuks.toLocaleString('en-US')}</p>
          {prize && <p>{prize}</p>}
          <span className="hub-meter"><span style={{ transform: `scaleX(${meter(rank.blokbuks)})` }} /></span>
        </li>;
      })}
    </ol>}
    <div className="hub-standings-list">
      <p className="hub-standings-order">Order: Blokbuks, then accuracy, then who reached the score first.</p>
      {board.leaderboard.length ? <div className="hub-standings-scroll"><ol>
        {board.leaderboard.map(rank => {
          const climbed = moveLabel(moves[rank.nickname] ?? 0);
          const isYou = rank.nickname === you;
          return <li key={rank.nickname} className={isYou ? 'hub-rank-row is-you' : 'hub-rank-row'}>
            <span>{rank.rank}</span>
            <span>{rank.nickname}{isYou ? ' · You' : ''}{climbed && <span className="hub-move">{climbed}</span>}</span>
            <strong><span className="ui-sr-only">Blokbuks </span><span aria-hidden="true">B </span>{rank.blokbuks.toLocaleString('en-US')}</strong>
          </li>;
        })}
      </ol></div> : <p>No Players yet. Be the first to join.</p>}
      {board.claimEligible && <a className="hub-link" href="/leaderboard/claim">Claim your prize ↗</a>}
    </div>
  </section>;
}

export default function HubBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [offset, setOffset] = useState(0);
  const [moves, setMoves] = useState<Record<string, number>>({});
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const baseline = useRef<Map<string, number> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/season', { cache: 'no-store' });
      const value = await response.json() as Board & { error?: string };
      if (!response.ok) throw new Error(value.error || 'The Leaderboard is unavailable.');
      if (!active.current) return;
      const ranks = value.ownRank ? [...value.leaderboard, value.ownRank] : value.leaderboard;
      const serverDate = response.headers.get('date');
      const nextOffset = serverDate ? Date.parse(serverDate) - Date.now() : 0;
      if (!baseline.current) baseline.current = new Map(ranks.map(rank => [rank.nickname, rank.rank]));
      else setMoves(changedRanks(baseline.current, ranks));
      setBoard(value); setError('');
      if (serverDate) setOffset(nextOffset);
      setRemaining(Math.max(0, Math.ceil((Date.parse(value.season.endsAt) - Date.now() - nextOffset) / 1000)));
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Please try again.'); }
  }, []);

  useEffect(() => {
    active.current = true;
    void refresh();
    const interval = setInterval(refresh, 10000);
    return () => { active.current = false; clearInterval(interval); };
  }, [refresh, attempt]);

  useEffect(() => {
    if (!board) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(board.season.endsAt) - Date.now() - offset) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [board, offset]);

  if (error) return <section className="hub-standings" id="standings" aria-labelledby="standings-title"><h2 id="standings-title">Who&apos;s ahead.</h2><p role="alert">{error} <button className="hub-link" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></p></section>;
  if (!board) return <section className="hub-standings" id="standings" aria-labelledby="standings-title"><h2 id="standings-title">Who&apos;s ahead.</h2><p role="status">Loading the Leaderboard…</p></section>;
  return <HubStandings board={board} remaining={remaining} moves={moves} />;
}
