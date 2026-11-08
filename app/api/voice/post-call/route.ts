import { voiceRoutes } from "../../../../lib/voice/server";

export const dynamic = "force-dynamic";

/** ElevenLabs post-call webhook: signed transcripts and call-initiation failures. */
export const POST = (req: Request) => voiceRoutes().postCall(req);
