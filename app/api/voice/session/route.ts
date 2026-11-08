import { voiceRoutes } from "../../../../lib/voice/server";

export const dynamic = "force-dynamic";

/** Browser-voice token for a Challenge caller (try-it, Corvanta callback, stage Plan B). */
export const POST = (req: Request) => voiceRoutes().session(req);
