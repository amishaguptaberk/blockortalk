import { describe, expect, it } from 'vitest';
import { createInsightsAnalyst, type ShownGroup } from '../lib/insights/analyst';

const groups: ShownGroup[] = [
  { category: 'Bank fraud alert', tactic: 'Details as proof', outcome: 'fell for', calls: 31, players: 24 },
  { category: 'Tech support', tactic: 'Fear', outcome: 'caught', calls: 18, players: 12 },
];

describe('Insights analyst', () => {
  it('sends the model totals and nothing else', async () => {
    let seen = '';
    const analyst = createInsightsAnalyst(async ({ system, user }) => { seen = `${system}\n${user}`; return 'Bank fraud alerts are the most common fall.'; });
    await analyst(groups, true);
    const user = JSON.parse(seen.split('\n').slice(-1)[0]!);
    expect(user.dataset).toBe('synthetic demo data');
    expect(user.groups).toEqual(groups);
    expect(JSON.stringify(user)).not.toMatch(/email|nickname|transcript|playerId/i);
    expect(seen).toMatch(/totals/i);
  });

  it('returns a clean summary as written', async () => {
    const analyst = createInsightsAnalyst(async () => '  Bank fraud alerts that lean on details as proof were fallen for 31 times by 24 Players.  ');
    expect(await analyst(groups, false)).toBe('Bank fraud alerts that lean on details as proof were fallen for 31 times by 24 Players.');
  });

  it('accepts a fenced answer from the model', async () => {
    const analyst = createInsightsAnalyst(async () => '```\nBank fraud alerts lead, with 31 calls.\n```');
    expect(await analyst(groups, false)).toBe('Bank fraud alerts lead, with 31 calls.');
  });

  it.each([
    ['an invented number', 'About 40 Players fell for bank fraud alerts.'],
    ['an email address', 'Contact someone@example.com about bank fraud alerts.'],
    ['a record id', 'Player 123e4567-e89b-12d3-a456-426614174000 fell for it.'],
    ['empty text', '   '],
    ['shaming words', 'Players were foolish to trust bank fraud alerts.'],
    ['dataset names', 'Kaggle examples suggest bank fraud alerts work.'],
    ['an overlong answer', 'Bank fraud alerts lead. '.repeat(40)],
  ])('rejects %s', async (_name, text) => {
    expect(await createInsightsAnalyst(async () => text)(groups, false)).toBeNull();
  });

  it('allows the numbers it was given, including 5', async () => {
    const analyst = createInsightsAnalyst(async () => 'Only groups of 5 or more Players are shown; 12 Players caught tech support scams.');
    expect(await analyst(groups, false)).not.toBeNull();
  });

  it('returns null on a model error or when no model is configured', async () => {
    expect(await createInsightsAnalyst(async () => { throw new Error('HTTP 500'); })(groups, false)).toBeNull();
    expect(await createInsightsAnalyst(undefined)(groups, false)).toBeNull();
  });

  it('does not ask the model anything when there are no visible groups', async () => {
    let called = false;
    const analyst = createInsightsAnalyst(async () => { called = true; return 'x'; });
    expect(await analyst([], false)).toBeNull();
    expect(called).toBe(false);
  });
});
