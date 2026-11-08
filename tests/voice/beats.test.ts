import { describe, expect, it } from "vitest";
import { beatHandler, type BeatEvent } from "../../lib/voice/beats";

const SECRET = "tool-secret-abc";

function harness() {
  const beats: BeatEvent[] = [];
  const handler = beatHandler({ toolSecret: SECRET, onBeat: async (e) => void beats.push(e) });
  const post = (body: unknown, secret?: string) =>
    handler(
      new Request("https://tell.test/api/voice/beat", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: secret === undefined ? {} : { "X-Tell-Tool-Secret": secret },
      }),
    );
  return { post, beats };
}

describe("mid-call beat tool", () => {
  it("passes a code_requested beat with its conversation ID to the app", async () => {
    const h = harness();
    const res = await h.post({ beat: "code_requested", conversation_id: "conv_1" }, SECRET);
    expect(res.status).toBe(200);
    expect(h.beats).toEqual([{ conversationId: "conv_1", beat: "code_requested" }]);
    expect(((await res.json()) as { result: string }).result).toMatch(/do not say it yourself/i);
  });

  it("tells the agent to hang up on stop_drill", async () => {
    const h = harness();
    const res = await h.post({ beat: "stop_drill", conversation_id: "conv_1" }, SECRET);
    expect(((await res.json()) as { result: string }).result).toBe("End the call now.");
  });

  it("rejects a missing or wrong secret without recording anything", async () => {
    const h = harness();
    expect((await h.post({ beat: "stop_drill", conversation_id: "c" })).status).toBe(401);
    expect((await h.post({ beat: "stop_drill", conversation_id: "c" }, "nope")).status).toBe(401);
    expect(h.beats).toHaveLength(0);
  });

  it("rejects unknown beats, missing conversation IDs and bad JSON", async () => {
    const h = harness();
    expect((await h.post({ beat: "transfer_money", conversation_id: "c" }, SECRET)).status).toBe(400);
    expect((await h.post({ beat: "stop_drill" }, SECRET)).status).toBe(400);
    expect((await h.post("{not json", SECRET)).status).toBe(400);
    expect(h.beats).toHaveLength(0);
  });
});
