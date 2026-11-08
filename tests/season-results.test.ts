import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildResults, rankChange, type FinishedCallView } from "../lib/season/results";
import { createResultsHandlers, type ResultsStore } from "../lib/season/resultsRoutes";
import type { Score } from "../lib/season/routes";
import CallResults from "../app/play/CallResults";

const moments = [
  { n: 1, kind: "reply", step: 2, move: "Probe", right: true, blokbuks: 0, why: "Asking questions costs nothing.", quote: "Which branch", by: "agent" },
  { n: 2, kind: "reply", step: 3, move: "Protect", right: true, blokbuks: 25, why: "You kept your secrets to yourself.", quote: "I don't share codes", by: "agent" },
  { n: 3, kind: "reply", step: 4, move: "Leak", right: false, blokbuks: -100, why: "A secret left your hands.", quote: "4729", by: "rules" },
  { n: 4, kind: "verdict", verdict: "Scam", right: true, blokbuks: 100, why: "You spotted the scam." },
] as NonNullable<FinishedCallView["result"]>["moments"];
const record = (over: Partial<FinishedCallView> = {}): FinishedCallView => ({
  id: "call-1",
  playerId: "p1",
  seasonId: "s1",
  scenario: { id: "bank", category: "Bank fraud alert", org: "Corvanta Bank" },
  version: "scam",
  phase: "complete",
  scored: true,
  callsLeft: 3,
  verdict: "Scam",
  replies: [
    { step: 1, text: "Hello, who is this?" },
    { step: 2, text: "Which branch are you calling from?" },
    { step: 3, text: "I don't share codes with callers." },
    { step: 4, text: "Fine, it's 4729." },
  ],
  result: { callId: "call-1", moments, right: 3, wrong: 1, delta: 25, scoredBy: "agent", outcome: "fell for", total: 225 },
  ...over,
});
const base = record().result!;
const score = (playerId: string, blokbuks: number, right = 0, wrong = 0): Score => ({ playerId, nickname: playerId, blokbuks, right, wrong, reachedAt: "2026-11-08T10:00:00.000Z" });

describe("results view", () => {
  it("lists the sections in the agreed order", () => {
    const view = buildResults(record(), { from: 41, to: 12 }, true);
    expect(view.headline).toBe("This was a scam call.");
    expect(view.moments.map(m => m.label)).toEqual(["When the caller gave a detail", "When the caller pushed", "When the caller asked", "Your Verdict"]);
    expect(view.summary).toBe("3 right · 1 wrong");
    expect(view.blokbuks).toEqual({ text: "+25 B", total: 225 });
    expect(view.rank).toBe("#41 → #12");
    expect(view.callsLeft).toBe("3 Scored calls left today");
  });

  it("shows the Player's own words and a plain reason for every moment", () => {
    const view = buildResults(record(), null, true);
    expect(view.moments[0]).toMatchObject({ words: "Which branch are you calling from?", status: "Right", mark: "✓" });
    expect(view.moments[2]).toMatchObject({ words: "Fine, it's 4729.", status: "Wrong", mark: "✗", why: "A secret left your hands." });
    expect(view.moments[3]).toMatchObject({ words: "You said Scam.", status: "Right" });
  });

  it("tells a real call from a scam", () => {
    expect(buildResults(record({ version: "real" }), null, true).headline).toBe("This was a real call.");
  });

  it("shows practice calls as Practice · 0 B, with right and wrong still shown", () => {
    const view = buildResults(record({ scored: false, result: { ...base, delta: 0, total: null } }), null, true);
    expect(view.blokbuks).toEqual({ text: "Practice · 0 B", total: null });
    expect(view.summary).toBe("3 right · 1 wrong");
  });

  it("formats losses with a minus sign and says when rules scored the call", () => {
    const view = buildResults(record({ result: { ...base, delta: -150, scoredBy: "rules", total: 0 } }), null, true);
    expect(view.blokbuks.text).toBe("−150 B");
    expect(view.scoredByRules).toBe(true);
    expect(buildResults(record(), null, true).scoredByRules).toBe(false);
  });

  it("words the calls left today", () => {
    expect(buildResults(record({ callsLeft: 1 }), null, true).callsLeft).toBe("1 Scored call left today");
    expect(buildResults(record({ callsLeft: 0 }), null, true).callsLeft).toBe("No Scored calls left today. Calls are practice until midnight Central Time.");
  });

  it("offers the analysis only once it is unlocked", () => {
    expect(buildResults(record(), null, true).analysisUnlocked).toBe(true);
    expect(buildResults(record(), null, false).analysisUnlocked).toBe(false);
  });

  it("carries no dataset or scoring internals", () => {
    const sent = JSON.stringify(buildResults(record(), { from: 2, to: 1 }, true));
    expect(sent).not.toMatch(/kaggle|bothbosu|dataset|example|quote|"by"|agent|playerId|4417|outcome/i);
  });
});

