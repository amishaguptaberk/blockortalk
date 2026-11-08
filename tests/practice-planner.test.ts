import { describe, expect, it } from "vitest";
import { planDrill, readHistory, summarizeHistory, type HistoryEntry } from "../lib/practice/planner";
import type { NewsItem } from "../lib/practice/news";

const CUSTOMS: NewsItem = { title: "Got a call about a package held at customs?", link: "https://consumer.ftc.gov/consumer-alerts/2026/11/example-one", summary: "A delivery fee scam." };
const threats = async () => [CUSTOMS];
const noFeed = async (): Promise<NewsItem[]> => { throw new Error("blocked"); };

const tool = (id: string, name: string, args: object = {}) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
function scripted(replies: object[]) {
  let i = 0;
  const seen: unknown[][] = [];
  return {
    seen,
    llm: {
      model: "fake-nemotron",
      async chat({ messages }: { messages: unknown[] }) {
        seen.push(structuredClone(messages));
        return { message: replies[Math.min(i++, replies.length - 1)] as any, model: "fake-nemotron" };
      },
    },
  };
}

const leakedKaisCode: HistoryEntry[] = [
  { kind: "scenario", id: "fraud_team", verdict: "Real", leaked: ["Corvanta one-time code"] },
  { kind: "scenario", id: "onboarding", verdict: "Scam", leaked: [] },
];

describe("history scoring", () => {
  it("counts a code given to a hijacked caller against rules 1 and 3", () => {
    const s = summarizeHistory(leakedKaisCode);
    expect(s.rules[0]).toMatchObject({ rule: 1, broken: 1, kept: 1 });
    expect(s.rules[2]).toMatchObject({ rule: 3, broken: 1 });
    expect([1, 3]).toContain(s.weakest_rule);
  });

  it("counts calling a real caller a scam as a false alarm on rule 4", () => {
    const s = summarizeHistory([{ kind: "scenario", id: "recruiter", verdict: "Scam", leaked: [] }]);
    expect(s.false_alarms).toBe(1);
    expect(s.weakest_rule).toBe(4);
  });

  it("drops history entries it can't check", () => {
    expect(readHistory([{ kind: "scenario", id: "nope", verdict: "Real" }, { kind: "card", id: "customs-fee", safe: true }, "junk", { kind: "scenario", id: "recruiter", verdict: "Real", leaked: [] }])).toEqual([{ kind: "scenario", id: "recruiter", verdict: "Real", leaked: [] }]);
  });
});

describe("fixed plan", () => {
  it("runs without Nemotron, says so, and targets the weakest rule with a scenario", async () => {
    const plan = await planDrill({ history: [{ kind: "scenario", id: "fraud_team", verdict: "Real", leaked: ["Corvanta one-time code"] }], threats });
    expect(plan.path).toBe("fixed");
    expect(plan.fallback_reason).toMatch(/NVIDIA_API_KEY/);
    expect(plan.target_rule).toBe(1);
    expect(plan.drill).toMatchObject({ kind: "scenario", id: "onboarding" });
    expect(plan.news).toBeNull();
    expect(plan.steps.map(s => s.tool)).toEqual(["get_player_history", "get_current_threats", "list_drills", "choose_drill"]);
  });

  it("gives a player who turned away a real caller a real caller to check", async () => {
    const plan = await planDrill({ history: [{ kind: "scenario", id: "recruiter", verdict: "Scam", leaked: [] }], threats: noFeed });
    expect(plan.target_rule).toBe(4);
    expect(plan.drill).toMatchObject({ kind: "scenario", id: "bank_callback" });
  });

  it("still plans a first drill when the FTC feed is down", async () => {
    const plan = await planDrill({ history: [], threats: noFeed });
    expect(plan.target_rule).toBe(1);
    expect(plan.news).toBeNull();
    expect(plan.steps[1]!.result_summary).toBe("feed unavailable");
  });

  it("never names a call type in the reason shown before the call", async () => {
    for (const history of [[], leakedKaisCode, [{ kind: "scenario", id: "recruiter", verdict: "Scam", leaked: [] }] as HistoryEntry[]]) {
      const plan = await planDrill({ history, threats });
      expect(plan.reason).not.toMatch(/\b(scam|real|legit|hijack|fake)/i);
    }
  });
});

