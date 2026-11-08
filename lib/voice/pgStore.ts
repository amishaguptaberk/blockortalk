import pg from "pg";
import type { VoiceEvent, VoiceStore } from "./routes";

/** Postgres-backed VoiceStore. One client per call, like lib/health.mjs, which suits Workers. */
export function pgVoiceStore(connectionString: string): VoiceStore {
  async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end().catch(() => {});
    }
  }

  return {
    saveTranscript: (t) =>
      withClient(async (c) => {
        const res = await c.query(
          `INSERT INTO voice_transcripts (conversation_id, agent_id, status, duration_secs, turns)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (conversation_id) DO NOTHING`,
          [t.conversationId, t.agentId, t.status, t.durationSecs, JSON.stringify(t.turns)],
        );
        return res.rowCount === 1 ? "stored" : "duplicate";
      }),

    addEvent: (e) =>
      withClient(async (c) => {
        await c.query(
          "INSERT INTO voice_events (conversation_id, kind, detail) VALUES ($1, $2, $3)",
          [e.conversationId, e.kind, e.detail ?? null],
        );
      }),

    listEvents: (conversationId, afterId) =>
      withClient(async (c) => {
        const res = await c.query(
          `SELECT id, conversation_id, kind, detail, at FROM voice_events
           WHERE conversation_id = $1 AND id > $2 ORDER BY id LIMIT 100`,
          [conversationId, afterId],
        );
        return res.rows.map(
          (r): VoiceEvent => ({
            id: Number(r.id),
            conversationId: r.conversation_id,
            kind: r.kind,
            ...(r.detail ? { detail: r.detail } : {}),
            at: new Date(r.at).toISOString(),
          }),
        );
      }),
  };
}
