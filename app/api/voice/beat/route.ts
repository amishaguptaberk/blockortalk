import { voiceRoutes } from "../../../../lib/voice/server";

export const dynamic = "force-dynamic";

/** The agents' mid-call report_beat server tool (secret header + conversation ID). */
export const POST = (req: Request) => voiceRoutes().beat(req);
