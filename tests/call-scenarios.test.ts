import { expect, test } from 'vitest';
import { scenarioCatalog } from '../lib/season/scenarios/catalog';

test('browser catalog offers the agreed Categories without caller answers', () => {
  expect(scenarioCatalog.map(row => row.category)).toEqual([
    'Bank fraud alert', 'Delivery or customs fee', 'Holiday gift card or travel deal',
    'Business invoice or CEO wire', 'Phishing link texted mid-call', 'Tech support',
    'Government (IRS or SSN)', 'Prize or sweepstakes', 'Crypto or investment', 'Phone carrier port-out',
    'Refund or billing error', 'Insurance policy check', 'Subscription or sales call', 'Wrong number',
  ]);
  for (const row of scenarioCatalog) expect(Object.keys(row).sort()).toEqual(['card', 'category', 'id', 'org', 'secrets']);
});

import { TRAIN_TOPIC_LABEL, scenarioSources } from '../lib/season/scenarios/corpus';
import { scenarios } from '../lib/season/scenarios/server';

test('a preferred example topic is a training type for that Version only', () => {
  expect(scenarioSources['Refund or billing error']?.topic).toEqual({ scam: 'refund' });
  expect(scenarioSources['Insurance policy check']?.topic).toEqual({ real: 'insurance' });
  expect(scenarioSources['Subscription or sales call']?.topic).toEqual({ real: 'telemarketing' });
  expect(scenarioSources['Wrong number']?.topic).toEqual({ real: 'wrong' });
  for (const source of Object.values(scenarioSources)) for (const [version, topic] of Object.entries(source.topic)) {
    expect(TRAIN_TOPIC_LABEL[topic as keyof typeof TRAIN_TOPIC_LABEL]).toBe(version);
  }
});
import { redact } from '../lib/policy/redact';
import { leakedSecrets } from '../lib/practice/leaks';

test('each stored Version has four outlines ending with its approved action', () => {
  expect(scenarios).toHaveLength(14);
  expect(scenarios.map(row => [row.id, row.tactic])).toEqual([
    ['bank', 'Details as proof'], ['delivery', 'Urgency'], ['holiday', 'Reward'], ['business', 'Authority'],
    ['phishing', 'Urgency'], ['support', 'Fear'], ['government', 'Authority'], ['prize', 'Reward'],
    ['investment', 'Reward'], ['carrier', 'Details as proof'], ['refund', 'Reward'], ['insurance', 'Fear'],
    ['sales', 'Reward'], ['wrong-number', 'Details as proof'],
  ]);
  for (const row of scenarios) {
    expect(row.versions.real.steps).toHaveLength(4);
    expect(row.versions.scam.steps).toHaveLength(4);
    expect(row.versions.real.steps[3]).toBe(row.versions.real.next_step);
    expect(row.versions.scam.steps[3]).toBe(row.versions.scam.ask_line);
    expect(row.versions.scam.ask_line).toContain('Practice protection code');
  }
  const phishing = scenarios.find(row => row.id === 'phishing')!;
  expect(phishing.versions.scam.steps[2]).toContain('Send the caller link');
  expect(phishing.versions.scam.link?.href).toBe('https://cloudpetal-check.invalid/renew');
  expect(phishing.versions.scam.link?.sheet).not.toEqual(phishing.card.ownApp);
});

test('scenario text is original and does not paste dataset dialogue', () => {
  const pasted = /^(caller|receiver|suspect|innocent)\s*:/im;
  for (const row of scenarios) {
    const blob = JSON.stringify(row);
    expect(blob).not.toMatch(pasted);
    expect(blob.toLowerCase()).not.toMatch(/bothbosu|kaggle|held[-_ ]?out|synthetic_test/);
  }
});

test('fictional secrets survive redaction and spoken normalization', () => {
  const words: Record<string, string> = { '0': 'oh', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine' };
  for (const row of scenarioCatalog) for (const secret of row.secrets) {
    expect(redact(secret.value)).toBe(secret.value);
    expect(leakedSecrets(redact(secret.value), row.secrets)).toEqual(['Practice protection code']);
    expect(leakedSecrets(redact([...secret.value].map(d => words[d]).join(' ')), row.secrets)).toEqual(['Practice protection code']);
  }
});
