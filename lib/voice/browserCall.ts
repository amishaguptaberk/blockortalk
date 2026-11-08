import { Conversation } from "@elevenlabs/client";
// Browser code: import only ./callers here, never ./personas or ./adapter (they hold the prompts).
import { callVariables, type ChallengeCallerId } from "./callers";

export type TurnRole = "agent" | "user";

export interface BrowserCallHandle {
  /** The End button. */
  end(): Promise<void>;
  /** 0..1 microphone level, 0 before connect. */
  inputLevel(): number;
  /** 0..1 caller level, 0 before connect. */
  outputLevel(): number;
  conversationId(): string | undefined;
}

/** The slice of the SDK session this wrapper uses. */
export interface BrowserSessionLike {
  endSession(): Promise<void>;
  getInputVolume?(): number;
  getOutputVolume?(): number;
}

export type StartSessionFn = (options: any) => Promise<BrowserSessionLike>;

export interface BrowserCallOptions {
  anonymous?: boolean;
  callerId: ChallengeCallerId;
  conversationToken: string;
  /** Scenario-card values; validated against the caller's declared variables. */
  variables: Record<string, string>;
  onTurn(turn: { role: TurnRole; message: string }): void;
  onEnded(info: { reason: string }): void;
  /** No usable microphone (permission denied or none found): offer text mode. */
  onMicDenied(): void;
  /** Defaults to the SDK's Conversation.startSession. */
  startSession?: StartSessionFn;
}

function isMicDenial(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | string | undefined;
  const name = typeof e === "object" ? e?.name : undefined;
  const msg = typeof e === "string" ? e : (e?.message ?? "");
  return name === "NotAllowedError" || name === "NotFoundError" || /NotAllowedError|permission denied|microphone.*(denied|blocked)/i.test(msg);
}

/**
 * Starts a WebRTC call to a Challenge agent. Only the conversation token and
 * dynamic variables are sent; no prompt or voice overrides (spec decision).
 */
export async function startBrowserCall(opts: BrowserCallOptions): Promise<BrowserCallHandle | undefined> {
  const dynamicVariables = callVariables(opts.callerId, opts.variables);
  const start: StartSessionFn = opts.startSession ?? ((o) => Conversation.startSession(o));

  let session: BrowserSessionLike | undefined;
  let convId: string | undefined;
  let finished = false;
  let denied = false;
  // A mic denial can only happen while the session is starting; after that,
  // a "permission denied" message is an ordinary error and must still end the call.
  let started = false;

  const finish = (reason: string) => {
    if (finished || denied) return;
    finished = true;
    // An SDK error doesn't always disconnect: close the session so the mic and call stop too.
    if (reason === "error") void session?.endSession().catch(() => {});
    opts.onEnded({ reason });
  };
  const deny = () => {
    if (denied || finished) return;
    denied = true;
    opts.onMicDenied();
  };

  try {
    session = await start({
      conversationToken: opts.conversationToken,
      connectionType: "webrtc",
      dynamicVariables: { ...dynamicVariables, ...(opts.anonymous ? { tell_try_it: "true" } : {}) },
      onConnect: ({ conversationId }: { conversationId: string }) => {
        convId = conversationId;
      },
      onMessage: (m: { message: string; role?: string; source?: string }) => {
        if (denied || finished) return;
        const role: TurnRole = (m.role ?? (m.source === "ai" ? "agent" : "user")) === "agent" ? "agent" : "user";
        opts.onTurn({ role, message: m.message });
      },
      onDisconnect: (d: { reason?: string; message?: string }) => {
        if (!started && d?.reason === "error" && isMicDenial(d.message)) return deny();
        finish(d?.reason ?? "disconnected");
      },
      onError: (message: string) => {
        if (!started && isMicDenial(message)) return deny();
        finish("error");
      },
    });
  } catch (err) {
    if (isMicDenial(err)) {
      deny();
      return undefined;
    }
    finish("error");
    throw err;
  }

  if (denied) {
    await session?.endSession().catch(() => {});
    return undefined;
  }
  if (finished) {
    // It errored while starting, before there was a session to close.
    await session?.endSession().catch(() => {});
    return undefined;
  }
  started = true;

  const live = session;
  return {
    end: () => live.endSession(),
    inputLevel: () => live.getInputVolume?.() ?? 0,
    outputLevel: () => live.getOutputVolume?.() ?? 0,
    conversationId: () => convId,
  };
}
