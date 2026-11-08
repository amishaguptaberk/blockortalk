import { describe, expect, it } from "vitest";
import {
  BLOKBUKS,
  DAILY_SCORED_CALLS,
  applyChange,
  isNextCallScored,
  labelByRules,
  scoreCall,
  scoredCallsLeftToday,
  seasonDay,
  type FinishedCall,
} from "../lib/blokbuks/rules";

const call = (over: Partial<FinishedCall>): FinishedCall => ({
  version: "scam",
  scored: true,
  replies: [],
  verdict: "Scam",
  verifiedViaOwnApp: false,
  scoredBy: "agent",
  ...over,
});

const verdictMoment = (c: FinishedCall) => scoreCall(c).moments.find(m => m.kind === "verdict")!;

describe("Blokbuks table", () => {
  it("pays +100 for a correct Verdict on either Version", () => {
    expect(verdictMoment(call({ version: "scam", verdict: "Scam" }))).toMatchObject({ right: true, blokbuks: BLOKBUKS.correctVerdict });
    expect(verdictMoment(call({ version: "real", verdict: "Real" }))).toMatchObject({ right: true, blokbuks: 100 });
  });

  it("charges −50 for a wrong Verdict, including calling a real caller a scam", () => {
    expect(verdictMoment(call({ version: "real", verdict: "Scam" }))).toMatchObject({ right: false, blokbuks: BLOKBUKS.wrongVerdict });
    expect(verdictMoment(call({ version: "scam", verdict: "Real" }))).toMatchObject({ right: false, blokbuks: -50 });
  });

  it("counts Unverified plus a check through the Player's own app as correct", () => {
    for (const version of ["real", "scam"] as const) {
      expect(verdictMoment(call({ version, verdict: "Unverified", verifiedViaOwnApp: true }))).toMatchObject({ right: true, blokbuks: 100 });
    }
  });

  it("never charges for Unverified by itself, but doesn't count it as right", () => {
    expect(verdictMoment(call({ verdict: "Unverified" }))).toMatchObject({ right: false, blokbuks: 0 });
  });

  it("pays +25 for protecting a secret and charges −100 for leaking one", () => {
    const result = scoreCall(call({ replies: [{ step: 2, move: "Protect" }, { step: 3, move: "Leak" }] }));
    const [protect, leak] = result.moments;
    expect(protect).toMatchObject({ kind: "reply", step: 2, right: true, blokbuks: BLOKBUKS.protectedSecret });
    expect(leak).toMatchObject({ kind: "reply", step: 3, right: false, blokbuks: BLOKBUKS.leakedSecret });
  });

  it("pays +25 once for verifying through the Player's own app", () => {
    const without = scoreCall(call({ verdict: "Scam" })).delta;
    const withCheck = scoreCall(call({ verdict: "Scam", verifiedViaOwnApp: true })).delta;
    expect(withCheck - without).toBe(BLOKBUKS.verifiedOwnApp);
  });

  it("adds up a whole call into right, wrong and a Blokbuks change", () => {
    const result = scoreCall(call({
      replies: [{ step: 2, move: "Probe" }, { step: 3, move: "Protect" }, { step: 4, move: "Disconnect" }],
      verdict: "Scam",
      verifiedViaOwnApp: true,
    }));
    expect(result.moments.map(m => m.kind)).toEqual(["reply", "reply", "reply", "verdict"]);
    expect(result).toMatchObject({ right: 4, wrong: 0, delta: 25 + 100 + 25 });
  });

  it("judges replies by Version: complying is wrong with a scam, fine with a real caller", () => {
    expect(scoreCall(call({ version: "scam", replies: [{ step: 4, move: "Comply" }] })).moments[0]).toMatchObject({ right: false, blokbuks: 0 });
    expect(scoreCall(call({ version: "real", verdict: "Real", replies: [{ step: 4, move: "Comply" }] })).moments[0]).toMatchObject({ right: true });
  });

  it("treats hanging up on a real caller as right only when the Player then checks their own app", () => {
    const hangUp = { version: "real" as const, verdict: "Unverified" as const, replies: [{ step: 2 as const, move: "Disconnect" as const }] };
    expect(scoreCall(call(hangUp)).moments[0]!.right).toBe(false);
    expect(scoreCall(call({ ...hangUp, verifiedViaOwnApp: true })).moments[0]!.right).toBe(true);
  });

  it("scores only replies to steps 2–4, except that a leak always counts", () => {
    const result = scoreCall(call({ replies: [{ step: 1, move: "Probe" }, { step: 1, move: "Leak" }, { step: 2, move: "Protect" }] }));
    expect(result.moments.filter(m => m.kind === "reply").map(m => m.move)).toEqual(["Leak", "Protect"]);
  });

  it("gives every Scored moment a one-sentence reason", () => {
    const result = scoreCall(call({ replies: [{ step: 2, move: "Probe" }, { step: 3, move: "Leak" }], verdict: "Real" }));
    for (const m of result.moments) expect(m.why).toMatch(/^[A-Z][^.!?]*[.!?]$/);
  });

  it("returns the same right and wrong for practice calls, but no Blokbuks", () => {
    const scored = scoreCall(call({ replies: [{ step: 3, move: "Leak" }], verdict: "Real" }));
    const practice = scoreCall(call({ scored: false, replies: [{ step: 3, move: "Leak" }], verdict: "Real" }));
    expect(practice).toMatchObject({ right: scored.right, wrong: scored.wrong, delta: 0 });
    expect(practice.moments.every(m => m.blokbuks === 0)).toBe(true);
  });

  it("flags calls scored by rules", () => {
    expect(scoreCall(call({ scoredBy: "rules" })).scoredBy).toBe("rules");
    expect(scoreCall(call({})).scoredBy).toBe("agent");
  });

  it("rejects unknown Moves and repeated steps", () => {
    expect(() => scoreCall(call({ replies: [{ step: 2, move: "Grovel" as never }] }))).toThrow();
    expect(() => scoreCall(call({ replies: [{ step: 2, move: "Probe" }, { step: 2, move: "Protect" }] }))).toThrow();
  });
});

