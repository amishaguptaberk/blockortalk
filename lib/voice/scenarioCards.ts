/**
 * Browser-safe scenario-card values for browser-voice calls. Copied from the
 * recruiter persona's dynamic variables in personas.ts (a test keeps them in
 * step), so the Challenge board can start Yui's call without importing the
 * persona prompts. Only callers playable by browser voice are listed.
 */
import type { ChallengeCallerId } from "./callers";

export const BROWSER_VOICE_VARIABLES = {
  recruiter: {
    player_name: "Alex",
    date_of_birth: "March 14, 1991",
    home_address: "418 Pecan Hollow Drive, Plano, Texas",
    interview_role: "operations analyst",
    interview_slot: "Tuesday at 10 AM",
  },
} as const satisfies Partial<Record<ChallengeCallerId, Record<string, string>>>;
