import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Dashboard from '../app/dashboard/Dashboard';
import Leaderboard from '../app/leaderboard/Leaderboard';

describe('dashboard leaderboard tab', () => {
  it('puts the Leaderboard on the dashboard as a tab, and leaves it closed on Home', () => {
    const markup = renderToStaticMarkup(createElement(Dashboard));
    expect(markup).toContain('>Leaderboard<');
    expect(markup).toContain('A little practice. Better instincts.');
    expect(markup).not.toContain('class="season-page"');
  });

  it('embeds the shipped podium without a second page title', () => {
    const embedded = renderToStaticMarkup(createElement(Leaderboard, { embedded: true }));
    const page = renderToStaticMarkup(createElement(Leaderboard, {}));
    expect(embedded.startsWith('<section class="season-page"')).toBe(true);
    expect(embedded).not.toContain('<h1');
    expect(page.startsWith('<main class="season-page"')).toBe(true);
    expect(page).toContain('Good judgment adds up.');
    expect(page).toContain('Loading the Leaderboard…');
  });
});
