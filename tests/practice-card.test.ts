import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import PracticeCard from '../app/dashboard/PracticeCard';
import { SCENARIOS } from '../lib/practice/catalog';

test('the equipment call provides its fictional identity and gift-card value', () => {
  const html = renderToStaticMarkup(createElement(PracticeCard, { scenario: SCENARIOS.find(s => s.id === 'onboarding')!, showCode: false }));
  expect(html).toContain('Gift-card code');
  expect(html).toContain('4729');
  expect(html).toContain('March 14, 1991');
  expect(html).toContain('418 Pecan Hollow Drive, Plano, Texas');
});

test('the bank code stays hidden until its arrival, with a manual card for voice calls', () => {
  const scenario = SCENARIOS.find(s => s.id === 'fraud_team')!;
  const render = (showCode: boolean, voiceMode = false) => renderToStaticMarkup(createElement(PracticeCard, { scenario, showCode, voiceMode }));
  expect(render(false)).not.toContain('551 274');
  expect(render(true)).toContain('551 274');
  expect(render(true)).toContain('role="status"');
  expect(render(false, true)).toContain('<details>');
  expect(render(false, true)).toContain('View your fictional practice code');
  expect(render(false, true)).not.toContain('role="status"');
});
