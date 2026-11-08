import { describe, expect, it } from 'vitest';
import { isStagePlan, pendingPlan, STAGE_PLANS } from '../lib/stage/plan';

describe('stage plan', () => {
  it('lists Plan A phone, Plan B browser voice and Plan C text in that order', () => {
    expect(STAGE_PLANS.map(plan => [plan.letter, plan.id])).toEqual([['A', 'phone'], ['B', 'voice'], ['C', 'text']]);
  });
  it('accepts only the three plan ids', () => {
    expect(['phone', 'voice', 'text'].every(isStagePlan)).toBe(true);
    for (const value of ['PHONE', 'scam', '', null, undefined, 1, { plan: 'voice' }]) expect(isStagePlan(value)).toBe(false);
  });
  it('reports a presenter tap the board has not acted on yet', () => {
    expect(pendingPlan(0, { plan: 'voice', seq: 1 })).toEqual({ plan: 'voice', seq: 1 });
    expect(pendingPlan(1, { plan: 'text', seq: 2 })).toEqual({ plan: 'text', seq: 2 });
  });
  it('treats a repeated tap on the same plan as a new request, so the operator can retry Plan B', () => {
    expect(pendingPlan(1, { plan: 'voice', seq: 2 })).toEqual({ plan: 'voice', seq: 2 });
  });
  it('ignores taps already handled, a day with no taps, and malformed state', () => {
    expect(pendingPlan(2, { plan: 'voice', seq: 2 })).toBeNull();
    expect(pendingPlan(3, { plan: 'voice', seq: 2 })).toBeNull();
    expect(pendingPlan(0, undefined)).toBeNull();
    expect(pendingPlan(0, { plan: 'scam', seq: 4 } as never)).toBeNull();
    expect(pendingPlan(0, { plan: 'voice', seq: Number.NaN })).toBeNull();
  });
});
