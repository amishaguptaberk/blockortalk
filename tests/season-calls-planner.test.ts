import { expect, test } from 'vitest';
import { createCallPlanner, fixedLines } from '../lib/season/calls/planner';
import { scenarios } from '../lib/season/scenarios/server';

const scenario = scenarios[0];
const examples = Array.from({ length: 5 }, (_, i) => ({ id: String(i), dialogue: 'Untrusted example', label: 0 as const, source: 'fixture' }));
const safe = ['Hello from Puffinvale Bank about your practice notice.', 'A practice purchase is waiting for review.', 'Please review the notice through your own saved app.'];
function model(lines: unknown) { return { chat: async () => ({ message: { tool_calls: [{ function: { name: 'write_steps', arguments: JSON.stringify({ lines }) } }] } }) }; }

test('Nemotron receives five reference examples and produces only the first three spoken lines', async () => {
  let received: unknown;
  const plan = createCallPlanner({ examples: async (_category, version) => { expect(version).toBe('real'); return examples; },
    model: { chat: async request => { received = request; return model(safe).chat(); } } });
  expect(await plan(scenario, 'real')).toEqual(safe);
  expect(JSON.stringify(received)).toContain('Untrusted example');
  expect(JSON.stringify(received)).not.toContain(scenario.secrets[0].value);
});

test('missing dependencies, invalid model lines, contact data, secret values and giveaways fall back to spoken lines', async () => {
  for (const lines of [[], [...safe, 'fourth'], ['Introduce this caller', ...safe.slice(1)],
    ['This is a real call from Puffinvale Bank.', ...safe.slice(1)], ['I am a genuine caller from Puffinvale Bank.', ...safe.slice(1)], ['An authentic caller is speaking to you now.', ...safe.slice(1)], ['This is a scam caller.', ...safe.slice(1)], ['Use https://example.com now', ...safe.slice(1)],
    ['Your code is eight two oh one', ...safe.slice(1)], ['Please read your PIN now.', ...safe.slice(1)],
    ['Please send your gift card code.', ...safe.slice(1)], ['Please pay by wire transfer now.', ...safe.slice(1)], ['Meet at 124 Pecan Road.', ...safe.slice(1)], ['Email player@example.com', ...safe.slice(1)], ['Call 212-555-0123', ...safe.slice(1)]]) {
    expect(await createCallPlanner({ examples: async () => examples, model: model(lines) })(scenario, 'real')).toEqual(fixedLines(scenario, 'real'));
  }
  expect(await createCallPlanner({ examples: async () => { throw new Error('offline'); }, model: model(safe) })(scenario, 'real')).toEqual(fixedLines(scenario, 'real'));
  expect(await createCallPlanner({ examples: async () => examples, model: null })(scenario, 'scam')).toEqual(fixedLines(scenario, 'scam'));
  expect(fixedLines(scenario, 'scam')[0]).toMatch(/^Hello/);
});


test('a missed tactic is named only as pressure, never as a past call or a score', async () => {
  let system = '';
  const plan = createCallPlanner({ examples: async () => examples, model: { chat: async request => { system = request.messages[0].content; return model(safe).chat(); } } });
  expect(await plan(scenario, 'real', { press: true })).toEqual(safe);
  expect(system).toContain('missed this assigned pressure lever');
  expect(system).not.toContain('score');
  expect(await plan(scenario, 'real')).toEqual(safe);
  expect(system).not.toContain('missed this assigned pressure lever');
});

test('neutral real-world facts do not disclose the assigned caller identity', async () => {
  const lines = ['This practice notice uses a real-world example.', ...safe.slice(1)];
  expect(await createCallPlanner({ examples: async () => examples, model: model(lines) })(scenario, 'real')).toEqual(lines);
});
