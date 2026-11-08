import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import Dashboard from '../app/dashboard/Dashboard';
import { scenarioCatalog } from '../lib/season/scenarios/catalog';

test('the Scenarios page lists every catalog call beside the voiced callers, without secrets or call type', () => {
  const html = renderToStaticMarkup(createElement(Dashboard, { initialView: 'Scenarios' }));
  expect(html).toContain('Yui');
  expect(html).toContain('Practice in text');
  for (const row of scenarioCatalog) {
    expect(html).toContain(row.category);
    expect(html).toContain(`href="/play/${encodeURIComponent(row.id)}"`);
    for (const secret of row.secrets) expect(html).not.toContain(secret.value);
  }
  expect(html).toContain('Refund or billing error');
  expect(html).toContain('Insurance policy check');
  expect(html).toContain('Subscription or sales call');
  expect(html).toContain('Wrong number');
  expect(html).not.toMatch(/ask_line|next_step|versions/);
});
