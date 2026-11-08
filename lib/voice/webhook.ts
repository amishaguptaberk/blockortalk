import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import { buildTranscript, type PostCallTranscript } from "./transcript";

export type { CallTurn, PostCallTranscript } from "./transcript";

export interface PostCallDeps {
  /** HMAC secret ElevenLabs shows when the workspace webhook is created. */
  secret: string;
  /**
   * Hands the transcript to the drill service, which redacts real-looking data,
   * stores it and triggers the Debrief agent. It must be idempotent on
   * conversation ID in a single atomic write (e.g. INSERT ... ON CONFLICT DO
   * NOTHING on a unique conversation_id) and return "duplicate" when the row
   * already existed. ElevenLabs retries resend the same payload, and a throw
   * returns 500 so the retry is processed.
   */
  store(t: PostCallTranscript): Promise<"stored" | "duplicate">;
  /** Deletes the conversation from ElevenLabs once stored (docs/SPEC.md data handling). */
  deleteConversation(conversationId: string): Promise<void>;
  /**
   * An outbound call never connected (busy, no answer, ...). The drill service
   * offers "Call again" / "Play in browser". A throw returns 500 so ElevenLabs retries.
   */
  onCallFailed(f: { conversationId: string; agentId: string; reason: string }): Promise<void>;
  /** Signature verifier; defaults to the ElevenLabs SDK helper. */
  verify?: (rawBody: string, signature: string, secret: string) => Promise<unknown>;
}

const sdkVerify = (rawBody: string, signature: string, secret: string) =>
  // constructEvent only checks the signature locally; it makes no API call.
  new ElevenLabsClient({ apiKey: "unused-for-signature-check" }).webhooks.constructEvent(
    rawBody,
    signature,
    secret,
  );

function parseTranscript(event: any): PostCallTranscript | null {
  if (event?.type !== "post_call_transcription") return null;
  const d = event.data ?? {};
  if (typeof d.conversation_id !== "string" || !d.conversation_id) return null;
  return buildTranscript({
    conversationId: d.conversation_id,
    agentId: d.agent_id,
    status: d.status,
    durationSecs: d.metadata?.call_duration_secs,
    turns: (Array.isArray(d.transcript) ? d.transcript : []).map((t: any) => ({
      role: t?.role,
      message: t?.message,
      timeInCallSecs: t?.time_in_call_secs,
    })),
  });
}

function parseCallFailure(event: any): { conversationId: string; agentId: string; reason: string } | null {
  if (event?.type !== "call_initiation_failure") return null;
  const d = event.data ?? {};
  if (typeof d.conversation_id !== "string" || !d.conversation_id) return null;
  return {
    conversationId: d.conversation_id,
    agentId: String(d.agent_id ?? ""),
    reason: typeof d.failure_reason === "string" && d.failure_reason ? d.failure_reason : "unknown",
  };
}

/**
 * POST handler for the ElevenLabs post-call webhook. Web-standard
 * Request → Response, so a Next.js route file can re-export it.
 */
export function postCallWebhookHandler(deps: PostCallDeps) {
  const verify = deps.verify ?? sdkVerify;
  return async function POST(req: Request): Promise<Response> {
    const raw = await req.text();
    const signature = req.headers.get("elevenlabs-signature") ?? "";
    let event: unknown;
    try {
      if (!deps.secret) throw new Error("webhook secret not configured");
      event = await verify(raw, signature, deps.secret);
    } catch {
      return new Response("invalid signature", { status: 401 });
    }

    const failure = parseCallFailure(event);
    if (failure) {
      try {
        await deps.onCallFailed(failure);
      } catch (err) {
        console.error("call failure handler failed", failure.conversationId, err);
        return new Response("handler failed", { status: 500 });
      }
      return new Response("ok", { status: 200 });
    }

    const transcript = parseTranscript(event);
    // Other event types (audio, etc.) are acknowledged and ignored.
    if (!transcript) return new Response("ignored", { status: 200 });

    // Try-it voice stays in the browser. The signed vendor event carries the client marker.
    const variables = (event as { data?: { conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> } } })?.data?.conversation_initiation_client_data?.dynamic_variables;
    if (variables?.tell_try_it === 'true') {
      try { await deps.deleteConversation(transcript.conversationId); }
      catch { return new Response('delete failed', { status: 500 }); }
      return new Response('ok', { status: 200 });
    }

    let outcome: "stored" | "duplicate";
    try {
      outcome = await deps.store(transcript);
    } catch (err) {
      console.error("post-call store failed", transcript.conversationId, err);
      return new Response("store failed", { status: 500 });
    }
    try {
      // Also retried on a duplicate, in case the first delivery stored but failed to delete.
      await deps.deleteConversation(transcript.conversationId);
    } catch (err) {
      // Retention is already 1 day on the agent, so a missed delete still expires.
      console.warn("ElevenLabs conversation delete failed", transcript.conversationId, err);
    }
    return new Response(outcome === "stored" ? "ok" : "duplicate", { status: 200 });
  };
}
