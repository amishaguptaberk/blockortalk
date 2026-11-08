import { describe, expect, it } from "vitest";
import { CALLER_VARIABLE_NAMES } from "../../lib/voice/callers";
import { PERSONAS } from "../../lib/voice/personas";
import { BROWSER_VOICE_VARIABLES } from "../../lib/voice/scenarioCards";

describe("browser-voice scenario card", () => {
  it("supplies every variable the recruiter agent declares", () => {
    for (const key of CALLER_VARIABLE_NAMES.recruiter) {
      expect(BROWSER_VOICE_VARIABLES.recruiter[key as keyof typeof BROWSER_VOICE_VARIABLES.recruiter], key).toBeTruthy();
    }
  });

  it("matches the recruiter persona's values exactly", () => {
    expect(BROWSER_VOICE_VARIABLES.recruiter).toEqual(PERSONAS.recruiter.variables);
  });
});
