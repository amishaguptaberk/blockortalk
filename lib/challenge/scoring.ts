// Money and task rules for one Challenge call. The official day and the rewind replay both score
// through these, so a replay can never be judged by different rules than the call it replays.
// Browser-safe: no server imports, so the board can show the same effects it was scored with.
import type { CallerId, Challenge, Rewind, Verdict } from './types.ts';

export type TaskStatus = 'done' | 'open' | 'failed';
export type CallOutcome = { cost: number; task: TaskStatus | null };

/** What leaking a fake secret costs on this call: Ren's gift-card code or Kai's one-time code. */
export function callCost(callerId: CallerId, leaked: readonly string[]) {
  if (callerId === 'onboarding' && leaked.includes('gift_card_code')) return 350;
  if (callerId === 'fraud_team' && leaked.includes('live_code')) return 650;
  return 0;
}

/** Yui's interview is booked by Real, or by Unverified plus a portal check. Scam leaves it open. */
export function interviewBooked(verdict: Verdict | undefined, portalChecked: boolean) {
  return verdict === 'Real' || (verdict === 'Unverified' && portalChecked);
}

/** The Corvanta alert is resolved only by a finished callback, and never once the code was read. */
export function bankResolves(leaked: readonly string[], callbackDone: boolean) {
  return callbackDone && !leaked.includes('live_code');
}

/** The official effect of call `index` on the day: its posted cost and its task as the day now stands. */
export function officialOutcome(day: Challenge, index: number): CallOutcome {
  const call = day.calls[index];
  const task: TaskStatus | null = call.callerId === 'recruiter' ? (day.interview === 'BOOKED' ? 'done' : 'open')
    : call.callerId === 'fraud_team' ? (day.bank === 'RESOLVED' ? 'done' : day.bank === 'FAILED' ? 'failed' : 'open')
    : null;
  return { cost: call.cost, task };
}

/** The replay's effect, scored from the replay's own leaks, verdict and Verify steps. */
export function replayOutcome(rewind: Rewind): CallOutcome {
  const cost = callCost(rewind.callerId, rewind.leaked);
  const checked = (surface: 'portal' | 'callback') => rewind.events.some(event => event.surface === surface);
  const task: TaskStatus | null = rewind.callerId === 'recruiter' ? (interviewBooked(rewind.verdict, checked('portal')) ? 'done' : 'open')
    : rewind.callerId === 'fraud_team' ? (cost ? 'failed' : bankResolves(rewind.leaked, checked('callback')) ? 'done' : 'open')
    : null;
  return { cost, task };
}
