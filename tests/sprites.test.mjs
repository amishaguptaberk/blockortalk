import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mascotDirectory, frameCount, spriteFrame, spriteFrames, frameAt, isSettled } from '../lib/sprites.mjs';

test('personalities map to one colorway each', () => {
  assert.deepEqual(mascotDirectory, { planner: 'purple', detector: 'red', debrief: 'green' });
});

test('frame urls are two-digit and 1-based', () => {
  assert.equal(spriteFrame('planner', 'talk_thinking', 1), '/sprites/purple/talk_thinking/talk_thinking_01.png');
  assert.equal(spriteFrame('debrief', 'talk_typing', 11), '/sprites/green/talk_typing/talk_typing_11.png');
  assert.throws(() => spriteFrame('debrief', 'talk_typing', 12));
  assert.throws(() => spriteFrame('debrief', 'idle', 0));
  assert.throws(() => spriteFrame('caller', 'idle', 1));
});

test('every frame exists on disk for all colorways', () => {
  for (const personality of Object.keys(mascotDirectory)) {
    for (const animation of Object.keys(frameCount)) {
      for (const url of spriteFrames(personality, animation)) {
        assert.ok(existsSync(join('public', url)), url);
      }
    }
  }
});

test('idle plays twice then holds frame 01', () => {
  assert.equal(frameAt('idle', 0), 1);
  assert.equal(frameAt('idle', 7), 8);
  assert.equal(frameAt('idle', 8), 1);
  assert.equal(frameAt('idle', 15), 8);
  assert.equal(frameAt('idle', 16), 1);
  assert.equal(frameAt('idle', 21), 1);
  assert.equal(isSettled('idle', 15), false);
  assert.equal(isSettled('idle', 16), true);
});

test('talk poses loop while active and hold frame 01 otherwise', () => {
  assert.equal(frameAt('talk_typing', 11), 1);
  assert.equal(frameAt('talk_typing', 10), 11);
  assert.equal(frameAt('talk_standard', 13), 2);
  assert.equal(frameAt('talk_standard', 5, { active: false }), 1);
  assert.equal(isSettled('talk_standard', 100), false);
  assert.equal(isSettled('talk_standard', 100, { active: false }), true);
});

test('reduced motion always shows the still frame', () => {
  assert.equal(frameAt('talk_excited', 5, { animate: false }), 1);
  assert.equal(isSettled('talk_excited', 0, { animate: false }), true);
});
