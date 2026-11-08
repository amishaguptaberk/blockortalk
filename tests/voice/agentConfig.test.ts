import { describe, expect, it } from "vitest";
import { buildAgentConfig, NO_BEAT_TOOL_NOTE } from "../../lib/voice/agentConfig";
import { CHALLENGE_CALLER_IDS, PERSONAS } from "../../lib/voice/personas";

const DISCLOSURE =
  "It's recorded for your report. Say 'stop drill' anytime.";

// Real brands the personas must never name (docs/SPEC.md: fictional brands only).
const REAL_BRANDS = [
  "Chase", "Wells Fargo", "Bank of America", "Citi", "Capital One", "T-Mobile", "Verizon",
  "AT&T", "Amazon", "UPS", "FedEx", "USPS", "PayPal", "Venmo", "Zelle", "Apple", "Google",
  "Microsoft", "Walmart", "Target", "Best Buy",
];

describe.each(CHALLENGE_CALLER_IDS)("Challenge agent %s", (id) => {
  const cfg = buildAgentConfig(id);
  const agent = cfg.conversationConfig.agent!;
  const prompt = agent.prompt!.prompt!;

  it("opens every call with the fixed disclosure line, uninterruptible", () => {
    expect(agent.firstMessage!.startsWith(DISCLOSURE)).toBe(true);
    expect(agent.firstMessage).not.toContain("This is a Tell practice call from an AI voice");
    expect(agent.disableFirstMessageInterruptions).toBe(true);
  });

  it("is capped at 3 minutes and keeps no voice recording", () => {
    expect(cfg.conversationConfig.conversation!.maxDurationSeconds).toBe(180);
    expect(cfg.platformSettings!.privacy!.recordVoice).toBe(false);
    expect(cfg.platformSettings!.auth!.enableAuth).toBe(true);
  });

  it("declares a default for every variable its prompt and first message use", () => {
    const used = new Set(
      [...`${prompt} ${agent.firstMessage}`.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!),
    );
    const declared = Object.keys(
      (agent.dynamicVariables as any).dynamic_variable_placeholders as object,
    );
    expect([...used].sort()).toEqual(declared.sort());
  });

  it("never names a real company", () => {
    const text = `${prompt} ${agent.firstMessage}`;
    for (const brand of REAL_BRANDS) {
      expect(text, brand).not.toMatch(new RegExp(`\\b${brand.replace(/[&.]/g, "\\$&")}\\b`));
    }
  });

  it("can stop the drill: has end_call and the stop-drill rule", () => {
    expect(agent.prompt!.builtInTools!.endCall).toBeDefined();
    expect(prompt).toMatch(/stop drill/);
  });
});

describe("shared opening-line template", () => {
  it("is the same shape for every outbound caller, whatever the call type", () => {
    const outbound = CHALLENGE_CALLER_IDS.filter((id) => id !== "bank_callback");
    const shapes = outbound.map((id) =>
      PERSONAS[id].openingLine
        .replace(PERSONAS[id].displayName, "<name>")
        .replace(PERSONAS[id].claimedOrg, "<org>"),
    );
    expect(new Set(shapes).size).toBe(1);
  });
});

describe("anti-shortcut: voice", () => {
  // Call types live with the Challenge script, never in the voice layer; listed here only to test.
  const legit = new Set(["recruiter", "bank_callback"]);

  it("voice gender does not separate legit callers from the rest", () => {
    for (const gender of ["female", "male"] as const) {
      const ids = CHALLENGE_CALLER_IDS.filter((id) => PERSONAS[id].voiceGender === gender);
      expect(ids.some((id) => legit.has(id)), `${gender} has a legit caller`).toBe(true);
      expect(ids.some((id) => !legit.has(id)), `${gender} has a non-legit caller`).toBe(true);
    }
  });

  it("every agent has its own voice", () => {
    expect(new Set(CHALLENGE_CALLER_IDS.map((id) => PERSONAS[id].voiceId)).size).toBe(CHALLENGE_CALLER_IDS.length);
  });
});

describe("beat tool", () => {
  it("is only attached once there is a public https URL, and sends the secret and conversation ID", () => {
    expect(buildAgentConfig("fraud_team").conversationConfig.agent!.prompt!.tools).toEqual([]);
    const cfg = buildAgentConfig("fraud_team", {
      beatTool: { publicUrl: "https://tell.example.com", toolSecretId: "sec_1" },
    });
    const tool = cfg.conversationConfig.agent!.prompt!.tools![0] as any;
    expect(tool.apiSchema.url).toBe("https://tell.example.com/api/voice/beat");
    expect(tool.apiSchema.requestHeaders["X-Tell-Tool-Secret"]).toEqual({ secretId: "sec_1" });
    expect(tool.apiSchema.requestBodySchema.properties.conversation_id.dynamicVariable).toBe(
      "system__conversation_id",
    );
    expect(() =>
      buildAgentConfig("fraud_team", { beatTool: { publicUrl: "http://insecure.test", toolSecretId: "s" } }),
    ).toThrow(/https/);
  });

  it("sets exactly one value source on each body property (ElevenLabs rejects more)", () => {
    const cfg = buildAgentConfig("fraud_team", {
      beatTool: { publicUrl: "https://tell.example.com", toolSecretId: "sec_1" },
    });
    const props = (cfg.conversationConfig.agent!.prompt!.tools![0] as any).apiSchema.requestBodySchema
      .properties as Record<string, Record<string, unknown>>;
    const sources = ["description", "dynamicVariable", "isSystemProvided", "constantValue"];
    for (const [name, prop] of Object.entries(props)) {
      expect(sources.filter((s) => prop[s] !== undefined), name).toHaveLength(1);
    }
  });

  it("tells the agent to skip report_beat steps only when the tool is absent", () => {
    const without = buildAgentConfig("fraud_team").conversationConfig.agent!.prompt!.prompt!;
    const withTool = buildAgentConfig("fraud_team", {
      beatTool: { publicUrl: "https://tell.example.com", toolSecretId: "sec_1" },
    }).conversationConfig.agent!.prompt!.prompt!;
    expect(without).toContain(NO_BEAT_TOOL_NOTE);
    expect(withTool).not.toContain(NO_BEAT_TOOL_NOTE);
  });
});

describe("browser-safe caller variables", () => {
  it("lists exactly the variables each agent declares", async () => {
    const { CALLER_VARIABLE_NAMES } = await import("../../lib/voice/callers");
    for (const id of CHALLENGE_CALLER_IDS) {
      expect([...CALLER_VARIABLE_NAMES[id]].sort(), id).toEqual(Object.keys(PERSONAS[id].variables).sort());
    }
  });
});
