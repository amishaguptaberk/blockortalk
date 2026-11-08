/**
 * SERVER-ONLY: call types and the reveal for each practice scenario. The browser
 * never imports this; it learns the call type only from the verdict response.
 * Text replies reuse the Challenge's approved lines, so a model can only pick
 * between scripted lines and can never ask for something new.
 */
import { CALLBACK_LINES, CALLERS, CODE_REQUEST_LINES } from "../challenge/scenarios.ts";
import { DISCLOSURE, OPENING, RECRUITER_BEATS } from "../challenge/recruiter.ts";
import type { Reply, Turn } from "../challenge/types.ts";
import { SCENARIOS, type ScenarioId } from "./catalog.ts";
import { leakedSecrets } from "./leaks.ts";

if (typeof window !== "undefined") throw new Error("lib/practice/script.ts is server-only");

export type CallType = "Real" | "Scam" | "Hijacked";
export type Verdict = "Real" | "Scam" | "Unverified";
export interface PracticeTurn { role: "caller" | "you"; text: string }

const REPLY_CAP = 12;

const SCRIPT: Record<ScenarioId, { type: CallType; opening: string; beats: readonly (readonly string[])[]; reveal: string; safest: string }> = {
  recruiter: {
    type: "Real",
    opening: OPENING,
    beats: RECRUITER_BEATS,
    reveal: "Yui was a real recruiter. She confirmed the interview, asked for nothing secret, and pointed you to the candidate portal to check.",
    safest: "Real callers welcome checking. Confirming through the candidate portal is the safe move, and you don't need to hang up on them.",
  },
  onboarding: {
    type: "Scam",
    opening: CALLERS.onboarding.opening,
    beats: CALLERS.onboarding.beats,
    reveal: "Ren was a scammer. Knowing about your interview made the call sound real, but no employer charges a deposit, and gift cards are a payment only scammers ask for.",
    safest: "Refuse to pay or read any gift-card code, and check with Bluebonnet Labs through the candidate portal.",
  },
  fraud_team: {
    type: "Hijacked",
    opening: CALLERS.fraud_team.opening,
    beats: CALLERS.fraud_team.beats,
    reveal: "Kai was a hijacked caller: he knew your real card ending and charge, but he wanted your one-time code. Your bank will never ask for a code on a call.",
    safest: "Don't read the code. Hang up and call Corvanta on the number in your bank app.",
  },
  bank_callback: {
    type: "Real",
    opening: CALLBACK_LINES[0],
    beats: CALLBACK_LINES.slice(1).map(line => [line]),
    reveal: "Aki was the real Corvanta Bank. You called a number you already had, which is the strongest check there is.",
    safest: "Calling back on a number you already have is exactly right.",
  },
};

/** Server-only: who the scenario's caller really is. Used to score history; never sent before a verdict. */
export function callTypeOf(id: ScenarioId): CallType {
  return SCRIPT[id].type;
}

export function isScenarioId(id: unknown): id is ScenarioId {
  return typeof id === "string" && Object.hasOwn(SCRIPT, id);
}

/** Opening lines for a text call: the fixed disclosure, then the caller. */
export function openingTurns(id: ScenarioId): PracticeTurn[] {
  return [{ role: "caller", text: `${DISCLOSURE} ${SCRIPT[id].opening}` }];
}

/** Next scripted line for a text call. Stateless: the beat comes from how many replies the player gave. */
export async function nextLine(id: ScenarioId, turns: PracticeTurn[], reply: Reply): Promise<{ line?: string; ended?: "stop" | "reply_cap" | "script_end"; showCode: boolean }> {
  const yours = turns.filter(t => t.role === "you");
  const last = yours.at(-1)?.text ?? "";
  if (/\bstop\s+drill\b/i.test(last)) return { ended: "stop", showCode: false };
  if (yours.length >= REPLY_CAP) return { ended: "reply_cap", showCode: false };
  const beats = SCRIPT[id].beats;
  if (yours.length > beats.length) return { ended: "script_end", showCode: false };
  const options = beats[Math.min(yours.length - 1, beats.length - 1)]!;
  let line: string = options[0]!;
  if (options.length > 1) {
    const history: Turn[] = turns.map(t => ({ role: t.role === "you" ? "user" : "assistant", text: t.text, at: "" }));
    try {
      const chosen = await reply({ turns: history, options });
      if (options.includes(chosen)) line = chosen;
    } catch { /* the first approved line is used */ }
  }
  const showCode = id === "fraud_team" && CODE_REQUEST_LINES.some(l => l === line);
  return { line, showCode, ...(yours.length === beats.length ? { ended: "script_end" as const } : {}) };
}

/** Grades the call after the verdict. Only the player's own turns are checked for leaks. */
export function reveal(id: ScenarioId, verdict: Verdict, turns: PracticeTurn[]) {
  const s = SCRIPT[id];
  const scenario = SCENARIOS.find(x => x.id === id)!;
  const said = turns.filter(t => t.role === "you").map(t => t.text).join("\n");
  const secrets = [...scenario.protect, ...(scenario.liveCode ? [scenario.liveCode] : [])];
  const leaked = leakedSecrets(said, secrets);
  const judgment = verdict === "Unverified" ? "checked" : (verdict === "Real") === (s.type === "Real") ? "right" : "wrong";
  return { callType: s.type, verdict, judgment, leaked, explanation: s.reveal, safest: s.safest };
}
