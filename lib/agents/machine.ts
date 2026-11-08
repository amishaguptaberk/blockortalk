import type { Folder, Personality } from "../sprites.mjs";
import { riskyRequest, type RiskHit } from "./risky.ts";

/** The one state the companion state machine holds. Exactly one input is on. */
export type AgentState = "planning" | "listening" | "thinking" | "alert" | "success" | "concerned" | "debrief";

export type PracticeEvent =
  | "scenario_loaded"
  | "briefing_started"
  | "briefing_complete"
  | "call_started"
  | "caller_speaking"
  | "user_speaking"
  | "risk_signal_detected"
  | "protective_action_taken"
  | "unsafe_action_taken"
  | "call_ended"
  | "debrief_started"
  | "skill_updated";

/** Drawn pose. Folders come from SPRITES_USAGE.md. Excited and typing stay unused: they read as a bigger reaction than this system wants. */
export type Pose = "idle" | "enter" | "speaking" | "listening" | "thinking" | "alert" | "success" | "concerned" | "debrief";

export type Companion = {
  personality: Personality;
  state: AgentState;
  pose: Pose;
  message: string;
  evidence?: string;
  outcome?: string;
  skill?: string;
  exchange?: string;
};

export const PREPARE = "I'll help you prepare before the call starts.";
export const LISTENING = "I'm listening for risky requests.";
export const DEBRIEF_LINE = "Let's look at the moment that mattered.";

const poseFolderMap: Record<Pose, Folder> = {
  idle: "idle",
  enter: "idle",
  listening: "idle",
  speaking: "talk_standard",
  success: "talk_standard",
  debrief: "talk_standard",
  thinking: "talk_thinking",
  alert: "talk_thinking",
  concerned: "talk_thinking",
};

export function poseFolder(pose: Pose): Folder {
  return poseFolderMap[pose];
}

/** Boolean inputs for the companion state machine. One is true. */
export function stateInputs(state: AgentState): Record<AgentState, boolean> {
  return {
    planning: state === "planning",
    listening: state === "listening",
    thinking: state === "thinking",
    alert: state === "alert",
    success: state === "success",
    concerned: state === "concerned",
    debrief: state === "debrief",
  };
}

export function personalityFor(state: AgentState): Personality {
  if (state === "planning") return "planner";
  if (state === "debrief") return "debrief";
  return "detector";
}

const planner = (pose: Pose, message = PREPARE): Companion => ({ personality: "planner", state: "planning", pose, message });
const detector = (state: AgentState, pose: Pose, message: string, extra: Partial<Companion> = {}): Companion => ({
  personality: "detector", state, pose, message, ...extra,
});

/**
 * Move the companion because a real session event happened.
 * `risk_signal_detected` changes nothing unless `text` is an actual request.
 */
export function applyEvent(current: Companion, event: PracticeEvent, detail?: { text?: string }): Companion {
  switch (event) {
    case "scenario_loaded":
    case "briefing_started":
      return planner("speaking");
    case "briefing_complete":
      return planner("idle");
    case "call_started":
    case "caller_speaking":
    case "user_speaking":
      return detector("listening", "listening", LISTENING);
    case "risk_signal_detected": {
      const hit = detail?.text ? riskyRequest(detail.text) : null;
      if (!hit) return current;
      return detector("alert", "alert", hit.message, { evidence: hit.message, exchange: hit.quote });
    }
    case "protective_action_taken":
      return detector("success", "success", "You checked through a source you already have.");
    case "unsafe_action_taken":
      return detector("concerned", "concerned", "A fictional secret showed up in that reply. You can still check through your own app.");
    case "call_ended":
      return detector("thinking", "thinking", "The call has ended. Take a moment, then choose.");
    case "debrief_started":
    case "skill_updated":
      return {
        personality: "debrief",
        state: "debrief",
        pose: "debrief",
        message: DEBRIEF_LINE,
        outcome: current.outcome,
        skill: current.skill,
        exchange: current.exchange,
        evidence: current.evidence,
      };
    default:
      return current;
  }
}

export function alertFrom(hit: RiskHit): Companion {
  return applyEvent(planner("speaking"), "risk_signal_detected", { text: hit.quote });
}
