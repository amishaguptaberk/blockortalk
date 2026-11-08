/**
 * The results screen after each call (BS-11). Pure and browser-safe: it turns a finished call into
 * the screen's sections, in the agreed order (docs/BLOKBUKS_SEASON.md), and nothing else.
 * Blokbuks and right/wrong come from the stored result (BS-07); this module only words them.
 */
import { rankScores, type Score } from './routes';

/** The parts of a stored call the results screen reads. */
export interface FinishedCallView {
  id: string;
  playerId: string;
  seasonId: string | null;
  scenario: { id: string; category: string; org: string };
  version: 'real' | 'scam';
  phase: 'call' | 'verdict' | 'complete';
  scored: boolean;
  callsLeft: number;
  verdict?: 'Real' | 'Scam' | 'Unverified';
  replies: { step: number; text: string }[];
  result?: {
    callId: string;
    moments: Array<{ n: number; kind: 'reply' | 'verdict'; step?: number; verdict?: string; right: boolean; why: string } & Record<string, unknown>>;
    right: number;
    wrong: number;
    delta: number;
    scoredBy: 'agent' | 'rules';
    outcome: string;
    total: number | null;
  };
}

export interface ResultMoment {
  n: number;
  label: string;
  words: string;
  right: boolean;
  mark: '✓' | '✗';
  status: 'Right' | 'Wrong';
  why: string;
}

export interface ResultsView {
  callId: string;
  scenarioId: string;
  heading: string;
  headline: string;
  moments: ResultMoment[];
  summary: string;
  blokbuks: { text: string; total: number | null };
  rank: string | null;
  scoredByRules: boolean;
  callsLeft: string;
  analysisUnlocked: boolean;
}

export type RankChange = { from: number | null; to: number };

/** Plain words for when each reply happened, keyed by the caller step it answered. */
const STEP_LABEL: Record<number, string> = {
  1: 'When the caller introduced themselves',
  2: 'When the caller gave a detail',
  3: 'When the caller pushed',
  4: 'When the caller asked',
};

function blokbuksText(scored: boolean, delta: number) {
  if (!scored) return 'Practice · 0 B';
  if (delta > 0) return `+${delta.toLocaleString('en-US')} B`;
  if (delta < 0) return `−${Math.abs(delta).toLocaleString('en-US')} B`;
  return '0 B';
}

function rankText(rank: RankChange | null) {
  if (!rank) return null;
  if (rank.from === null) return `#${rank.to}`;
  return rank.from === rank.to ? `#${rank.to} (no change)` : `#${rank.from} → #${rank.to}`;
}

function callsLeftText(left: number) {
  if (left <= 0) return 'No Scored calls left today. Calls are practice until midnight Central Time.';
  return `${left} Scored call${left === 1 ? '' : 's'} left today`;
}

/** Build the results screen for a finished call. Throws if the call has no result yet. */
export function buildResults(call: FinishedCallView, rank: RankChange | null, analysisUnlocked: boolean): ResultsView {
  const result = call.result;
  if (call.phase !== 'complete' || !result) throw new Error('This call has no result yet.');
  const scored = call.scored && result.total !== null;
  const words = (step: number | undefined) => call.replies.find(reply => reply.step === step)?.text ?? '';
  return {
    callId: call.id,
    scenarioId: call.scenario.id,
    heading: `${call.scenario.org} · ${call.scenario.category}`,
    headline: call.version === 'scam' ? 'This was a scam call.' : 'This was a real call.',
    moments: result.moments.map(moment => ({
      n: moment.n,
      label: moment.kind === 'verdict' ? 'Your Verdict' : STEP_LABEL[moment.step ?? 0] ?? 'Your reply',
      words: moment.kind === 'verdict' ? `You said ${moment.verdict ?? call.verdict}.` : words(moment.step),
      right: moment.right,
      mark: moment.right ? '✓' : '✗',
      status: moment.right ? 'Right' : 'Wrong',
      why: moment.why,
    })),
    summary: `${result.right} right · ${result.wrong} wrong`,
    blokbuks: { text: blokbuksText(scored, result.delta), total: scored ? result.total : null },
    rank: rankText(rank),
    scoredByRules: result.scoredBy === 'rules',
    callsLeft: callsLeftText(call.callsLeft),
    analysisUnlocked,
  };
}

/**
 * The Player's rank now, and before this call when it can be known: their previous score is this
 * one minus the call. When the floor at 0 hid the old total, or for practice, only the current rank is known.
 */
export function rankChange(
  scores: readonly Score[],
  playerId: string,
  call: { scored: boolean; delta: number; right: number; wrong: number; total: number | null },
): RankChange | null {
  const now = scores.find(score => score.playerId === playerId);
  if (!now) return null;
  const to = rankScores([...scores]).findIndex(score => score.playerId === playerId) + 1;
  const before = now.blokbuks - call.delta;
  if (!call.scored || call.total === null || now.blokbuks === 0 || before < 0) return { from: null, to };
  const previous = { ...now, blokbuks: before, right: Math.max(0, now.right - call.right), wrong: Math.max(0, now.wrong - call.wrong) };
  const from = rankScores(scores.map(score => (score.playerId === playerId ? previous : score))).findIndex(score => score.playerId === playerId) + 1;
  return { from, to };
}
