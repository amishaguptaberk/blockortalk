import { FAKE_SECRETS } from "../challenge/scenarios.ts";
import { leakedSecrets } from "../practice/leaks.ts";
import {
  DEBRIEF_LINE, LISTENING, PREPARE, type Companion,
} from "./machine.ts";
import { riskyRequest } from "./risky.ts";

const SECRETS = [
  { label: "date of birth", value: FAKE_SECRETS.date_of_birth },
  { label: "home address", value: FAKE_SECRETS.home_address },
  { label: "gift-card code", value: FAKE_SECRETS.gift_card_code },
  { label: "one-time code", value: FAKE_SECRETS.live_code },
  { label: "PIN", value: FAKE_SECRETS.account_pin },
];

export type SessionTurn = { role: "system" | "assistant" | "user"; text: string; at?: string; leaked?: string[] };
export type SessionSnap = {
  phase: "intro" | "call" | "verdict" | "between" | "complete";
  turns: readonly SessionTurn[];
  events: readonly { at: string }[];
  /** True while a reply is still being saved. */
  pending?: boolean;
};

function userLeaked(turn: SessionTurn): boolean {
  return Boolean(turn.leaked?.length) || leakedSecrets(turn.text, SECRETS).length > 0;
}

function debrief(snap: SessionSnap): Companion {
  const spoken = snap.turns.filter(turn => turn.role !== "system");
  const caller = [...spoken].reverse().find(turn => turn.role === "assistant");
  const hit = caller ? riskyRequest(caller.text) : null;
  const leaked = spoken.some(turn => turn.role === "user" && userLeaked(turn));
  const verified = snap.events.length > 0;
  return {
    personality: "debrief",
    state: "debrief",
    pose: "debrief",
    message: DEBRIEF_LINE,
    exchange: hit?.quote ?? caller?.text,
    evidence: hit?.message,
    outcome: leaked
      ? "A fictional secret was shared on this call."
      : verified
        ? "You checked through a source you already have."
        : "The call ended without a check through your own app.",
    skill: leaked
      ? "Missed: never share a code, PIN, or password with a caller."
      : verified
        ? "Demonstrated: check through a source you already have."
        : "Practice this: hang up and use a number you already have.",
  };
}

/** The companion for this practice day. Alert, success, and concern come only from the transcript and verify events. */
export function companionForSession(snap: SessionSnap): Companion {
  if (snap.phase === "intro") {
    return { personality: "planner", state: "planning", pose: "speaking", message: PREPARE };
  }
  if (snap.phase === "between" || snap.phase === "complete") return debrief(snap);
  if (snap.phase === "verdict") {
    return { personality: "detector", state: "thinking", pose: "thinking", message: "The call has ended. Take a moment, then choose." };
  }
  const spoken = snap.turns.filter(turn => turn.role !== "system");
  const last = spoken[spoken.length - 1];
  const lastVerify = snap.events[snap.events.length - 1];
  if (lastVerify && (!last?.at || lastVerify.at >= last.at)) {
    return { personality: "detector", state: "success", pose: "success", message: "You checked through a source you already have." };
  }
  if (last?.role === "user" && userLeaked(last)) {
    return {
      personality: "detector",
      state: "concerned",
      pose: "concerned",
      message: "A fictional secret showed up in that reply. You can still check through your own app.",
    };
  }
  if (snap.pending && last?.role === "user") {
    return { personality: "detector", state: "thinking", pose: "thinking", message: "Saving your reply." };
  }
  if (last?.role === "assistant") {
    const hit = riskyRequest(last.text);
    if (hit) {
      return { personality: "detector", state: "alert", pose: "alert", message: hit.message, evidence: hit.message, exchange: hit.quote };
    }
  }
  return { personality: "detector", state: "listening", pose: "listening", message: LISTENING };
}
