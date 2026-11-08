import { describe, expect, it } from "vitest";
import { buildReveal, revealReady, revealSignature } from "../lib/challenge/reveal";
import { PERSONAS, toTranscript } from "../lib/challenge/debriefAdapter";
import { CALLERS, CODE_REQUEST_LINES, FAKE_SECRETS } from "../lib/challenge/scenarios";
import { DISCLOSURE } from "../lib/challenge/recruiter";
import { assertDebriefResult, assertPersona, assertTranscript } from "../lib/debrief/index.mjs";
import type { CallResult, CallerId, Challenge, Turn } from "../lib/challenge/types";

const T0 = Date.parse("2026-11-08T10:00:00Z");
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();

/** A call: the system disclosure, the caller's opening, then [speaker, text] pairs 10 seconds apart. */
function call(callerId: CallerId, startSec: number, lines: Array<["caller" | "you", string, string[]?]>, extra: Partial<CallResult>): CallResult {
  const turns: Turn[] = [
    { role: "system", text: DISCLOSURE, at: at(startSec) },
    { role: "assistant", text: CALLERS[callerId].opening, at: at(startSec), source: "script" },
    ...lines.map(([who, text, leaked], i): Turn => ({
      role: who === "you" ? "user" : "assistant", text, at: at(startSec + 10 * (i + 1)),
      ...(who === "caller" ? { source: "script" as const } : {}), ...(leaked ? { leaked } : {}),
    })),
  ];
  return { callerId, verdict: "Real", turns, cost: 0, leaked: [], startedAt: at(startSec), ...extra };
}

function day(calls: CallResult[], rest: Partial<Challenge>): Challenge {
  return { id: "11111111-1111-4111-8111-111111111111", balance: 1000, interview: "OPEN", bank: "OPEN", callerId: "fraud_team", phase: "complete", startedAt: at(0), replies: 0,
    turns: [], calls, leaked: [], codeVisible: false, callbackStep: 0, events: [], ...rest };
}

const goodDay = () => day([
  call("recruiter", 0, [["caller", CALLERS.recruiter.beats[0][0]], ["you", "Thanks, I will check the portal first."]], { verdict: "Unverified", endedAt: at(40), endReason: "disconnect" }),
  call("onboarding", 100, [["caller", CALLERS.onboarding.beats[2][0]], ["you", "I do not share gift card codes. Goodbye."]], { verdict: "Scam", endedAt: at(130), endReason: "disconnect" }),
  call("fraud_team", 200, [["caller", CALLERS.fraud_team.beats[2][0]], ["you", "I will call the bank back on the number in my app."]], { verdict: "Unverified", endedAt: at(240), endReason: "disconnect" }),
], { interview: "BOOKED", bank: "RESOLVED", events: [
  { type: "Verify", surface: "portal", at: at(60) },
  { type: "Verify", surface: "bank", at: at(260) },
  { type: "Verify", surface: "callback", at: at(280) },
] });

const badDay = () => day([
  call("recruiter", 0, [["caller", CALLERS.recruiter.beats[0][0]]], { verdict: "Scam", endedAt: at(30), endReason: "stop" }),
  call("onboarding", 100, [["caller", CALLERS.onboarding.beats[2][0]], ["you", "The gift card code is 4729"]], { verdict: "Real", cost: 350, leaked: ["gift_card_code"], endedAt: at(130), endReason: "reply_cap" }),
  call("fraud_team", 200, [["caller", CODE_REQUEST_LINES[0]], ["you", "the code is 551274", ["live_code"]]], { verdict: "Real", cost: 650, leaked: ["live_code"], endedAt: at(240), endReason: "stop" }),
], { balance: 0, bank: "FAILED" });

