// Blokbuks rules (BS-03): code awards Blokbuks; agents only label Moves (docs/adr/0001).
// Pure and browser-safe, so the results screen can show the same table it was scored with.
import { leakedSecrets } from "../practice/leaks.ts";

export const MOVES = ["Probe", "Protect", "Verify", "Disconnect", "Leak", "Comply"] as const;
export type Move = (typeof MOVES)[number];
export type Version = "real" | "scam";
export type Verdict = "Real" | "Scam" | "Unverified";
export type ScoredBy = "agent" | "rules";

export const BLOKBUKS = Object.freeze({
  correctVerdict: 100,
  wrongVerdict: -50,
  protectedSecret: 25,
  verifiedOwnApp: 25,
  leakedSecret: -100,
});

export const DAILY_SCORED_CALLS = 5;
/** Scored calls reset at midnight in this zone. */
export const SEASON_TIME_ZONE = "America/Chicago";

export interface Reply {
  /** The caller step this reply answered (1–4). Replies to steps 2–4 are Scored moments; a Leak always is. */
  step: 1 | 2 | 3 | 4;
  move: Move;
}

export interface FinishedCall {
  version: Version;
  /** False for practice calls: same right and wrong, no Blokbuks. */
  scored: boolean;
  replies: readonly Reply[];
  verdict: Verdict;
  /** The Player opened their own app during the call (a Verify event). */
  verifiedViaOwnApp: boolean;
  scoredBy: ScoredBy;
}

export interface MomentResult {
  n: number;
  kind: "reply" | "verdict";
  step?: Reply["step"];
  move?: Move;
  verdict?: Verdict;
  right: boolean;
  blokbuks: number;
  why: string;
}

export interface CallScore {
  moments: MomentResult[];
  right: number;
  wrong: number;
  /** Blokbuks change for the whole call; 0 for practice. */
  delta: number;
  scoredBy: ScoredBy;
}

type Judged = { right: boolean; blokbuks: number; why: string };

function judgeReply(version: Version, move: Move, verified: boolean): Judged {
  switch (move) {
    case "Leak":
      return { right: false, blokbuks: BLOKBUKS.leakedSecret, why: "A secret left your hands, and no caller ever needs it." };
    case "Protect":
      return { right: true, blokbuks: BLOKBUKS.protectedSecret, why: "You kept your secrets to yourself." };
    case "Verify":
      return { right: true, blokbuks: 0, why: "Checking through a number you already have is the safest move." };
    case "Probe":
      return { right: true, blokbuks: 0, why: "Asking questions costs nothing and shows you're paying attention." };
    case "Comply":
      return version === "real"
        ? { right: true, blokbuks: 0, why: "This caller was real, so going along with a safe next step was fine." }
        : { right: false, blokbuks: 0, why: "Going along with a scam caller gives them the next step." };
    case "Disconnect":
      if (version === "scam") return { right: true, blokbuks: 0, why: "Hanging up on a scam caller ends the pressure." };
      return verified
        ? { right: true, blokbuks: 0, why: "You hung up and then checked through your own app, which is exactly the rule." }
        : { right: false, blokbuks: 0, why: "This caller was real, and hanging up without checking left the task undone." };
  }
}

function judgeVerdict(version: Version, verdict: Verdict, verified: boolean): Judged {
  if (verdict === "Unverified") {
    return verified
      ? { right: true, blokbuks: BLOKBUKS.correctVerdict, why: "You held off and checked through your own app, which settles it." }
      : { right: false, blokbuks: 0, why: "Unverified is never penalized, but checking through your own app would have settled it." };
  }
  const correct = (verdict === "Scam") === (version === "scam");
  if (correct) return { right: true, blokbuks: BLOKBUKS.correctVerdict, why: version === "scam" ? "You spotted the scam." : "You recognized a real caller." };
  return {
    right: false,
    blokbuks: BLOKBUKS.wrongVerdict,
    why: version === "scam" ? "This caller was a scam, and trusting them is how money goes missing." : "This caller was real, and caution alone isn't the same as safety.",
  };
}