describe("agent path", () => {
  it("lets Nemotron call the tools and choose, and logs each step", async () => {
    const { llm, seen } = scripted([
      { content: null, tool_calls: [tool("a", "get_player_history"), tool("b", "get_current_threats"), tool("c", "list_drills")] },
      { content: null, tool_calls: [tool("d", "choose_drill", { kind: "scenario", id: "fraud_team", target_rule: 3, reason: "She knows your card ending. Practise not treating that as proof." })] },
    ]);
    const plan = await planDrill({ history: leakedKaisCode, llm, threats });
    expect(plan.path).toBe("agent");
    expect(plan.model).toBe("fake-nemotron");
    expect(plan.drill).toMatchObject({ kind: "scenario", id: "fraud_team", caller: "Kai" });
    expect(plan.target_rule).toBe(3);
    expect(plan.reason).toBe("She knows your card ending. Practise not treating that as proof.");
    expect(plan.steps.map(s => [s.tool, s.by])).toEqual([["get_player_history", "nemotron"], ["get_current_threats", "nemotron"], ["list_drills", "nemotron"], ["choose_drill", "nemotron"]]);
    // The model is never told which scenario callers are scams.
    expect(JSON.stringify(seen.at(-1))).not.toMatch(/Hijacked|"type":"Scam"/);
  });

  it("sends an invalid choice back to the model, then accepts the fix", async () => {
    const { llm } = scripted([
      { content: null, tool_calls: [tool("a", "choose_drill", { kind: "scenario", id: "fraud_team", target_rule: 2, reason: "Pressure." })] },
      { content: null, tool_calls: [tool("b", "choose_drill", { kind: "scenario", id: "onboarding", target_rule: 2, reason: "A deadline is pressure. Practise slowing down." })] },
    ]);
    const plan = await planDrill({ history: [], llm, threats });
    expect(plan.path).toBe("agent");
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0]!.error).toMatch(/tests rules 1, 3, 4/);
    expect(plan.drill.id).toBe("onboarding");
  });

  it("rewrites a reason that gives the caller away", async () => {
    const { llm } = scripted([{ content: null, tool_calls: [tool("a", "choose_drill", { kind: "scenario", id: "fraud_team", target_rule: 3, reason: "Kai is a hijacked caller, watch out." })] }]);
    const plan = await planDrill({ history: leakedKaisCode, llm, threats });
    expect(plan.path).toBe("agent");
    expect(plan.reason).not.toMatch(/hijack/i);
    expect(plan.reason).toMatch(/rule 3/);
    expect(plan.steps.at(-1)!.result_summary).toMatch(/rewritten by code/);
  });

  it("won't pair a scenario with an FTC headline", async () => {
    const { llm } = scripted([{ content: null, tool_calls: [tool("a", "choose_drill", { kind: "scenario", id: "onboarding", target_rule: 2, reason: "Practise this.", news_link: CUSTOMS.link })] }, { content: "done" }]);
    const plan = await planDrill({ history: [], llm, threats });
    expect(plan.rejected[0]!.error).toMatch(/headline stays off the practice call/);
  });

  it("falls back to the fixed plan on an error, and says so", async () => {
    const plan = await planDrill({ history: leakedKaisCode, llm: { model: "x", async chat() { throw new Error("HTTP 500"); } }, threats });
    expect(plan.path).toBe("fixed");
    expect(plan.fallback_reason).toMatch(/agent failed: HTTP 500/);
    expect(plan.steps.some(s => s.tool === "fallback")).toBe(true);
  });

  it("falls back when the model runs past the time limit", async () => {
    const slow = {
      model: "slow",
      chat: ({ signal }: { signal: AbortSignal }) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
    };
    const plan = await planDrill({ history: [], llm: slow, threats, timeoutMs: 30 });
    expect(plan.path).toBe("fixed");
    expect(plan.fallback_reason).toMatch(/timed out/);
  });

  it("falls back when the model never chooses", async () => {
    const { llm } = scripted([{ content: "I think a card would be good." }]);
    const plan = await planDrill({ history: [], llm, threats });
    expect(plan.path).toBe("fixed");
    expect(plan.fallback_reason).toMatch(/never chose/);
  });
});

