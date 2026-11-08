/** A caller line that actually asks for something the player should keep private. */

export type RiskHit = { quote: string; message: string };

const ASKS: { test: RegExp; message: string }[] = [
  {
    test: /gift[- ]card code|code on the back of your gift card/i,
    message: "They're asking for a gift-card code. Keep that private.",
  },
  {
    test: /one-time code|read it back/i,
    message: "They're asking for a sign-in code. Keep that private.",
  },
  {
    test: /\b(pin|password|passcode)\b/i,
    message: "They're asking for a secret. Keep that private.",
  },
  {
    test: /date of birth|home address|social security|\bssn\b/i,
    message: "They're asking you to confirm personal details. Keep those private.",
  },
];

/** The Kai line from lib/challenge/scenarios.ts. The landing preview uses this exact sentence. */
export const SIGN_IN_CODE_ASK = "I am sending a one-time code. Please read it back so I can block the attempt.";

/** A real opening that does not ask for a secret. */
export const BENIGN_OPENING = "Hi, is this Alex? This is Kai from Corvanta Bank fraud team. Do you have a quick minute?";

/**
 * Returns the evidence only when this line asks for a secret.
 * A warning such as "we will never ask for a code" is not a request.
 */
export function riskyRequest(text: string): RiskHit | null {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return null;
  const warning = /\b(never|won'?t|will not|do not|don't|not share)\b/i.test(line);
  const readsIt = /\bread (it|the|that|me)\b/i.test(line);
  if (warning && !readsIt) return null;
  for (const ask of ASKS) {
    if (ask.test.test(line)) {
      return { quote: line.length > 180 ? `${line.slice(0, 177)}…` : line, message: ask.message };
    }
  }
  return null;
}
