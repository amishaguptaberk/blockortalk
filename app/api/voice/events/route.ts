import { voiceRoutes } from "../../../../lib/voice/server";

export const dynamic = "force-dynamic";

/** Live call events for one conversation: GET ?conversation_id=…&after=<last id>. */
export const GET = (req: Request) => voiceRoutes().events(req);