describe("summarizeHistory", () => {
  it("treats a new player as untested on every rule and starts at rule 1", () => {
    const s = summarizeHistory([]);
    expect(s.drills).toBe(0);
    expect(s.rules.every(r => r.broken === 0 && r.kept === 0)).toBe(true);
    expect(s.weakest_rule).toBe(1);
  });

  it("counts trusting the caller who knew your details against rule 3, even with nothing leaked", () => {
    const s = summarizeHistory([{ kind: "scenario", id: "fraud_team", verdict: "Real", leaked: [] }]);
    expect(s.rules[2]).toMatchObject({ rule: 3, broken: 1, kept: 0 });
    expect(s.rules[0]).toMatchObject({ rule: 1, broken: 0, kept: 1 });
    expect(s.weakest_rule).toBe(3);
  });

  it("counts trusting a scam caller as pressure that worked (rule 2)", () => {
    const s = summarizeHistory([{ kind: "scenario", id: "onboarding", verdict: "Real", leaked: [] }]);
    expect(s.rules[1]).toMatchObject({ rule: 2, broken: 1 });
    expect(s.weakest_rule).toBe(2);
  });
});

describe("POST /api/practice plan", () => {
  const post = async (body: unknown, origin = "http://localhost") => {
    const { POST } = await import("../app/api/practice/route");
    return POST(new Request("http://localhost/api/practice", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));
  };

  it("plans from the history the browser sends, without Nemotron or the feed", async () => {
    const key = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    try {
      const res = await post({ action: "plan", history: [{ kind: "scenario", id: "recruiter", verdict: "Scam", leaked: [] }, { kind: "bogus" }] });
      expect(res.status).toBe(200);
      const { plan } = await res.json() as { plan: Awaited<ReturnType<typeof planDrill>> };
      expect(plan.path).toBe("fixed");
      expect(plan.history.drills).toBe(1);
      expect(plan.target_rule).toBe(4);
      expect(plan.drill).toMatchObject({ kind: "scenario", id: "bank_callback" });
    } finally {
      globalThis.fetch = realFetch;
      if (key !== undefined) process.env.NVIDIA_API_KEY = key;
    }
  });

  it("refuses requests from other sites", async () => {
    const res = await post({ action: "plan", history: [] }, "https://evil.example");
    expect(res.status).toBe(403);
  });
});

