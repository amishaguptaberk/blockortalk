/**
 * The stage fallback switch for the live Kai call (docs/SPEC.md, "Stage call path").
 * Browser-safe: it holds no caller names, prompts or call types.
 *
 * Plan A is the phone call, placed by the operator outside the app (docs/STAGE.md).
 * Plans B and C are the board's browser voice and text modes.
 */
export type StagePlan = 'phone' | 'voice' | 'text';
/** `seq` counts presenter taps, so tapping the same plan again (a Plan B retry) is still a new request. */
export type StagePlanState = { plan: StagePlan; seq: number };

export const STAGE_PLANS: readonly { id: StagePlan; letter: 'A' | 'B' | 'C'; label: string }[] = [
  { id: 'phone', letter: 'A', label: 'Phone' },
  { id: 'voice', letter: 'B', label: 'Browser voice' },
  { id: 'text', letter: 'C', label: 'Text' },
];

export function isStagePlan(value: unknown): value is StagePlan {
  return value === 'phone' || value === 'voice' || value === 'text';
}

/** The presenter tap the board has not acted on yet, or null. A reloaded board starts from the day's last tap. */
export function pendingPlan(seen: number, state: StagePlanState | undefined): StagePlanState | null {
  if (!state || !isStagePlan(state.plan) || !Number.isInteger(state.seq) || state.seq <= seen) return null;
  return { plan: state.plan, seq: state.seq };
}