describe("Blokbuks totals", () => {
  it("never drop below 0", () => {
    expect(applyChange(30, -100)).toBe(0);
    expect(applyChange(0, -50)).toBe(0);
    expect(applyChange(200, 150)).toBe(350);
  });
});

describe("five Scored calls a day", () => {
  // 2026-11-08 is after the DST switch, so Central Time is UTC−6.
  const now = new Date("2026-11-08T18:00:00Z");
  const today = (hour: number) => new Date(`2026-11-08T${String(hour).padStart(2, "0")}:00:00Z`);

  it("allows the 5th and makes the 6th practice", () => {
    const four = [8, 9, 10, 11].map(today);
    expect(isNextCallScored(four, now)).toBe(true);
    expect(scoredCallsLeftToday(four, now)).toBe(1);
    const five = [...four, today(12)];
    expect(DAILY_SCORED_CALLS).toBe(5);
    expect(isNextCallScored(five, now)).toBe(false);
    expect(scoredCallsLeftToday(five, now)).toBe(0);
  });

  it("resets at midnight Central Time, not UTC", () => {
    expect(seasonDay(new Date("2026-11-08T05:59:00Z"))).toBe("2026-11-07"); // 11:59 PM CT
    expect(seasonDay(new Date("2026-11-08T06:01:00Z"))).toBe("2026-11-08"); // 12:01 AM CT
    const lateLastNight = Array.from({ length: 5 }, (_, i) => new Date(Date.parse("2026-11-08T05:50:00Z") + i * 60_000));
    expect(isNextCallScored(lateLastNight, new Date("2026-11-08T06:01:00Z"))).toBe(true);
    expect(isNextCallScored(lateLastNight, new Date("2026-11-08T05:59:00Z"))).toBe(false);
  });

  it("accepts ISO strings from the database", () => {
    expect(scoredCallsLeftToday(["2026-11-08T08:00:00.000Z"], now)).toBe(4);
  });
});

describe("rules labeler", () => {
  const secrets = [
    { label: "Account PIN", value: "8302" },
    { label: "Date of birth", value: "March 14, 1991" },
  ];

  it("labels each Move", () => {
    const cases: Array<[string, string]> = [
      ["sure, it's eight three oh two", "Leak"],
      ["I was born March fourteenth, 1991", "Leak"],
      ["I'll call Corvanta back on the number in my app", "Verify"],
      ["I'm hanging up now", "Disconnect"],
      ["I don't share my PIN with anyone", "Protect"],
      ["Which department did you say you're with?", "Probe"],
      ["Okay, go ahead, what do you need from me?", "Comply"],
      ["yes", "Comply"],
    ];
    for (const [reply, move] of cases) expect(labelByRules(reply, secrets), reply).toBe(move);
  });

  it("treats a leak as a leak even inside a refusal or a goodbye", () => {
    expect(labelByRules("fine, 8302, bye", secrets)).toBe("Leak");
  });

  it("doesn't count asking the caller to call again as verifying", () => {
    expect(labelByRules("Can you call me back later?", secrets)).toBe("Probe");
  });

  it("falls back to Probe for a neutral reply", () => {
    expect(labelByRules("hmm", secrets)).toBe("Probe");
  });
});