describe("persona cards", () => {
  it("are valid and match the challenge order", () => {
    for (const id of ["recruiter", "onboarding", "fraud_team"] as const) assertPersona(PERSONAS[id]);
    expect(Object.values(PERSONAS).map(p => p.call_type)).toEqual(["legit", "scam", "hijacked"]);
    expect(Object.values(PERSONAS).map(p => p.persona_name)).toEqual(["Yui", "Ren", "Kai"]);
    // The service scans every fake secret on every call, so every card must carry the same values.
    for (const p of Object.values(PERSONAS)) {
      for (const [key, value] of Object.entries(p.fake_secrets)) expect(FAKE_SECRETS[key as keyof typeof FAKE_SECRETS], `${p.id}.${key}`).toBe(value);
      for (const key of Object.keys(FAKE_SECRETS).filter(k => k !== "live_code")) expect(p.fake_secrets, `${p.id} carries ${key}`).toHaveProperty(key);
    }
  });
});

describe("toTranscript", () => {
  it("numbers turns, maps speakers and verdicts, and tags script beats", () => {
    const transcript = assertTranscript(toTranscript(goodDay(), 1));
    expect(transcript.verdict).toBe("scam");
    expect(transcript.turns.map(t => t.speaker)).toEqual(["caller", "caller", "caller", "player"]);
    expect(transcript.turns.map(t => t.turn)).toEqual([1, 2, 3, 4]);
    expect(transcript.turns[0].beat).toBe("disclosure");
    expect(transcript.turns[2].beat).toBe("odd_payment");
    expect(transcript.turns[3].t).toBe(20);
  });

  it("turns the end reason into a hang-up or a cap event", () => {
    expect(toTranscript(goodDay(), 0).events).toContainEqual({ type: "hangup", by: "player", after_turn: 4, t: 40 });
    expect(toTranscript(badDay(), 1).events).toContainEqual({ type: "cap_reached", after_turn: 4, t: 30 });
  });

  it("gives each call only the verify events that belong to it", () => {
    const d = goodDay();
    expect(toTranscript(d, 0).events.filter(e => e.type === "portal_opened")).toHaveLength(1);
    expect(toTranscript(d, 1).events.filter(e => e.type === "portal_opened")).toHaveLength(0);
    expect(toTranscript(d, 2).events.map(e => e.type).filter(t => t !== "hangup" && t !== "code_popup")).toEqual(["bank_app_opened", "callback_completed"]);
    // Events after the call end are pinned to its last turn.
    expect(toTranscript(d, 2).events.find(e => e.type === "callback_completed")?.after_turn).toBe(4);
  });

  it("marks the code pop-up on Kai's call", () => {
    expect(toTranscript(badDay(), 2).events).toContainEqual({ type: "code_popup", after_turn: 3, t: 10 });
  });

  it("restores a redacted leak so the leak check still sees it", () => {
    const redacted = badDay();
    redacted.calls[2].turns[3].text = "[personal details removed]";
    expect(toTranscript(redacted, 2).turns[3].text).toContain("551274");
  });

  it("falls back to the first turn for days saved before the reveal", () => {
    const old = goodDay();
    for (const c of old.calls) { delete c.startedAt; delete c.endedAt; delete c.endReason; }
    const transcript = toTranscript(old, 1);
    expect(transcript.turns[3].t).toBe(20);
    expect(transcript.events.some(e => e.type === "hangup")).toBe(false);
  });
});

describe("buildReveal (fixed path, no Nemotron)", () => {
  it("builds a valid DebriefResult per call that agrees with the day's own score", async () => {
    const d = goodDay();
    const reveal = await buildReveal(d, { mode: "fixed", now: () => T0 });
    expect(reveal.calls).toHaveLength(3);
    reveal.calls.forEach(c => { assertDebriefResult(c.result); expect(c.result.path).toBe("fixed"); });
    expect(reveal.calls.map(c => c.persona.call_type)).toEqual(["legit", "scam", "hijacked"]);
    expect(reveal.calls.map(c => c.identity.label)).toEqual(["Real caller", "Scam", "Hijacked"]);
    expect(reveal.calls[0].result.outcome.task?.status).toBe("done");
    expect(reveal.calls[2].result.outcome.task?.status).toBe("done");
    expect(reveal.summary).toEqual({ balance: 1000, interview: "BOOKED", bank: "RESOLVED", money_lost: 0 });
    expect(reveal.signature).toBe(revealSignature(d));
  });

  it("charges the same money the day charged, and picks the costliest decision as the rewind", async () => {
    const d = badDay();
    const reveal = await buildReveal(d, { mode: "fixed" });
    expect(reveal.calls.map(c => c.result.outcome.money_lost)).toEqual(d.calls.map(c => c.cost));
    expect(reveal.calls[2].result.outcome.task?.status).toBe("failed");
    expect(reveal.calls[1].result.rules[0].status).toBe("broken");
    expect(reveal.rewind).toMatchObject({ call: 2, cost_you: true });
  });

  it("shows the red-flag spans the detector found in the caller's lines", async () => {
    const reveal = await buildReveal(badDay(), { mode: "fixed" });
    const ren = reveal.calls[1];
    expect(ren.result.red_flags.length).toBeGreaterThan(0);
    for (const flag of ren.result.red_flags) {
      const text = ren.turns.find(t => t.turn === flag.turn)!.text;
      expect(text.slice(flag.span.start, flag.span.end)).toBe(flag.span.text);
    }
  });
});

