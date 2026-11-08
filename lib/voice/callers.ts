/**
 * Browser-safe facts about the Challenge callers: IDs and the scenario-card
 * variable names each one needs. Deliberately holds NO prompts, names, orgs or
 * call types: browser code imports this, and anything here ships to the player.
 * Persona prompts live in personas.ts, which must stay server-only.
 */

export type ChallengeCallerId = "recruiter" | "onboarding" | "fraud_team" | "bank_callback";

export const CHALLENGE_CALLER_IDS: readonly ChallengeCallerId[] = [
  "recruiter",
  "onboarding",
  "fraud_team",
  "bank_callback",
];

const IDENTITY = ["player_name", "date_of_birth", "home_address"] as const;

/** Every dynamic variable each agent declares (a test keeps this in step with personas.ts). */
export const CALLER_VARIABLE_NAMES: Record<ChallengeCallerId, readonly string[]> = {
  recruiter: [...IDENTITY, "interview_role", "interview_slot"],
  onboarding: [...IDENTITY, "interview_role", "deposit_amount", "gift_card_code"],
  fraud_team: [...IDENTITY, "card_ending", "recent_charge", "live_code"],
  bank_callback: [...IDENTITY, "card_ending"],
};

export class VoiceRequestError extends Error {}

/** Validates and returns exactly the variables this caller declares. */
export function callVariables(
  callerId: ChallengeCallerId,
  variables: Record<string, string>,
): Record<string, string> {
  const declared = CALLER_VARIABLE_NAMES[callerId];
  const missing = declared.filter((k) => !variables[k]?.trim());
  if (missing.length) {
    throw new VoiceRequestError(`Missing variables for ${callerId}: ${missing.join(", ")}`);
  }
  return Object.fromEntries(declared.map((k) => [k, variables[k]!]));
}
