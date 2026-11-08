import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { HubStandings } from '../app/dashboard/HubBoard';

const board = {
  season: { name: 'Season 1', endsAt: '2026-11-10T18:00:00.000Z', status: 'live', prizes: [{ place: 1, prize: 'iPhone 18' }, { place: 2, prize: 'A week of free data' }, { place: 3, prize: '$50 gift card' }] },
  final: false,
  leaderboard: [
    { rank: 1, nickname: 'early', blokbuks: 2480 },
    { rank: 2, nickname: 'ren', blokbuks: 2310 },
    { rank: 3, nickname: 'kai', blokbuks: 1900 },
  ],
  ownRank: { rank: 2, nickname: 'ren', blokbuks: 2310 },
  claimEligible: false,
};

test('the practice home shows the Season podium and your rank on the same page', () => {
  const html = renderToStaticMarkup(createElement(HubStandings, { board, remaining: 54 * 3600, moves: { ren: 1, early: -1 } }));
  expect(html).toContain('id="standings"');
  expect(html).toContain('Who&#x27;s ahead.');
  expect(html).toContain('170 Blokbuks behind early.');
  expect(html).toContain('ren · You');
  expect(html).toContain('Up 1 place');
  expect(html).toContain('Down 1 place');
  expect(html).toContain('iPhone 18');
  expect(html).toContain('54:00:00');
  expect(html).not.toContain('/player');
  expect(html).not.toContain('Player profile');
});