describe("rank change", () => {
  const others = [score("a", 500, 5, 0), score("b", 200, 2, 0), score("c", 100, 1, 0)];

  it("ranks the Player before and after the call", () => {
    // p1 now has 225 B (2nd). Before this call they had 225 − 25 = 200 B and tie-broke on accuracy.
    expect(rankChange([...others, score("p1", 225, 3, 1)], "p1", { scored: true, delta: 25, right: 3, wrong: 1, total: 225 })).toEqual({ from: 3, to: 2 });
  });

  it("only knows the current rank when the floor hid the old total, or for practice", () => {
    expect(rankChange([...others, score("p1", 0, 0, 2)], "p1", { scored: true, delta: -150, right: 0, wrong: 2, total: 0 })).toEqual({ from: null, to: 4 });
    expect(rankChange([...others, score("p1", 225)], "p1", { scored: false, delta: 0, right: 3, wrong: 1, total: null })).toEqual({ from: null, to: 2 });
  });

  it("is null when the Player isn't on the board", () => {
    expect(rankChange(others, "p1", { scored: true, delta: 25, right: 1, wrong: 0, total: 25 })).toBeNull();
  });

  it("formats an unchanged or first rank plainly", () => {
    expect(buildResults(record(), { from: 7, to: 7 }, true).rank).toBe("#7 (no change)");
    expect(buildResults(record(), { from: null, to: 7 }, true).rank).toBe("#7");
  });
});

function fakeStore(over: Partial<ResultsStore> = {}): ResultsStore {
  return {
    async call(playerId, id) { return playerId === "p1" && id === "call-1" ? record() : null; },
    async scores() { return [score("a", 500, 5, 0), score("p1", 225, 3, 1)]; },
    async finishedCalls() { return 2; },
    ...over,
  };
}
const get = (handlers: ReturnType<typeof createResultsHandlers>, id = "call-1") =>
  handlers.GET(new Request(`https://tell.test/api/play/results/${id}`), id);

describe("results route", () => {
  it("needs a signed-in Player", async () => {
    const response = await get(createResultsHandlers({ authenticate: async () => null, store: fakeStore() }));
    expect(response.status).toBe(401);
  });

  it("hides calls the Player doesn't own", async () => {
    const response = await get(createResultsHandlers({ authenticate: async () => "p2", store: fakeStore() }));
    expect(response.status).toBe(404);
  });

  it("refuses a call that has no Verdict yet", async () => {
    const store = fakeStore({ async call() { return record({ phase: "verdict", result: undefined }); } });
    const response = await get(createResultsHandlers({ authenticate: async () => "p1", store }));
    expect(response.status).toBe(409);
  });

  it("returns the results with the rank change and the analysis unlock", async () => {
    const response = await get(createResultsHandlers({ authenticate: async () => "p1", store: fakeStore() }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { results } = await response.json() as { results: ReturnType<typeof buildResults> };
    expect(results).toMatchObject({ headline: "This was a scam call.", rank: "#2 (no change)", analysisUnlocked: true });
  });

  it("locks the analysis link below two finished calls", async () => {
    const store = fakeStore({ async finishedCalls() { return 1; } });
    const { results } = await (await get(createResultsHandlers({ authenticate: async () => "p1", store }))).json() as { results: { analysisUnlocked: boolean } };
    expect(results.analysisUnlocked).toBe(false);
  });

  it("degrades to 503 when the database fails", async () => {
    const store = fakeStore({ async call() { throw new Error("db down"); } });
    expect((await get(createResultsHandlers({ authenticate: async () => "p1", store }))).status).toBe(503);
  });
});

describe("results screen", () => {
  const html = (view = buildResults(record(), { from: 41, to: 12 }, true)) => renderToStaticMarkup(createElement(CallResults, { view }));

  it("renders the sections in order with text labels, not colour alone", () => {
    const out = html();
    const order = ["This was a scam call.", "When the caller gave a detail", "Your Verdict", "3 right · 1 wrong", "+25 B", "#41 → #12", "3 Scored calls left today"];
    const positions = order.map(text => out.indexOf(text.replace("'", "&#x27;")));
    expect(positions.every(p => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(out).toContain("Right");
    expect(out).toContain("Wrong");
  });

  it("links to another call, the Leaderboard and, once unlocked, the analysis", () => {
    expect(html()).toMatch(/href="\/play"[^>]*>Play another/);
    expect(html()).toMatch(/href="\/leaderboard"/);
    expect(html()).toMatch(/href="\/me"/);
    expect(html(buildResults(record(), null, false))).not.toMatch(/href="\/me"/);
    expect(html(buildResults(record(), null, false))).toContain("Play one more call to unlock your analysis");
  });

  it("says when the call was scored by rules", () => {
    const view = buildResults(record({ result: { ...base, scoredBy: "rules" } }), null, true);
    expect(html(view)).toContain("Scored by rules");
    expect(html()).not.toContain("Scored by rules");
  });
});
