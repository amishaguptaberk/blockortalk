import agentIds from "../../config/voice-agents.json";
import { ElevenLabsVoiceAdapter, type AgentIds, type VoiceAdapter } from "./adapter";
import { elevenLabs } from "./client";
import { pgVoiceStore } from "./pgStore";
import { createVoiceRoutes } from "./routes";

/**
 * Builds the voice routes from Worker secrets, per request:
 *   ELEVENLABS_API_KEY, DATABASE_URL, TELL_TOOL_SECRET, ELEVENLABS_WEBHOOK_SECRET,
 *   ELEVENLABS_PHONE_NUMBER_ID (only for phone calls).
 * A missing secret makes the matching route refuse (401/502), never accept unsigned input.
 */
export function voiceRoutes(env: NodeJS.ProcessEnv = process.env) {
  // The SDK client is created lazily so routes that don't need ElevenLabs still work without the key.
  const lazyClient = {
    get conversationalAi() {
      return elevenLabs().conversationalAi;
    },
  };
  const voice: VoiceAdapter = new ElevenLabsVoiceAdapter(
    lazyClient,
    agentIds as AgentIds,
    env.ELEVENLABS_PHONE_NUMBER_ID,
    // Browser-voice tokens go through a plain fetch, read lazily per request.
    { fetch: (url, init) => fetch(url, init), apiKey: () => env.ELEVENLABS_API_KEY },
  );
  return createVoiceRoutes({
    voice,
    store: pgVoiceStore(env.DATABASE_URL ?? ""),
    toolSecret: env.TELL_TOOL_SECRET ?? "",
    webhookSecret: env.ELEVENLABS_WEBHOOK_SECRET ?? "",
  });
}