describe("review fixes", () => {
  it("never shows the model anything that tells scenario callers apart by call type", async () => {
    const { llm, seen } = scripted([
      { content: null, tool_calls: [tool("a", "list_drills")] },
      { content: null, tool_calls: [tool("b", "choose_drill", { kind: "scenario", id: "fraud_team", target_rule: 3, reason: "Practise." })] },
    ]);
    await planDrill({ history: [], llm, threats });
    const listed = JSON.parse((seen[1]!.at(-1) as { content: string }).content);
    const shapes = listed.scenarios.map((s: object) => JSON.stringify(Object.entries(s).filter(([k]) => !["id", "caller", "org", "theme", "direction", "rules"].includes(k))));
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).toBe("[]");
  });

  it("after a false alarm, gives a real caller to check even if the model picks something else", async () => {
    const { llm } = scripted([{ content: null, tool_calls: [tool("a", "choose_drill", { kind: "scenario", id: "fraud_team", target_rule: 4, reason: "Practise calling back." })] }]);
    const plan = await planDrill({ history: [{ kind: "scenario", id: "recruiter", verdict: "Scam", leaked: [] }], llm, threats });
    expect(plan.drill).toMatchObject({ kind: "scenario", id: "bank_callback" });
    expect(plan.steps.some(s => /false alarm/.test(s.result_summary))).toBe(true);
  });

  it("keeps rejected model reasons out of the plan", async () => {
    const { llm } = scripted([
      { content: null, tool_calls: [tool("a", "choose_drill", { kind: "scenario", id: "fraud_team", target_rule: 2, reason: "Kai is a hijacked caller" })] },
      { content: null, tool_calls: [tool("b", "choose_drill", { kind: "scenario", id: "onboarding", target_rule: 2, reason: "Practise slowing down." })] },
    ]);
    const plan = await planDrill({ history: [], llm, threats });
    expect(plan.rejected).toHaveLength(1);
    expect(JSON.stringify(plan)).not.toMatch(/hijacked/i);
  });

  it("rejects a news link that wasn't in today's alerts", async () => {
    const { llm } = scripted([
      { content: null, tool_calls: [tool("a", "choose_drill", { kind: "scenario", id: "onboarding", target_rule: 1, reason: "Practise.", news_link: "https://evil.example/x" })] },
      { content: null, tool_calls: [tool("b", "choose_drill", { kind: "scenario", id: "onboarding", target_rule: 1, reason: "Practise." })] },
    ]);
    const plan = await planDrill({ history: [], llm, threats });
    expect(plan.rejected[0]!.error).toMatch(/get_current_threats/);
    expect(plan.news).toBeNull();
  });

  it("caps model-supplied ids before they reach the player", async () => {
    const long = "x".repeat(500);
    const { llm } = scripted([
      { content: null, tool_calls: [tool("a", "choose_drill", { kind: long, id: long, target_rule: 1, reason: "x" })] },
      { content: null, tool_calls: [tool("b", "choose_drill", { kind: "scenario", id: "onboarding", target_rule: 1, reason: "Practise." })] },
    ]);
    const plan = await planDrill({ history: [], llm, threats });
    expect(JSON.stringify(plan)).not.toMatch(/x{41}/);
  });

  it("falls back after three invalid choices", async () => {
    const { llm } = scripted([{ content: null, tool_calls: [tool("a", "choose_drill", { kind: "card", id: "nope", target_rule: 1, reason: "x" })] }]);
    const plan = await planDrill({ history: [], llm, threats });
    expect(plan.path).toBe("fixed");
    expect(plan.fallback_reason).toMatch(/three invalid choices/);
    expect(plan.rejected).toHaveLength(3);
  });

  it("stops running tools past the step cap", async () => {
    const { llm, seen } = scripted([
      { content: null, tool_calls: [tool("a", "list_drills"), tool("b", "list_drills"), tool("c", "list_drills")] },
      { content: null, tool_calls: [tool("d", "choose_drill", { kind: "scenario", id: "fraud_team", target_rule: 3, reason: "Practise." })] },
    ]);
    const plan = await planDrill({ history: [], llm, threats, maxToolCalls: 2 });
    expect(plan.steps.filter(s => s.tool === "list_drills")).toHaveLength(2);
    expect(JSON.stringify(seen[1]!.at(-1))).toMatch(/step limit reached/);
  });

  it("keeps only the last 30 history entries", () => {
    const old = Array.from({ length: 40 }, () => ({ kind: "scenario" as const, id: "onboarding" as const, verdict: "Scam" as const, leaked: ["card number"] }));
    const recent = Array.from({ length: 30 }, () => ({ kind: "scenario" as const, id: "recruiter" as const, verdict: "Real" as const, leaked: [] as string[] }));
    expect(readHistory([...old, ...recent]).every(e => e.id === "recruiter")).toBe(true);
  });

  it("fetches today's alerts once when the agent times out mid-fetch", async () => {
    let fetches = 0;
    const slowFeed = () => { fetches++; return new Promise<NewsItem[]>(resolve => setTimeout(() => resolve([CUSTOMS]), 60)); };
    const { llm } = scripted([{ content: null, tool_calls: [tool("a", "get_current_threats")] }, { content: "thinking" }]);
    const plan = await planDrill({ history: [], llm, threats: slowFeed, timeoutMs: 20 });
    expect(plan.path).toBe("fixed");
    expect(plan.news).toBeNull();
    expect(fetches).toBe(1);
  });

  it("doesn't pass upstream error bodies to the player", async () => {
    const err = Object.assign(new Error("Nemotron m HTTP 500: secret upstream body with internal details"), { status: 500 });
    const plan = await planDrill({ history: [], llm: { model: "x", async chat() { throw err; } }, threats });
    expect(plan.fallback_reason).toBe("agent failed: HTTP 500");
  });
});

describe("POST /api/practice plan: crafted history", () => {
  it("drops prototype-key ids instead of failing", async () => {
    const { POST } = await import("../app/api/practice/route");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    try {
      const body = { action: "plan", history: ["constructor", "toString", "__proto__"].map(id => ({ kind: "scenario", id, verdict: "Real", leaked: [] })) };
      const res = await POST(new Request("http://localhost/api/practice", { method: "POST", headers: { origin: "http://localhost" }, body: JSON.stringify(body) }));
      expect(res.status).toBe(200);
      const result = await res.json() as { plan: Awaited<ReturnType<typeof planDrill>> };
      expect(result.plan.history.drills).toBe(0);
    } finally { globalThis.fetch = realFetch; }
  });
});
