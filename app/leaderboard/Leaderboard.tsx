'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Season } from '../../lib/season/routes';
import { moveLabel, placeLabel, podiumOrder, seasonClock, seasonClockLabel, standingLine } from '../../lib/season/standing';
import Blokbuks from '../components/Blokbuks';
import { Button, DotFigure } from '../components/ui';
import './season.css';

type Rank = { rank: number; nickname: string; blokbuks: number };
type Board = { season: Season & { status: string }; final: boolean; leaderboard: Rank[]; ownRank: Rank | null; claimEligible: boolean };

function changedRanks(previous: Map<string, number>, ranks: Rank[]) {
  const moves: Record<string, number> = {};
  for (const rank of ranks) {
    const was = previous.get(rank.nickname);
    if (was != null && was !== rank.rank) moves[rank.nickname] = was - rank.rank;
  }
  return moves;
}

export default function Leaderboard({ claim = false, embedded = false }: { claim?: boolean; embedded?: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [offset, setOffset] = useState(0);
  const [moves, setMoves] = useState<Record<string, number>>({});
  const active = useRef(false);
  // Opening ranks for this visit. Later polls compare with these, so a climb stays visible.
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
  }, [refresh]);

  useEffect(() => {
    if (!board) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(board.season.endsAt) - Date.now() - offset) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [board, offset]);

  // Fetch the final board at zero; a failed request stays visible and retries on the regular interval.
  useEffect(() => {
    if (!board || board.final || remaining !== 0 || Date.now() + offset < Date.parse(board.season.endsAt)) return;
    void refresh();
  }, [remaining, board, offset, refresh]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/season/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), adult: form.get('adult') === 'on', usResident: form.get('usResident') === 'on' }) });
      const value = await response.json() as { error?: string; message?: string };
      setMessage(value.message || value.error || 'Please try again.');
    } catch { setMessage('Your request could not be sent. Please try again.'); }
    finally { setSaving(false); }
  }

  const you = board?.ownRank?.nickname;
  const steps = board ? podiumOrder(board.leaderboard) : [];
  const lead = board?.leaderboard[0]?.blokbuks ?? 0;
  const meter = (amount: number) => lead > 0 ? Math.min(1, Math.max(0, amount / lead)) : 0;
  const phase = !board ? '' : board.final ? 'Final' : board.season.status === 'upcoming' ? 'Starts soon' : 'Live';
  const endsAt = board && !board.final ? new Date(board.season.endsAt).toLocaleString('en-US', { timeZone: 'America/Chicago' }) : '';

  const row = (rank: Rank) => {
    const climbed = moveLabel(moves[rank.nickname] ?? 0);
    const isYou = rank.nickname === you;
    return <tr key={rank.nickname} className={isYou ? 'standings-row standings-row--you' : 'standings-row'}>
      <td className="standings-rank">{rank.rank}</td>
      <th scope="row">{rank.nickname}{isYou ? ' · You' : ''}{climbed && <span className="standings-move">{climbed}</span>}</th>
      <td><Blokbuks amount={rank.blokbuks} /></td>
    </tr>;
  };

  const Root = embedded ? 'section' : 'main';
  return <Root className="season-page" aria-label={embedded ? 'Season leaderboard' : undefined}>
    <header>
      <p className="season-eyebrow">National Leaderboard · {board?.season.name || 'Season 1'}{phase && <span className="ui-pill">{phase}</span>}</p>
      {!embedded && <h1>{claim ? 'Claim your prize' : 'Good judgment adds up.'}</h1>}
      {!embedded && <p>Practice spotting scam calls. Earn Blokbuks with each Scored call.</p>}
    </header>
    {error && <p role="alert" className="season-notice">{error} <a href="/leaderboard">Try again</a></p>}
    {!board && !error && <p role="status">Loading the Leaderboard…</p>}
    {board && <>
      <section className="season-summary" aria-label="Season status">
        <div>
          <h2>{board.final ? 'Final Leaderboard' : remaining === 0 ? 'Waiting for final results' : board.season.status === 'upcoming' ? 'Season starts soon' : 'Season ends in'}</h2>
          {!board.final && <p className="season-countdown" role="timer" aria-label={`Time until Season ends, ${seasonClockLabel(remaining)}`}><DotFigure size="clamp(48px, 8vw, 88px)">{seasonClock(remaining)}</DotFigure></p>}
          <p>{board.final ? 'The Season has ended. Scores are final.' : `Ends ${endsAt} CT`}</p>
        </div>
        <div>
          <h2>Season prizes</h2>
          <ol>{board.season.prizes.map(prize => <li key={prize.place}><span className="standings-prize-place">{placeLabel(prize.place)}</span> {prize.prize}</li>)}</ol>
          <p>provided by sponsor · rules apply</p>
        </div>
      </section>
      {claim ? <section aria-label="Prize claim">
        {board.claimEligible ? <><h2>Confirm your details</h2><p>This is a claim request. The sponsor must verify your email and approve the prize.</p>
          <form className="season-claim" onSubmit={submit}>
            <label htmlFor="claim-email">Confirm your profile email</label><input id="claim-email" name="email" type="email" autoComplete="email" maxLength={254} required />
            <label><input type="checkbox" name="adult" required /> I am 18 or older.</label>
            <label><input type="checkbox" name="usResident" required /> I am a US resident.</label>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Sending…' : 'Send claim request'}</Button>
          </form><p role="status">{message}</p></> : <p>Claims are open only to the final top three Players. Sign in with your Player profile after the Season ends.</p>}
      </section> : <>
        {board.ownRank ? <YourRank board={board} move={moveLabel(moves[board.ownRank.nickname] ?? 0)} /> : <p className="season-notice">No rank yet. <a href="/play">Play a Scored call</a> to join the Leaderboard.</p>}
        {steps.length > 0 && <ol className="standings-podium" data-count={steps.length} aria-hidden="true">
          {steps.map((rank, index) => {
            const prize = board.season.prizes.find(item => item.place === rank.rank)?.prize;
            return <li key={rank.nickname} className={rank.rank === 1 ? 'standings-step standings-step--first' : 'standings-step'} style={{ '--i': index } as CSSProperties}>
              <p className="standings-place">{placeLabel(rank.rank)}</p>
              <p className="standings-name">{rank.nickname}{rank.nickname === you ? ' · You' : ''}</p>
              <p className="standings-score"><Blokbuks amount={rank.blokbuks} /></p>
              {prize && <p className="standings-prize">{prize}</p>}
              <span className="standings-meter"><span style={{ transform: `scaleX(${meter(rank.blokbuks)})` }} /></span>
            </li>;
          })}
        </ol>}
        <h2>Top 100 Players</h2>
        <p>Order: Blokbuks, then accuracy, then who reached the score first.</p>
        {board.leaderboard.length ? <table className="standings-table"><caption className="ui-sr-only">National Leaderboard</caption><thead><tr><th scope="col">Rank</th><th scope="col">Nickname</th><th scope="col">Blokbuks</th></tr></thead><tbody>{board.leaderboard.map(row)}</tbody></table> : <p>No Players yet. Be the first to join.</p>}
      </>}
    </>}
  </Root>;
}

function YourRank({ board, move }: { board: Board; move: string | null }) {
  const own = board.ownRank;
  if (!own) return null;
  const playable = board.season.status === 'live';
  return <section className="standings-you" aria-label="Your rank">
    <p className="standings-place">{placeLabel(own.rank)}</p>
    <div>
      <p className="standings-kicker">Your rank</p>
      <p className="standings-you-score"><Blokbuks amount={own.blokbuks} />{move && <span className="standings-move">{move}</span>}</p>
      <p>{standingLine(board.leaderboard, own, board.final)}</p>
      {(playable || board.claimEligible) && <p className="standings-actions">
        {playable && <a className="ui-button ui-button--primary" href="/play">Play a Scored call</a>}
        {board.claimEligible && <a className="ui-button" href="/leaderboard/claim">Claim your prize</a>}
      </p>}
    </div>
  </section>;
}
