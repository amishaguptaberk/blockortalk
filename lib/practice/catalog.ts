/**
 * Browser-safe practice catalog: what the player sees before and during a call.
 * Deliberately holds NO call types (real, scam, hijacked) for the scenarios. Those
 * live server-side in lib/practice/script.ts and are revealed only after a verdict.
 */
import type { ChallengeCallerId } from "../voice/callers";

/** Every card value is fictional. */
export const IDENTITY = {
  player_name: "Alex",
  date_of_birth: "March 14, 1991",
  home_address: "418 Pecan Hollow Drive, Plano, Texas",
} as const;

export type ScenarioId = "recruiter" | "onboarding" | "fraud_team" | "bank_callback";

export interface Scenario {
  id: ScenarioId;
  agent: ChallengeCallerId;
  caller: string;
  org: string;
  theme: "Jobs" | "Banking";
  /** Who calls whom, in the player's words. */
  direction: "They call you" | "You call them";
  card: string;
  /** Fictional details on the card the player should protect. */
  protect: { label: string; value: string }[];
  /** A code that arrives mid-call; shown when the caller brings it up. */
  liveCode?: { label: string; value: string };
  /** Dynamic variables for this caller's ElevenLabs agent. */
  voiceVariables: Record<string, string>;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "recruiter",
    agent: "recruiter",
    caller: "Yui",
    org: "Bluebonnet Labs recruiting",
    theme: "Jobs",
    direction: "They call you",
    card: "You applied for the operations analyst role at Bluebonnet Labs. Your candidate portal shows an interview on Tuesday at 10 AM.",
    protect: [
      { label: "Date of birth", value: IDENTITY.date_of_birth },
      { label: "Home address", value: IDENTITY.home_address },
    ],
    voiceVariables: { ...IDENTITY, interview_role: "operations analyst", interview_slot: "Tuesday at 10 AM" },
  },
  {
    id: "onboarding",
    agent: "onboarding",
    caller: "Ren",
    org: "Bluebonnet Labs onboarding",
    theme: "Jobs",
    direction: "They call you",
    card: "You have an interview coming up for the operations analyst role at Bluebonnet Labs. You also bought a $350 gift card for a friend's birthday.",
    protect: [
      { label: "Gift-card code", value: "4729" },
      { label: "Date of birth", value: IDENTITY.date_of_birth },
      { label: "Home address", value: IDENTITY.home_address },
    ],
    voiceVariables: { ...IDENTITY, interview_role: "operations analyst", deposit_amount: "$350", gift_card_code: "4729" },
  },
  {
    id: "fraud_team",
    agent: "fraud_team",
    caller: "Kai",
    org: "Corvanta Bank fraud team",
    theme: "Banking",
    direction: "They call you",
    card: "Your Corvanta card ends in 4417. Yesterday you spent $23.40 at a restaurant. A one-time code may arrive on your phone during the call.",
    protect: [
      { label: "Date of birth", value: IDENTITY.date_of_birth },
      { label: "Home address", value: IDENTITY.home_address },
    ],
    liveCode: { label: "Corvanta one-time code", value: "551 274" },
    voiceVariables: { ...IDENTITY, card_ending: "4417", recent_charge: "$23.40 at a restaurant yesterday", live_code: "551 274" },
  },
  {
    id: "bank_callback",
    agent: "bank_callback",
    caller: "Aki",
    org: "Corvanta Bank",
    theme: "Banking",
    direction: "You call them",
    card: "Someone called about your Corvanta card ending in 4417. You're calling Corvanta back on the number in your bank app to check.",
    protect: [
      { label: "Date of birth", value: IDENTITY.date_of_birth },
      { label: "Home address", value: IDENTITY.home_address },
    ],
    voiceVariables: { ...IDENTITY, card_ending: "4417" },
  },
];

export const RULES = [
  { n: 1, text: "Never share codes, PINs, passwords, your SSN or identity details." },
  { n: 2, text: "Pressure is the tell." },
  { n: 3, text: "Knowing your details doesn't prove who's calling." },
  { n: 4, text: "Hang up and call back on a number you already have." },
] as const;
