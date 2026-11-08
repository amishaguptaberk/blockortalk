// The detective reveal: runs the Debrief agent over each finished call and packages what the screen renders.
import { pickDayRewind, runDebrief, type Step, type Detection, type DebriefResult, type LlmClient, type Transcript } from '../debrief/index.mjs';
import type { Challenge } from './types.ts';
import { PERSONAS, toTranscript } from './debriefAdapter.ts';

export type RevealCall = {
  callerId: Challenge['callerId'];
  persona: DebriefResult['persona'];
  /** Who the caller really was, in words. Built here, so the page's code never carries call-type wording. */
  identity: { label: string; line: string; tone: 'safe' | 'unsafe' };
  turns: Array<Pick<Transcript['turns'][number], 'turn' | 'speaker' | 'text' | 't'>>;
  result: DebriefResult;
  warning?: string;
};
export type RevealPayload = {
  version: 1;
  /** Changes whenever the day's outcome changes (for example the bank callback after the last verdict). */
  signature: string;
  generated_at: string;
  mode: 'auto' | 'fixed';
  calls: RevealCall[];
  rewind: ReturnType<typeof pickDayRewind>;
  summary: { balance: number; interview: Challenge['interview']; bank: Challenge['bank']; money_lost: number };
};

export function identityFor({ name, claimed_org: org, call_type: type }: DebriefResult['persona']) {
  if (type === 'legit') return { label: 'Real caller', tone: 'safe' as const, line: `${name} really was calling for ${org}. Nothing here needed a secret.` };
  if (type === 'scam') return { label: 'Scam', tone: 'unsafe' as const, line: `${name} was not from ${org}. The call was built to get your money.` };
  return { label: 'Hijacked', tone: 'unsafe' as const, line: `${name} knew real details about you but was not ${org}. Knowing your details does not prove who is calling.` };
}

export function revealSignature(day: Challenge) {
  return ['retrieval-v2', day.balance, day.interview, day.bank, day.events.length, ...day.calls.map(call => `${call.verdict}:${call.cost}:${call.turns.length}`)].join('|');
}

/** The reveal only exists once all three calls have verdicts. Before that it would give the callers away. */
export function revealReady(day: Challenge) {
  return day.phase === 'complete' && day.calls.length === 3 && day.calls.every(call => ['Real', 'Scam', 'Unverified'].includes(call.verdict));
}

export async function buildReveal(day: Challenge, { llm = null, detector, mode = 'auto', now = Date.now, onStep }: { llm?: LlmClient | null; detector?: (transcript: Transcript) => Promise<Detection>; mode?: 'auto' | 'fixed'; now?: () => number; onStep?: (step: Step) => void } = {}): Promise<RevealPayload> {
  if (!revealReady(day)) throw new Error('The reveal opens after the third verdict.');
  // The three debriefs are independent, so they run side by side: each is capped at about 8 seconds.
  const calls = await Promise.all(day.calls.map(async (call, index): Promise<RevealCall> => {
    const transcript = toTranscript(day, index);
    if (detector) {
      try { transcript.detection = await detector(transcript); }
      catch { transcript.detection = { source: 'retrieval unavailable', label: null, scam_type: null, confidence: 0, red_flags: [] }; }
    }
    const result = await runDebrief({ persona: PERSONAS[call.callerId], transcript, llm, mode, onStep });
    const missingLeak = call.leaked.some(key => !transcript.recorded_leaks?.some(leak => leak.secret === key));
    // Stored money and task effects are authoritative, including days saved before turn-level leaks.
    result.outcome.money_lost = call.cost;
    result.outcome.balance_change = -call.cost;
    if (result.outcome.task) result.outcome.task.status = call.callerId === 'recruiter'
      ? day.interview === 'BOOKED' ? 'done' : 'open'
      : day.bank === 'RESOLVED' ? 'done' : day.bank === 'FAILED' ? 'failed' : 'open';
    if (missingLeak) {
      result.rules[0] = { ...result.rules[0], status: 'broken', turn: null, evidence: 'A secret was shared. This older saved call has no record of the turn.' };
    }
    return {
      ...(missingLeak ? { warning: 'This older saved call records a secret leak but not its turn. The saved money and task effects are shown.' } : {}),
      callerId: call.callerId,
      persona: result.persona,
      identity: identityFor(result.persona),
      turns: transcript.turns.map(({ turn, speaker, text, t }) => ({ turn, speaker, text, t })),
      result,
    };
  }));
  return {
    version: 1,
    signature: revealSignature(day),
    generated_at: new Date(now()).toISOString(),
    mode,
    calls,
    rewind: pickDayRewind(calls.map(call => call.result)),
    summary: { balance: day.balance, interview: day.interview, bank: day.bank, money_lost: day.calls.reduce((sum, call) => sum + call.cost, 0) },
  };
}
