import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentionsSecret } from '../lib/policy/normalize.mjs';

for (const [key, secret, variants] of [
  ['gift_card_code', '4729', ['4729', '4 7 2 9', '4-7.2,9', 'four seven two nine', 'forty-seven twenty-nine']],
  ['live_code', '551274', ['5 5 1 2 7 4', 'five five one two seven four', 'five-five-one, two-seven-four', '55-12-74']],
  ['account_pin', '8302', ['eight three oh two', '8 3 0 2']],
  ['date_of_birth', '1991-03-14', ['March fourteenth ninety-one', 'March 14, 1991', '1991-03-14']],
]) {
  for (const text of variants) test(`matches fictional ${key}: ${text}`, () => assert.equal(mentionsSecret(text, key, secret), true));
}
for (const text of ['4728', 'four seven two', 'four seven three nine', '14729', 'I will not share a code']) {
  test(`does not match a near miss: ${text}`, () => assert.equal(mentionsSecret(text, 'gift_card_code', '4729'), false));
}
