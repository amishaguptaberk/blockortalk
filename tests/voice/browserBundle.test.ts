import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// What actually ships to the player's browser for a voice call.
async function browserBundle(): Promise<string> {
  const out = await build({
    entryPoints: ["lib/voice/browserCall.ts"],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  return out.outputFiles[0]!.text;
}

describe("browser voice bundle", () => {
  it("carries no persona prompts, so the page can't reveal who is a scam", async () => {
    const js = await browserBundle();
    for (const giveaway of [
      "You are Kai",
      "You are Ren",
      "fake equipment-deposit scam",
      "This is the legitimate bank",
      "Training-drill rules",
      "hijacked",
    ]) {
      expect(js, giveaway).not.toContain(giveaway);
    }
  }, 30_000);
});

// The Challenge board as it ships: its voice start must pull in no persona module.
async function boardBundle(): Promise<string> {
  const out = await build({
    entryPoints: ["app/challenge/ChallengeBoard.tsx"],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    logLevel: "silent",
    jsx: "automatic",
    external: ["react", "react/*", "react-dom"],
    loader: { ".css": "empty" },
  });
  return out.outputFiles[0]!.text;
}

describe("challenge board bundle", () => {
  it("starts Yui by voice without shipping prompts, call types or secret codes", async () => {
    const js = await boardBundle();
    expect(js).toContain("operations analyst");
    for (const giveaway of [
      "You are Kai",
      "You are Ren",
      "You are Yui",
      "Training-drill rules",
      "hijacked",
      "legitimate",
      "KQ7R-2M4X-9PLT",
      /\bscam\b/,
    ]) {
      if (typeof giveaway === "string") expect(js, giveaway).not.toContain(giveaway);
      else expect(js).not.toMatch(giveaway);
    }
  }, 30_000);
});
