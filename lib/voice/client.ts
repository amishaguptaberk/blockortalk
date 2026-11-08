import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

/**
 * The SDK reads ELEVENLABS_API_KEY from the environment. Never pass a key in code.
 *
 * In the cloud dev container the real key is injected by the network proxy, so
 * ELEVENLABS_API_KEY is set to the placeholder `proxy-injected` there, and Node
 * needs NODE_USE_ENV_PROXY=1 for fetch to use the proxy.
 */
let client: ElevenLabsClient | undefined;

export function elevenLabs(): ElevenLabsClient {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not set (see .env.local)");
  }
  client ??= new ElevenLabsClient();
  return client;
}
