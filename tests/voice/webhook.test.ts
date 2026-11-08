import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { postCallWebhookHandler, type PostCallTranscript } from "../../lib/voice/webhook";

const SECRET = "wsec_test_secret";

function sign(body: string, secret = SECRET, at = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${at}.${body}`).digest("hex");
  return `t=${at},v0=${mac}`;
}

const payload = JSON.stringify({
  type: "post_call_transcription",
  event_timestamp: 1762560000,
  data: {
    agent_id: "agent_fraud",
    conversation_id: "conv_123",
    status: "done",
    transcript: [
      { role: "agent", message: "It's recorded for your report...", time_in_call_secs: 0 },
      { role: "user", message: "It's five five one two seven four", time_in_call_secs: 31 },
    ],
    metadata: { call_duration_secs: 44 },
  },
});

function harness() {
  // Stands in for the drill service's unique-keyed insert.
  const rows = new Map<string, PostCallTranscript>();
  const stored: PostCallTranscript[] = [];
  const deleted: string[] = [];
  const db = { down: false };
  const failed: { conversationId: string; agentId: string; reason: string }[] = [];
  const failing = { on: false };
  const handler = postCallWebhookHandler({
    secret: SECRET,
    store: async (t) => {
      if (db.down) throw new Error("db down");
      if (rows.has(t.conversationId)) return "duplicate";
      rows.set(t.conversationId, t);
      stored.push(t);
      return "stored";
    },
    deleteConversation: async (id) => void deleted.push(id),
    onCallFailed: async (f) => {
      if (failing.on) throw new Error("handler down");
      failed.push(f);
    },
  });
  const post = (body: string, signature: string) =>
    handler(
      new Request("https://tell.test/api/voice/post-call", {
        method: "POST",
        body,
        headers: { "ElevenLabs-Signature": signature },
      }),
    );
  return { post, stored, deleted, db, failed, failing };
}

describe("post-call webhook", () => {
  it("stores a verified transcript, then deletes the conversation from ElevenLabs", async () => {
    const h = harness();
    const res = await h.post(payload, sign(payload));
    expect(res.status).toBe(200);
    expect(h.stored).toEqual([
      {
        conversationId: "conv_123",
        agentId: "agent_fraud",
        status: "done",
        durationSecs: 44,
        turns: [
          { role: "agent", message: "It's recorded for your report...", timeInCallSecs: 0 },
          { role: "user", message: "It's five five one two seven four", timeInCallSecs: 31 },
        ],
      },
    ]);
    expect(h.deleted).toEqual(["conv_123"]);
  });

  it("does not double-count a duplicate delivery", async () => {
    const h = harness();
    await h.post(payload, sign(payload));
    const again = await h.post(payload, sign(payload));
    expect(again.status).toBe(200);
    expect(h.stored).toHaveLength(1);
  });

  it("rejects a bad signature and stores nothing", async () => {
    const h = harness();
    const res = await h.post(payload, sign(payload, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(h.stored).toHaveLength(0);
    expect(h.deleted).toHaveLength(0);
  });

  it("rejects a tampered body and a missing signature", async () => {
    const h = harness();
    const tampered = payload.replace("conv_123", "conv_999");
    expect((await h.post(tampered, sign(payload))).status).toBe(401);
    expect((await h.post(payload, "")).status).toBe(401);
    expect(h.stored).toHaveLength(0);
  });

  it("rejects a replayed signature older than the SDK's 30-minute window", async () => {
    const h = harness();
    const old = Math.floor(Date.now() / 1000) - 31 * 60;
    expect((await h.post(payload, sign(payload, SECRET, old))).status).toBe(401);
    expect(h.stored).toHaveLength(0);
  });

  it("returns 500 when storing fails, then stores the retry exactly once", async () => {
    const h = harness();
    h.db.down = true;
    expect((await h.post(payload, sign(payload))).status).toBe(500);
    expect(h.deleted).toHaveLength(0);
    h.db.down = false;
    expect((await h.post(payload, sign(payload))).status).toBe(200);
    expect((await h.post(payload, sign(payload))).status).toBe(200);
    expect(h.stored).toHaveLength(1);
    expect(h.stored[0]!.conversationId).toBe("conv_123");
  });

  it("acknowledges other event types without storing them", async () => {
    const h = harness();
    const audio = JSON.stringify({ type: "post_call_audio", data: { conversation_id: "conv_123" } });
    const res = await h.post(audio, sign(audio));
    expect(res.status).toBe(200);
    expect(h.stored).toHaveLength(0);
  });

  const failure = JSON.stringify({
    type: "call_initiation_failure",
    event_timestamp: 1762560000,
    data: { agent_id: "agent_fraud", conversation_id: "conv_77", failure_reason: "busy" },
  });

  it("reports a call-initiation failure and stores nothing", async () => {
    const h = harness();
    const res = await h.post(failure, sign(failure));
    expect(res.status).toBe(200);
    expect(h.failed).toEqual([{ conversationId: "conv_77", agentId: "agent_fraud", reason: "busy" }]);
    expect(h.stored).toHaveLength(0);
    expect(h.deleted).toHaveLength(0);
  });

  it("uses reason 'unknown' when no failure_reason is given", async () => {
    const h = harness();
    const body = JSON.stringify({
      type: "call_initiation_failure",
      data: { agent_id: "agent_fraud", conversation_id: "conv_78" },
    });
    await h.post(body, sign(body));
    expect(h.failed[0]!.reason).toBe("unknown");
  });

  it("rejects an unsigned call-initiation failure", async () => {
    const h = harness();
    const res = await h.post(failure, sign(failure, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(h.failed).toHaveLength(0);
  });

  it("returns 500 when the call-failure handler throws", async () => {
    const h = harness();
    h.failing.on = true;
    expect((await h.post(failure, sign(failure))).status).toBe(500);
  });
});
