import { timingSafeEqual } from "node:crypto";
import { BEAT_SECRET_HEADER } from "./agentConfig";
import { BEATS, type Beat } from "./personas";

export interface BeatEvent {
  conversationId: string;
  beat: Beat;
}

export interface BeatDeps {
  /** Same value as the ElevenLabs workspace secret the `report_beat` tool sends. */
  toolSecret: string;
  /** Drives the code pop-up, risk meter, balance and break-character. */
  onBeat(event: BeatEvent): Promise<void>;
}

export function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// What the agent hears back. Kept neutral so it never changes the persona's script.
const REPLY: Record<Beat, string> = {
  identity_requested: "noted",
  code_requested: "The code has been sent to the player's screen. Do not say it yourself.",
  payment_requested: "noted",
  secret_heard: "noted",
  real_data_heard: "Remind the player to use only the details on their card, then continue.",
  stop_drill: "End the call now.",
};

/** POST handler for the agents' mid-call `report_beat` server tool. */
export function beatHandler(deps: BeatDeps) {
  return async function POST(req: Request): Promise<Response> {
    const given = req.headers.get(BEAT_SECRET_HEADER) ?? "";
    if (!deps.toolSecret || !sameSecret(given, deps.toolSecret)) {
      return new Response("unauthorized", { status: 401 });
    }
    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400 });
    }
    const beat = body?.beat;
    const conversationId = body?.conversation_id;
    if (!BEATS.includes(beat) || typeof conversationId !== "string" || !conversationId) {
      return Response.json({ error: "invalid beat" }, { status: 400 });
    }
    if (body.tell_try_it !== "true") await deps.onBeat({ conversationId, beat });
    return Response.json({ result: REPLY[beat as Beat] });
  };
}
