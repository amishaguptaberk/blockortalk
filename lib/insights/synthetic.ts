/**
 * Synthetic demo data for Carrier insights (docs/adr/0002): about 200 made-up Players and their
 * calls, so the dashboard has something to show before real totals clear the five-Player threshold.
 * Pure and deterministic, so seeding twice writes the same rows. Everything is marked synthetic by
 * the seeder and is labelled "Synthetic demo data" wherever it is shown.
 */
import { outcomeOf, type Outcome, type Scenario, type Tactic, type Verdict, type Version } from '../season/analysis.ts';

export const SYNTHETIC_PLAYERS = 200;
export const SYNTHETIC_EMAIL_DOMAIN = 'synthetic.invalid';

export type SyntheticPlayer = { email: string; nickname: string };
export type SyntheticCall = {
  /** Index into `players`; the seeder swaps it for the inserted Player id. */
  playerIndex: number;
  scenarioId: string;
  version: Version;
  verdict: Verdict;
  leaked: boolean;
  outcome: Outcome;
  /** Minutes before the seed time that the call started. */
  minutesAgo: number;
};

/** Small seeded generator (mulberry32), so no run depends on Math.random. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How often a Player falls for a scam leaning on each Tactic. A first pass for the demo. */
const FALL_RATE: Record<Tactic, number> = { 'Details as proof': 0.5, Urgency: 0.42, Authority: 0.36, Reward: 0.3, Fear: 0.2 };

function verdictFor(version: Version, tactic: Tactic, next: () => number): { verdict: Verdict; leaked: boolean } {
  if (version === 'scam') {
    const roll = next();
    if (roll < FALL_RATE[tactic] * 0.5) return { verdict: 'Real', leaked: false };
    if (roll < FALL_RATE[tactic]) return { verdict: next() < 0.5 ? 'Scam' : 'Unverified', leaked: true };
    return { verdict: next() < 0.85 ? 'Scam' : 'Unverified', leaked: false };
  }
  const roll = next();
  return { verdict: roll < 0.22 ? 'Scam' : roll < 0.4 ? 'Unverified' : 'Real', leaked: false };
}

export function buildSyntheticDataset(scenarios: readonly Scenario[], seed = 20261108): { players: SyntheticPlayer[]; calls: SyntheticCall[] } {
  const next = random(seed);
  const players = Array.from({ length: SYNTHETIC_PLAYERS }, (_, i): SyntheticPlayer => {
    const n = String(i + 1).padStart(3, '0');
    return { email: `demo-player-${n}@${SYNTHETIC_EMAIL_DOMAIN}`, nickname: `Demo${n}` };
  });
  const calls: SyntheticCall[] = [];
  players.forEach((_, playerIndex) => {
    const count = 3 + Math.floor(next() * 5); // 3 to 7 calls
    for (let i = 0; i < count; i++) {
      // Skew play towards the first scenarios, so the least-played Categories stay under five Players.
      const scenario = scenarios[Math.floor(Math.pow(next(), 1.6) * scenarios.length)]!;
      const version: Version = next() < 0.5 ? 'real' : 'scam';
      const { verdict, leaked } = verdictFor(version, scenario.tactic, next);
      calls.push({
        playerIndex, scenarioId: scenario.id, version, verdict, leaked,
        outcome: outcomeOf(version, verdict, leaked),
        minutesAgo: Math.floor(next() * 60 * 24 * 3),
      });
    }
  });
  return { players, calls };
}
