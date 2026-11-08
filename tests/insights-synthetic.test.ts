import { describe, expect, it } from 'vitest';
import { insightTotals, MIN_PLAYERS, outcomeOf, type Scenario } from '../lib/season/analysis';
import { scenarios as publicScenarios } from '../lib/season/scenarios/server';
import { buildSyntheticDataset, SYNTHETIC_PLAYERS } from '../lib/insights/synthetic';

const scenarios: Scenario[] = publicScenarios;

describe('synthetic demo data', () => {
  const data = buildSyntheticDataset(scenarios);

  it('is about 200 Players, each with a few calls', () => {
    expect(SYNTHETIC_PLAYERS).toBe(200);
    expect(data.players).toHaveLength(200);
    expect(data.calls.length).toBeGreaterThan(400);
    expect(data.calls.length).toBeLessThan(1500);
  });

  it('is deterministic, so a second seed writes the same rows', () => {
    expect(buildSyntheticDataset(scenarios)).toEqual(data);
  });

  it('uses addresses that cannot be real and unique, valid nicknames', () => {
    expect(new Set(data.players.map(p => p.email)).size).toBe(200);
    expect(new Set(data.players.map(p => p.nickname.toLowerCase())).size).toBe(200);
    for (const player of data.players) {
      expect(player.email).toMatch(/^[a-z0-9-]+@synthetic\.invalid$/);
      expect(player.nickname.length).toBeGreaterThanOrEqual(3);
      expect(player.nickname.length).toBeLessThanOrEqual(20);
    }
  });

  it('gives every call a stored outcome that matches the shared outcome rule', () => {
    const known = new Set(scenarios.map(s => s.id));
    for (const call of data.calls) {
      expect(known.has(call.scenarioId)).toBe(true);
      expect(call.outcome).toBe(outcomeOf(call.version, call.verdict, call.leaked));
      expect(call.playerIndex).toBeGreaterThanOrEqual(0);
      expect(call.playerIndex).toBeLessThan(200);
    }
  });

  it('produces both visible and hidden groups so the demo shows the privacy rule', () => {
    const rows = data.calls.map(call => {
      const scenario = scenarios.find(s => s.id === call.scenarioId)!;
      return { playerId: String(call.playerIndex), scenarioId: call.scenarioId, category: scenario.category, tactic: scenario.tactic, version: call.version, verdict: call.verdict, leaked: call.leaked, synthetic: true };
    });
    const groups = insightTotals(rows, { include: 'synthetic' });
    expect(groups.filter(g => !g.hidden).length).toBeGreaterThanOrEqual(8);
    expect(groups.filter(g => g.hidden).length).toBeGreaterThanOrEqual(1);
    for (const group of groups) if (!group.hidden) expect(group.players).toBeGreaterThanOrEqual(MIN_PLAYERS);
  });
});