describe("revealReady", () => {
  it("opens only after the third verdict", () => {
    expect(revealReady(goodDay())).toBe(true);
    expect(revealReady({ ...goodDay(), phase: "between" })).toBe(false);
    expect(revealReady({ ...goodDay(), calls: goodDay().calls.slice(0, 2) })).toBe(false);
  });
  it("signature changes when the bank callback lands after the last verdict", () => {
    const before = goodDay();
    const after = { ...before, events: before.events.slice(0, 2), bank: "OPEN" as const };
    expect(revealSignature(after)).not.toBe(revealSignature(before));
  });
});

describe('recorded outcomes and retrieval evidence', () => {
  it('does not charge for a code typed before the service displayed it', async () => {
    const d = goodDay();
    d.calls[2].turns.splice(2, 0, { role: 'user', text: '551274', at: at(201) });
    const reveal = await buildReveal(d, { mode: 'fixed' });
    expect(reveal.calls[2].result.outcome.money_lost).toBe(0);
    expect(reveal.calls[2].result.outcome.task?.status).toBe('done');
    expect(reveal.calls[2].result.decisions.some(d => d.kind === 'leak')).toBe(false);
  });

  it('uses detector quotes and labels without changing the recorded money', async () => {
    const reveal = await buildReveal(badDay(), { mode: 'fixed', detector: async transcript => {
      const turn = transcript.turns.find(t => t.text.includes('gift card'));
      return { source: 'fake-retrieval', label: 'scam', scam_type: 'impersonation', confidence: .9,
        red_flags: turn ? [{ turn: turn.turn, tactic: 'reward', span: { start: 0, end: turn.text.length, text: turn.text } }] : [] };
    } });
    expect(reveal.calls[1].result.detector.source).toBe('fake-retrieval');
    expect(reveal.calls[1].result.red_flags[0].tactic).toBe('reward');
    expect(reveal.calls.map(c => c.result.outcome.money_lost)).toEqual([0, 350, 650]);
    expect(reveal.calls[2].result.decisions.find(d => d.kind === 'leak')).toMatchObject({ turn: 4, result: 'cost_you' });
  });

  it('keeps the report usable when retrieval fails and does not claim keyword flags are retrieval', async () => {
    const reveal = await buildReveal(badDay(), { mode: 'fixed', detector: async () => { throw new Error('offline'); } });
    expect(reveal.calls[2].result.detector.source).toBe('retrieval unavailable');
    expect(reveal.calls[2].result.red_flags).toEqual([]);
    expect(reveal.calls[2].result.outcome.money_lost).toBe(650);
  });
});

it('keeps saved money for an old redacted call whose leak turn is unknown', async () => {
  const d = badDay();
  d.calls[2].turns[3].text = '[personal details removed]';
  delete d.calls[2].turns[3].leaked;
  const reveal = await buildReveal(d, { mode: 'fixed' });
  expect(reveal.calls[2].result.outcome.money_lost).toBe(650);
  expect(reveal.calls[2].result.outcome.task?.status).toBe('failed');
  expect(reveal.calls[2].result.rules[0]).toMatchObject({ status: 'broken', turn: null });
  expect(reveal.calls[2].warning).toContain('not its turn');
});
