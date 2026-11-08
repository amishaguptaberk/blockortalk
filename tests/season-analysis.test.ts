import { describe, expect, it } from 'vitest';
import { insightTotals, MIN_PLAYERS, outcomeOf, playerAnalysis, type CallRow, type Scenario } from '../lib/season/analysis';

const scenarios: Scenario[] = [
  { id: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof' },
  { id: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency' },
  { id: 'phishing', category: 'Phishing link texted mid-call', tactic: 'Urgency' },
  { id: 'irs', category: 'Government (IRS or SSN)', tactic: 'Authority' },
];

function row(over: Partial<CallRow> = {}): CallRow {
  return { playerId: 'p1', scenarioId: 'delivery', category: 'Delivery or customs fee', tactic: 'Urgency', version: 'scam', verdict: 'Scam', leaked: false, synthetic: false, ...over };
}

describe('outcomeOf', () => {
  const cases: [CallRow['version'], NonNullable<CallRow['verdict']>, boolean, string][] = [
    ['scam', 'Scam', false, 'caught'],
    ['scam', 'Scam', true, 'fell for'],
    ['scam', 'Real', false, 'fell for'],
    ['scam', 'Real', true, 'fell for'],
    ['scam', 'Unverified', false, 'caught'],
    ['scam', 'Unverified', true, 'fell for'],
    ['real', 'Real', false, 'trusted real'],
    ['real', 'Real', true, 'trusted real'],
    ['real', 'Scam', false, 'false alarm'],
    ['real', 'Scam', true, 'false alarm'],
    ['real', 'Unverified', false, 'trusted real'],
    ['real', 'Unverified', true, 'trusted real'],
  ];
  it.each(cases)('%s caller, verdict %s, leaked %s → %s', (version, verdict, leaked, outcome) => {
    expect(outcomeOf(version, verdict, leaked)).toBe(outcome);
  });
});

describe('playerAnalysis', () => {
  it('stays locked until two calls are finished', () => {
    expect(playerAnalysis([], scenarios)).toEqual({ locked: true, finished: 0, needed: 2 });
    expect(playerAnalysis([row()], scenarios)).toEqual({ locked: true, finished: 1, needed: 1 });
  });
  it('does not count an unfinished call', () => {
    expect(playerAnalysis([row(), row({ verdict: null })], scenarios)).toMatchObject({ locked: true, finished: 1 });
  });
  it('unlocks at two calls, and practice calls count', () => {
    expect(playerAnalysis([row(), row()], scenarios)).toMatchObject({ locked: false, finished: 2 });
  });

  // Three calls by one player, worked out by hand:
  //  1. scam, Urgency, leaked        → fell for  (missed)
  //  2. real, Details as proof, said Scam → false alarm (missed, real caller rejected)
  //  3. scam, Urgency, said Scam     → caught    (right)
  const three = [
    row({ scenarioId: 'delivery', leaked: true, verdict: 'Real' }),
    row({ scenarioId: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof', version: 'real', verdict: 'Scam' }),
    row({ scenarioId: 'phishing', category: 'Phishing link texted mid-call' }),
  ];
  it('counts missed and right by Tactic and by Category', () => {
    const result = playerAnalysis(three, scenarios);
    if (result.locked) throw new Error('should be unlocked');
    expect(result.byTactic).toEqual([
      { key: 'Details as proof', missed: 1, right: 0 },
      { key: 'Urgency', missed: 1, right: 1 },
    ]);
    expect(result.byCategory).toEqual([
      { key: 'Bank fraud alert', missed: 1, right: 0 },
      { key: 'Delivery or customs fee', missed: 1, right: 0 },
      { key: 'Phishing link texted mid-call', missed: 0, right: 1 },
    ]);
    expect(result.rejectedReal).toBe(1);
  });
  it('aims Try next at the weakest Tactic, in the Category they missed', () => {
    const rows = [
      row({ scenarioId: 'delivery', verdict: 'Real' }),
      row({ scenarioId: 'delivery', verdict: 'Real' }),
      row({ scenarioId: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof' }),
    ];
    const result = playerAnalysis(rows, scenarios);
    if (result.locked) throw new Error('should be unlocked');
    expect(result.weakest).toEqual({ tactic: 'Urgency', missed: 2, of: 2 });
    expect(result.tryNext).toBe('delivery');
  });
  it('lists the top 2 commonly missed and done right, ranked', () => {
    const rows = [
      row({ scenarioId: 'delivery', leaked: true }),
      row({ scenarioId: 'delivery', leaked: true }),
      row({ scenarioId: 'irs', category: 'Government (IRS or SSN)', tactic: 'Authority', leaked: true }),
      row({ scenarioId: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof', leaked: true }),
      row({ scenarioId: 'bank', category: 'Bank fraud alert', tactic: 'Details as proof', version: 'real', verdict: 'Real' }),
      row({ scenarioId: 'phishing', category: 'Phishing link texted mid-call' }),
      row({ scenarioId: 'phishing', category: 'Phishing link texted mid-call' }),
    ];
    const result = playerAnalysis(rows, scenarios);
    if (result.locked) throw new Error('should be unlocked');
    expect(result.commonlyMissed.tactics.map(e => e.key)).toEqual(['Urgency', 'Authority']);
    expect(result.commonlyMissed.categories.map(e => e.key)).toEqual(['Delivery or customs fee', 'Government (IRS or SSN)']);
    expect(result.doneRight.tactics.map(e => e.key)).toEqual(['Urgency', 'Details as proof']);
    expect(result.doneRight.categories.map(e => e.key)).toEqual(['Phishing link texted mid-call', 'Bank fraud alert']);
  });
  it('prefers the missed Category over a scenario the Player has played less', () => {
    const rows = [row({ scenarioId: 'phishing', category: 'Phishing link texted mid-call', leaked: true }), row({ scenarioId: 'phishing', category: 'Phishing link texted mid-call', leaked: true })];
    const result = playerAnalysis(rows, scenarios);
    if (result.locked) throw new Error('should be unlocked');
    expect(result.tryNext).toBe('phishing');
  });
  it('ignores synthetic rows, so they cannot unlock or skew a real analysis', () => {
    expect(playerAnalysis([row(), row({ synthetic: true })], scenarios)).toEqual({ locked: true, finished: 1, needed: 1 });
  });
  it('has no weakest spot or Try next when nothing was missed', () => {
    const result = playerAnalysis([row(), row()], scenarios);
    if (result.locked) throw new Error('should be unlocked');
    expect(result.weakest).toBeNull();
    expect(result.tryNext).toBeNull();
  });
});

describe('insightTotals', () => {
  const players = (n: number, over: Partial<CallRow> = {}) => Array.from({ length: n }, (_, i) => row({ playerId: `p${i}`, ...over }));

  it('hides a group with 4 distinct players and shows one with 5', () => {
    expect(MIN_PLAYERS).toBe(5);
    expect(insightTotals(players(4))).toEqual([{ category: 'Delivery or customs fee', tactic: 'Urgency', outcome: 'caught', hidden: true }]);
    expect(insightTotals(players(5))).toEqual([{ category: 'Delivery or customs fee', tactic: 'Urgency', outcome: 'caught', hidden: false, calls: 5, players: 5 }]);
  });
  it('counts distinct players, not calls', () => {
    const many = [...players(4), ...players(4), ...players(4)];
    expect(insightTotals(many)).toEqual([{ category: 'Delivery or customs fee', tactic: 'Urgency', outcome: 'caught', hidden: true }]);
    expect(insightTotals([...players(5), ...players(2)])[0]).toMatchObject({ hidden: false, calls: 7, players: 5 });
  });
  it('splits groups by outcome and skips unfinished calls', () => {
    const rows = [...players(5), ...players(5, { leaked: true }), row({ playerId: 'x', verdict: null })];
    const totals = insightTotals(rows);
    expect(totals.map(group => group.outcome).sort()).toEqual(['caught', 'fell for']);
  });
  it('includes or excludes synthetic rows', () => {
    const rows = [...players(3), ...players(3, { synthetic: true, playerId: 'syn' }).map((r, i) => ({ ...r, playerId: `s${i}` }))];
    expect(insightTotals(rows)[0]).toMatchObject({ hidden: true });
    expect(insightTotals(rows, { include: 'both' })[0]).toMatchObject({ hidden: false, players: 6 });
    expect(insightTotals(rows, { include: 'synthetic' })[0]).toMatchObject({ hidden: true });
    expect(insightTotals([...players(5, { synthetic: true })], { include: 'synthetic' })[0]).toMatchObject({ hidden: false, players: 5 });
    expect(insightTotals([...players(5, { synthetic: true })])).toEqual([]);
  });
  it('carries no identifying field or value', () => {
    const rows = players(6).map((r, i) => ({ ...r, playerId: `PLAYER-SECRET-${i}`, scenarioId: 'SCENARIO-ID' }));
    const text = JSON.stringify(insightTotals(rows));
    expect(text).not.toMatch(/PLAYER-SECRET|playerId|email|nickname|transcript|scenarioId|SCENARIO-ID/i);
    for (const group of insightTotals(rows)) expect(Object.keys(group).sort()).toEqual(['calls', 'category', 'hidden', 'outcome', 'players', 'tactic']);
  });
  it('never gives a count for a hidden group', () => {
    const [group] = insightTotals(players(2));
    expect(group).toEqual({ category: 'Delivery or customs fee', tactic: 'Urgency', outcome: 'caught', hidden: true });
    expect(group).not.toHaveProperty('calls');
    expect(group).not.toHaveProperty('players');
  });
});