/** Score a finished call: per-moment right or wrong with a reason, the totals, and the Blokbuks change. */
export function scoreCall(call: FinishedCall): CallScore {
  const seen = new Set<number>();
  for (const reply of call.replies) {
    if (!MOVES.includes(reply.move)) throw new Error(`Unknown Move: ${String(reply.move)}`);
    if (![1, 2, 3, 4].includes(reply.step)) throw new Error(`Unknown step: ${String(reply.step)}`);
    if (reply.step !== 1 && seen.has(reply.step)) throw new Error(`Step ${reply.step} was scored twice`);
    seen.add(reply.step);
  }
  const pay = (judged: Judged) => ({ ...judged, blokbuks: call.scored ? judged.blokbuks : 0 });
  const moments: MomentResult[] = call.replies
    .filter(reply => reply.step >= 2 || reply.move === "Leak")
    .map((reply, i) => ({ n: i + 1, kind: "reply", step: reply.step, move: reply.move, ...pay(judgeReply(call.version, reply.move, call.verifiedViaOwnApp)) }));
  moments.push({ n: moments.length + 1, kind: "verdict", verdict: call.verdict, ...pay(judgeVerdict(call.version, call.verdict, call.verifiedViaOwnApp)) });
  const ownApp = call.scored && call.verifiedViaOwnApp ? BLOKBUKS.verifiedOwnApp : 0;
  const right = moments.filter(m => m.right).length;
  return {
    moments,
    right,
    wrong: moments.length - right,
    delta: moments.reduce((sum, m) => sum + m.blokbuks, 0) + ownApp,
    scoredBy: call.scoredBy,
  };
}

/** Apply a Blokbuks change to a total. Totals never drop below 0. */
export function applyChange(total: number, delta: number): number {
  return Math.max(0, total + delta);
}

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: SEASON_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day (YYYY-MM-DD) in Central Time that the five-a-day cap counts against. */
export function seasonDay(at: Date | string): string {
  return DAY.format(new Date(at));
}

/** How many Scored calls the Player has left today, given when their Scored calls started. */
export function scoredCallsLeftToday(scoredStarts: readonly (Date | string)[], now: Date): number {
  const today = seasonDay(now);
  const used = scoredStarts.filter(at => seasonDay(at) === today).length;
  return Math.max(0, DAILY_SCORED_CALLS - used);
}

/** Whether the Player's next call today earns or loses Blokbuks. */
export function isNextCallScored(scoredStarts: readonly (Date | string)[], now: Date): boolean {
  return scoredCallsLeftToday(scoredStarts, now) > 0;
}

// "call me back" asks the caller to call again, which verifies nothing.
const VERIFY = /\b(call (?!me\b)(\w+ )?back|number (on|in|from) (my|the) (app|card|statement|bill|website|account)|check (it |this |that )?(in|on|through) (my|the) (own )?(app|account|portal)|verify (this|it|that) myself)\b/i;
const DISCONNECT = /\b(hang(ing)? up|i'?m hanging|good ?bye|bye|end(ing)? (the|this) call|stop drill)\b/i;
const PROTECT = /\b((don'?t|do not|won'?t|will not|never|can'?t|cannot|not going to|not gonna) (share|give|read|send|pay|move|tell)|no thanks?|not comfortable)\b/i;
const STRONG_COMPLY = /\b(go ahead|what do you need|here it is|here you go|i'?ll (pay|send|read|buy|move)|send (me )?the link|the code is)\b/i;
const PROBE = /\?\s*$|^\s*(who|what|why|how|which|where|when|can you|could you|is this)\b/i;
const WEAK_COMPLY = /^\s*(yes|yeah|yep|sure|ok|okay|alright|fine|sounds good|of course)\b/i;

/**
 * The fallback labeler used when the Scorekeeper can't: one Move for one reply.
 * A leak beats everything else, then the safe moves, then going along with the caller.
 */
export function labelByRules(reply: string, secrets: readonly { label: string; value: string }[]): Move {
  if (leakedSecrets(reply, secrets).length) return "Leak";
  if (VERIFY.test(reply)) return "Verify";
  if (DISCONNECT.test(reply)) return "Disconnect";
  if (PROTECT.test(reply)) return "Protect";
  if (STRONG_COMPLY.test(reply)) return "Comply";
  if (PROBE.test(reply)) return "Probe";
  if (WEAK_COMPLY.test(reply)) return "Comply";
  return "Probe";
}
