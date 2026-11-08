import { describe, expect, it } from "vitest";
import { PERSONAS, CHALLENGE_CALLER_IDS } from "../../lib/voice/personas";
import { startBrowserCall, type StartSessionFn } from "../../lib/voice/browserCall";

const callerId = CHALLENGE_CALLER_IDS[0]!;
const variables = Object.fromEntries(Object.keys(PERSONAS[callerId].variables).map((k) => [k, `v-${k}`]));

function setup(opts: { throwOnStart?: unknown } = {}) {
  const calls: any[] = [];
  let cb: any;
  let ended = 0;
  const session = { endSession: async () => void (session.ended = true), ended: false, in: 0.25, out: 0.5 };
  const start: StartSessionFn = async (o) => {
    calls.push(o);
    cb = o;
    if (opts.throwOnStart) throw opts.throwOnStart;
    return {
      endSession: session.endSession,
      getInputVolume: () => session.in,
      getOutputVolume: () => session.out,
    };
  };
  const turns: any[] = [];
  const ends: string[] = [];
  let denied = 0;
  const run = () =>
    startBrowserCall({
      callerId,
      conversationToken: "tok",
      variables: { ...variables, extra: "ignored" },
      startSession: start,
      onTurn: (t) => turns.push(t),
      onEnded: ({ reason }) => (ended++, ends.push(reason)),
      onMicDenied: () => void denied++,
    });
  return { run, calls, turns, ends, session, cb: () => cb, denied: () => denied };
}

describe("browser call", () => {
  it("throws on a missing scenario-card variable and never starts a session", async () => {
    const h = setup();
    const missing = Object.keys(variables)[0]!;
    await expect(
      startBrowserCall({
        callerId,
        conversationToken: "tok",
        variables: { ...variables, [missing]: "" },
        startSession: async (o) => (h.calls.push(o), { endSession: async () => {} }),
        onTurn() {},
        onEnded() {},
        onMicDenied() {},
      }),
    ).rejects.toThrow(/Missing variables/);
    expect(h.calls).toHaveLength(0);
  });

  it("sends only token, webrtc and validated variables, no overrides", async () => {
    const h = setup();
    await h.run();
    expect(h.calls[0].conversationToken).toBe("tok");
    expect(h.calls[0].connectionType).toBe("webrtc");
    expect(h.calls[0].dynamicVariables).toEqual(variables);
    expect(h.calls[0]).not.toHaveProperty("overrides");
  });

  it("maps messages to turns in order", async () => {
    const h = setup();
    await h.run();
    h.cb().onMessage({ message: "hello", role: "agent", source: "ai" });
    h.cb().onMessage({ message: "hi", role: "user", source: "user" });
    expect(h.turns).toEqual([
      { role: "agent", message: "hello" },
      { role: "user", message: "hi" },
    ]);
  });

  it("fires onEnded once even if disconnect and error both fire", async () => {
    const h = setup();
    await h.run();
    h.cb().onError("boom");
    h.cb().onDisconnect({ reason: "agent" });
    expect(h.ends).toHaveLength(1);
  });

  it("reports mic denial without throwing or emitting turns", async () => {
    const err = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    const h = setup({ throwOnStart: err });
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.denied()).toBe(1);
    expect(h.turns).toHaveLength(0);
    expect(h.ends).toHaveLength(0);
  });

  it("ends the session and exposes levels and conversation id", async () => {
    const h = setup();
    const handle = (await h.run())!;
    expect(handle.conversationId()).toBeUndefined();
    h.cb().onConnect({ conversationId: "conv_9" });
    expect(handle.conversationId()).toBe("conv_9");
    expect(handle.inputLevel()).toBe(0.25);
    expect(handle.outputLevel()).toBe(0.5);
    await handle.end();
    expect(h.session.ended).toBe(true);
  });

  it("treats a permission-denied error after connect as an ordinary error: the call still ends once", async () => {
    const h = setup();
    const handle = await h.run();
    expect(handle).toBeDefined();
    h.cb().onMessage({ role: "agent", message: "Hi, is this Alex?" });
    h.cb().onError("Server error: permission denied for tool");
    h.cb().onDisconnect({ reason: "error", message: "Server error: permission denied for tool" });
    expect(h.denied()).toBe(0);
    expect(h.ends).toEqual(["error"]);
  });

  it("offers text mode when the device has no microphone", async () => {
    const h = setup({ throwOnStart: Object.assign(new Error("Requested device not found"), { name: "NotFoundError" }) });
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.denied()).toBe(1);
    expect(h.ends).toEqual([]);
  });

  it("closes the session when it reports an ended error, and forwards no turns afterwards", async () => {
    const h = setup();
    await h.run();
    h.cb().onMessage({ role: "agent", message: "before" });
    h.cb().onError("Server error: something broke");
    h.cb().onMessage({ role: "agent", message: "after" });
    await Promise.resolve();
    expect(h.session.ended).toBe(true);
    expect(h.ends).toEqual(["error"]);
    expect(h.turns.map((t: { message: string }) => t.message)).toEqual(["before"]);
  });

  it("closes a session that errored while it was still starting", async () => {
    let ended = false;
    const ends: string[] = [];
    const handle = await startBrowserCall({
      callerId,
      conversationToken: "tok",
      variables,
      startSession: async (o) => {
        o.onError("Server error: early failure");
        return { endSession: async () => void (ended = true) };
      },
      onTurn() {},
      onEnded: ({ reason }) => void ends.push(reason),
      onMicDenied() {},
    });
    expect(handle).toBeUndefined();
    expect(ended).toBe(true);
    expect(ends).toEqual(["error"]);
  });
});
