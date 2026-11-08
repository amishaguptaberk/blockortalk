import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { callVariables, VoiceRequestError, type ChallengeCallerId } from "./callers";
export { callVariables, VoiceRequestError } from "./callers";
import { buildTranscript, type PostCallTranscript } from "./transcript";

/**
 * The voice adapter (docs/SPEC.md, "Voice adapter"): the only seam the drill
 * service uses to reach ElevenLabs. `FakeVoiceAdapter` below replaces it in tests.
 */
export interface VoiceAdapter {
  /** Rings the player's real phone through the SIP trunk (Photon). */
  placeCall(req: PlaceCallRequest): Promise<{ conversationId: string }>;
  /** Server-issued credentials for a browser-voice session (try-it, callback, Plan B). */
  createBrowserSession(req: BrowserSessionRequest): Promise<BrowserSession>;
  /** Removes a conversation from ElevenLabs once Tell has stored what it needs. */
  deleteConversation(conversationId: string): Promise<void>;
  /**
   * Polling fallback when the post-call webhook is late: the finished transcript,
   * or null while the conversation is still initiated / in progress / processing.
   */
  fetchFinishedTranscript(conversationId: string): Promise<PostCallTranscript | null>;
}

export interface PlaceCallRequest {
  callerId: ChallengeCallerId;
  toNumber: string;
  /** Tell never calls a number that hasn't passed SMS verification. */
  phoneVerified: boolean;
  /** Scenario-card values for this call; every variable the agent declares must be present. */
  variables: Record<string, string>;
}

export interface BrowserSessionRequest {
  callerId: ChallengeCallerId;
}

export interface BrowserSession {
  agentId: string;
  /** WebRTC conversation token for `Conversation.startSession({ conversationToken })`. */
  conversationToken: string;
}

/** ElevenLabs agent IDs per Challenge caller, written by `npm run voice:provision`. */
export type AgentIds = Record<ChallengeCallerId, string>;

const E164 = /^\+[1-9]\d{7,14}$/;
const AGENT_ID = /^agent_\w+$/;
const TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token";

/**
 * Plain-fetch route to the browser-voice token endpoint. The Worker uses this
 * instead of the SDK's getWebrtcToken so the request is exactly the documented
 * GET with the key in `xi-api-key`, nothing else.
 */
export interface TokenFetch {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiKey: () => string | undefined;
}

/** Thrown for a non-OK token response; carries the status and parsed body for logging. */
export class VoiceUpstreamError extends Error {
  constructor(readonly statusCode: number, readonly body: unknown) {
    super(`ElevenLabs returned ${statusCode}`);
  }
}

export class ElevenLabsVoiceAdapter implements VoiceAdapter {
  constructor(
    private readonly client: Pick<ElevenLabsClient, "conversationalAi">,
    private readonly agentIds: AgentIds,
    /** ElevenLabs phone-number ID of the imported Photon SIP-trunk line. */
    private readonly phoneNumberId: string | undefined,
    private readonly tokenFetch?: TokenFetch,
  ) {}

  async placeCall(req: PlaceCallRequest): Promise<{ conversationId: string }> {
    // Checked before anything else so an unverified number can never be dialled.
    if (req.phoneVerified !== true) {
      throw new VoiceRequestError("Refusing to call a number that is not verified");
    }
    if (!E164.test(req.toNumber)) {
      throw new VoiceRequestError("toNumber must be in E.164 format, e.g. +14155550123");
    }
    if (!this.phoneNumberId) {
      throw new VoiceRequestError("ELEVENLABS_PHONE_NUMBER_ID is not configured");
    }
    const dynamicVariables = callVariables(req.callerId, req.variables);

    const res = await this.client.conversationalAi.sipTrunk.outboundCall({
      agentId: this.agentIds[req.callerId],
      agentPhoneNumberId: this.phoneNumberId,
      toNumber: req.toNumber,
      conversationInitiationClientData: { dynamicVariables },
      telephonyCallConfig: { ringingTimeoutSecs: 30 },
    });
    if (!res.success || !res.conversationId) {
      throw new VoiceRequestError(`Outbound call failed: ${res.message}`);
    }
    return { conversationId: res.conversationId };
  }

  async createBrowserSession(req: BrowserSessionRequest): Promise<BrowserSession> {
    const agentId = String(this.agentIds[req.callerId] ?? "").trim();
    if (!AGENT_ID.test(agentId)) {
      throw new VoiceRequestError(`No valid ElevenLabs agent ID for ${req.callerId}`);
    }
    if (!this.tokenFetch) {
      const res = await this.client.conversationalAi.conversations.getWebrtcToken({ agentId });
      return { agentId, conversationToken: res.token };
    }
    const apiKey = this.tokenFetch.apiKey()?.trim();
    if (!apiKey) throw new VoiceRequestError("ELEVENLABS_API_KEY is not set");
    const res = await this.tokenFetch.fetch(`${TOKEN_URL}?agent_id=${encodeURIComponent(agentId)}`, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) throw new VoiceUpstreamError(res.status, body);
    const token = (body as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || !token) throw new VoiceUpstreamError(res.status, undefined);
    return { agentId, conversationToken: token };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.client.conversationalAi.conversations.delete(conversationId);
  }

  async fetchFinishedTranscript(conversationId: string): Promise<PostCallTranscript | null> {
    const c = await this.client.conversationalAi.conversations.get(conversationId);
    if (c.status !== "done" && c.status !== "failed") return null;
    return buildTranscript({
      conversationId,
      agentId: c.agentId,
      status: c.status,
      durationSecs: c.metadata?.callDurationSecs,
      turns: c.transcript ?? [],
    });
  }
}

/** Test double for the drill-service seam: records requests, places nothing. */
export class FakeVoiceAdapter implements VoiceAdapter {
  readonly calls: PlaceCallRequest[] = [];
  readonly sessions: BrowserSessionRequest[] = [];
  readonly deleted: string[] = [];
  /** Preload finished transcripts by conversation ID for polling tests. */
  readonly transcripts = new Map<string, PostCallTranscript>();
  private next = 1;

  async placeCall(req: PlaceCallRequest) {
    if (req.phoneVerified !== true) {
      throw new VoiceRequestError("Refusing to call a number that is not verified");
    }
    callVariables(req.callerId, req.variables);
    this.calls.push(req);
    return { conversationId: `conv_fake_${this.next++}` };
  }

  async createBrowserSession(req: BrowserSessionRequest) {
    this.sessions.push(req);
    return { agentId: `agent_fake_${req.callerId}`, conversationToken: "fake-token" };
  }

  async deleteConversation(conversationId: string) {
    this.deleted.push(conversationId);
  }

  async fetchFinishedTranscript(conversationId: string) {
    return this.transcripts.get(conversationId) ?? null;
  }
}
