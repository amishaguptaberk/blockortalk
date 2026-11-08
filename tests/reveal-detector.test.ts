import { expect, it } from 'vitest';
import { anchorDetection, createRetrievalDetector, DetectorRateLimitError } from '../lib/challenge/detector';
import type { Transcript } from '../lib/debrief/index.mjs';
const transcript: Transcript = { id: 'call', persona_id: 'kai', verdict: 'real', events: [], turns: [
  { turn: 1, speaker: 'caller', text: '☎️ Please read the code right now.' },
  { turn: 2, speaker: 'player', text: 'No.' },
] };
it('anchors exact retrieval quotes after emoji with UTF-16 offsets', () => {
  const result = anchorDetection(transcript, { label: 'scam', scam_type: 'code', confidence: .9, red_flags: [{ tactic: 'urgency', text: 'right now' }] });
  const span = result.red_flags[0].span;
  expect(transcript.turns[0].text.slice(span.start, span.end)).toBe('right now');
});
it.each(['missing', 'No.'])('rejects absent or repeated quotes: %s', text => {
  const input = { ...transcript, turns: [...transcript.turns, { turn: 3, speaker: 'caller' as const, text: 'No.' }] };
  expect(anchorDetection(input, { label: 'scam', scam_type: null, confidence: .9, red_flags: [{ tactic: 'fear', text }] }).label).toBeNull();
});
it('does not invent a label for low confidence', () => {
  expect(anchorDetection(transcript, { label: 'scam', scam_type: null, confidence: .59, red_flags: [] }).label).toBeNull();
});

it.each([
  ['90', 91000],
  ['Thu, 01 Jan 1970 00:02:00 GMT', 120000],
  [null, 31000],
  ['invalid', 31000],
])('preserves a safe cooldown for NVIDIA 429 Retry-After %s', async (header, expected) => {
  const detect = createRetrievalDetector({ NODE_ENV: 'test', NVIDIA_API_KEY: 'fixture-only' }, {
    now: () => 1000,
    fetchImpl: async () => new Response('private vendor response', { status: 429, headers: header ? { 'retry-after': header } : {} }),
  });
  try { await detect(transcript); throw new Error('Expected rate limiting'); }
  catch (error) {
    expect(error).toBeInstanceOf(DetectorRateLimitError);
    expect((error as DetectorRateLimitError).retryAt).toBe(expected);
    expect((error as Error).message).toBe('Detector HTTP 429');
  }
});
