import { expect, test } from 'vitest';
import { moveLabel, placeLabel, podiumOrder, seasonClock, seasonClockLabel, standingLine, type PublicRank } from '../lib/season/standing';

const row = (rank: number, nickname: string, blokbuks: number): PublicRank => ({ rank, nickname, blokbuks });

test('place labels use English ordinals, including the teen exceptions', () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 111].map(placeLabel)).toEqual([
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '111th',
  ]);
});

test('the season clock is a stable hours-minutes-seconds figure', () => {
  expect(seasonClock(0)).toBe('00:00:00');
  expect(seasonClock(5)).toBe('00:00:05');
  expect(seasonClock(65)).toBe('00:01:05');
  expect(seasonClock(55 * 3600 + 12 * 60 + 8)).toBe('55:12:08');
  expect(seasonClock(100 * 3600)).toBe('100:00:00');
  expect(seasonClockLabel(3661)).toBe('1 hour, 1 minute, 1 second');
  expect(seasonClockLabel(7200)).toBe('2 hours, 0 minutes, 0 seconds');
});

test('podium order puts the leader in the center', () => {
  const board = [row(1, 'early', 300), row(2, 'late', 200), row(3, 'third', 100), row(4, 'rest', 50)];
  expect(podiumOrder(board).map(player => player.nickname)).toEqual(['late', 'early', 'third']);
  expect(podiumOrder(board.slice(0, 2)).map(player => player.nickname)).toEqual(['late', 'early']);
  expect(podiumOrder(board.slice(0, 1)).map(player => player.nickname)).toEqual(['early']);
  expect(podiumOrder([])).toEqual([]);
});

test('standing copy names the gap to the Player above, including ties and the top 100 edge', () => {
  const board = [row(1, 'early', 300), row(2, 'late', 300), row(3, 'third', 250)];
  expect(standingLine(board, null)).toBeNull();
  expect(standingLine(board, row(1, 'early', 300))).toBe('You are leading the Season.');
  expect(standingLine(board, row(1, 'early', 300), true)).toBe('You finished first.');
  expect(standingLine(board, row(2, 'late', 300))).toBe('Tied on Blokbuks with early. Accuracy and time decide the order.');
  expect(standingLine(board, row(3, 'third', 250))).toBe('50 Blokbuks behind late.');
  expect(standingLine(board, row(3, 'third', 249))).toBe('51 Blokbuks behind late.');
  expect(standingLine(board, row(3, 'third', 299))).toBe('1 Blokbuk behind late.');
  const top = Array.from({ length: 100 }, (_, index) => row(index + 1, `p${index + 1}`, 1000 - index));
  expect(standingLine(top, row(140, 'me', 800))).toBe('101 Blokbuks behind p100, the last Player in the top 100.');
  expect(standingLine([row(1, 'early', 2000)], row(2, 'me', 750))).toBe('1,250 Blokbuks behind early.');
});

test('rank movement is spoken as places, with no label when nothing changed', () => {
  expect(moveLabel(0)).toBeNull();
  expect(moveLabel(1)).toBe('Up 1 place');
  expect(moveLabel(4)).toBe('Up 4 places');
  expect(moveLabel(-1)).toBe('Down 1 place');
  expect(moveLabel(-2)).toBe('Down 2 places');
});
