/** One turn of a finished call, as ElevenLabs reports it. */
export interface CallTurn {
  role: "agent" | "user";
  message: string;
  timeInCallSecs: number;
}

export interface PostCallTranscript {
  conversationId: string;
  agentId: string;
  status: string;
  durationSecs: number | null;
  turns: CallTurn[];
}

export interface RawTurn {
  role?: unknown;
  message?: unknown;
  timeInCallSecs?: unknown;
}

/**
 * The single mapping from ElevenLabs call data to a PostCallTranscript, shared by
 * the webhook (snake_case payload) and the polling fallback (SDK camelCase).
 * Callers translate field names; this does the filtering and coercion.
 */
export function buildTranscript(input: {
  conversationId: string;
  agentId: unknown;
  status: unknown;
  durationSecs: unknown;
  turns: readonly RawTurn[];
}): PostCallTranscript {
  const turns: CallTurn[] = input.turns
    .filter((t) => (t?.role === "agent" || t?.role === "user") && typeof t.message === "string")
    .map((t) => ({
      role: t.role as "agent" | "user",
      message: t.message as string,
      timeInCallSecs: Number(t.timeInCallSecs ?? 0),
    }));
  return {
    conversationId: input.conversationId,
    agentId: String(input.agentId ?? ""),
    status: String(input.status ?? ""),
    durationSecs: typeof input.durationSecs === "number" ? input.durationSecs : null,
    turns,
  };
}
