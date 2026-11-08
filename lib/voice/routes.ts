import { redact } from "../policy/redact.ts";
export { redact } from "../policy/redact.ts";
import type { VoiceAdapter } from "./adapter";
import { beatHandler } from "./beats";
import { browserSessionHandler } from "./browserSession";
import type { PostCallTranscript } from "./transcript";
import { postCallWebhookHandler } from "./webhook";

/** A live call event the app reacts to (code pop-up, risk meter, call-failed buttons). */
export interface VoiceEvent {
  id: number;
  conversationId: string;
  kind: string;
  detail?: string;
  at: string;
}

/** Persistence the voice routes need; Postgres in the app, faked in tests. */
export interface VoiceStore {
  /** Idempotent on conversation ID in one atomic write. */
  saveTranscript(t: PostCallTranscript): Promise<"stored" | "duplicate">;
  addEvent(e: Omit<VoiceEvent, "id" | "at">): Promise<void>;
  listEvents(conversationId: string, afterId: number): Promise<VoiceEvent[]>;
}

export interface VoiceRouteDeps {
  voice: VoiceAdapter;
  store: VoiceStore;
  /** Shared secret the agents' report_beat tool sends (Worker secret TELL_TOOL_SECRET). */
  toolSecret: string;
  /** HMAC secret of the ElevenLabs post-call webhook (Worker secret ELEVENLABS_WEBHOOK_SECRET). */
  webhookSecret: string;
}

export function createVoiceRoutes(deps: VoiceRouteDeps) {
  const postCall = postCallWebhookHandler({
    secret: deps.webhookSecret,
    store: (t) =>
      deps.store.saveTranscript({
        ...t,
        turns: t.turns.map((turn) => ({ ...turn, message: redact(turn.message) })),
      }),
    onCallFailed: ({ conversationId, reason }) =>
      deps.store.addEvent({ conversationId, kind: "call_failed", detail: reason }),
    deleteConversation: (id) => deps.voice.deleteConversation(id),
  });

  const beat = beatHandler({
    toolSecret: deps.toolSecret,
    onBeat: ({ conversationId, beat }) => deps.store.addEvent({ conversationId, kind: beat }),
  });

  /** GET ?conversation_id=…&after=<last event id>: the app polls this during a call. */
  async function events(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversation_id") ?? "";
    if (!conversationId) return Response.json({ error: "conversation_id required" }, { status: 400 });
    const cursor = Number.parseInt(url.searchParams.get("after") ?? "0", 10);
    const after = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
    const list = await deps.store.listEvents(conversationId, after);
    return Response.json({ events: list }, { headers: { "Cache-Control": "no-store" } });
  }

  const session = browserSessionHandler({ voice: deps.voice });

  return { session, postCall, beat, events };
}
