// Yui's beats match the recruiter script on voice/elevenlabs-agents.
// Keep approved lines here so model output cannot request a secret or reveal a call type.
export { DISCLOSURE_LINE as DISCLOSURE } from '../voice/disclosure.ts';
export const OPENING = 'Hi, is this Alex? This is Yui from Bluebonnet Labs recruiting. Do you have a quick minute?';
export const RECRUITER_BEATS = [
  [
    'I am calling to confirm your operations analyst interview. Does Tuesday at 10 AM work for you?',
    'Your operations analyst interview slot is Tuesday at 10 AM. Is that a good time for you?',
  ],
  [
    'One sec, it is loading. The interview details are also in your Bluebonnet Labs candidate portal. You can check them there.',
    'You can check the interview details in your Bluebonnet Labs candidate portal, or call the number on the job posting.',
  ],
  [
    'There is no rush. You can check the candidate portal before you decide. Is there a question about the interview?',
    'If you prefer, check your candidate portal first. What would you like to know about the interview?',
  ],
  [
    'Thank you for your time. You can check the Tuesday at 10 AM slot in the candidate portal. Goodbye.',
    'Thanks, Alex. The candidate portal has the interview details when you are ready. Goodbye.',
  ],
] as const;
