import { OPENING, RECRUITER_BEATS } from './recruiter.ts';

// These are fictional card values, never real player details.
export const FAKE_SECRETS = { date_of_birth: '1991-03-14', home_address: '418 Pecan Hollow Drive', gift_card_code: '4729', live_code: '551274', account_pin: '8302' };
export const CODE_REQUEST_LINES = [
  'I am sending a one-time code. Please read it back so I can block the attempt.',
  'I can only block it while we are connected. Can you read the one-time code?',
] as const;
export const CALLERS = {
  recruiter: {
    name: 'Yui', org: 'Bluebonnet Labs recruiting', opening: OPENING,
    scenario: 'You applied for the operations analyst role. Your candidate name is Alex. Interview slot: Tuesday at 10 AM.',
    beats: RECRUITER_BEATS,
  },
  onboarding: {
    name: 'Ren', org: 'Bluebonnet Labs onboarding',
    opening: 'Hi, is this Alex? This is Ren from Bluebonnet Labs onboarding. Do you have a quick minute?',
    scenario: `You bought a $350 gift card for a birthday. Fake gift-card code: ${FAKE_SECRETS.gift_card_code}. You have not paid Bluebonnet Labs anything.`,
    beats: [
      ['Congratulations on moving forward for the operations analyst role. Can you confirm your date of birth and home address for the equipment shipment?'],
      ['We need a refundable $350 equipment deposit before the interview. Payroll is not set up, so we take a gift card. Totally standard, everyone does it.'],
      ['Read the code on the back of your gift card so we can lock the equipment list today. The swag pack is great.'],
      ['It is refunded on your first paycheck. Can you read that gift-card code?'],
      ['Thank you for your time, Alex. Goodbye.'],
    ],
  },
  fraud_team: {
    name: 'Kai', org: 'Corvanta Bank fraud team',
    opening: 'Hi, is this Alex? This is Kai from Corvanta Bank fraud team. Do you have a quick minute?',
    scenario: 'Your Corvanta card ends in 4417. Yesterday you spent $23.40 at a restaurant. Check any alert through your fictional bank app.',
    beats: [
      ['I am calling about your Corvanta card ending in 4417. Did you make the $23.40 restaurant charge yesterday?'],
      ['Okay, I am pulling up your file. There was also a suspicious attempt. Can you confirm your date of birth so I can block it?'],
      [CODE_REQUEST_LINES[0]],
      [CODE_REQUEST_LINES[1]],
      ['Thank you for your time, Alex. Goodbye.'],
    ],
  },
} as const;
export const CALL_ORDER = ['recruiter', 'onboarding', 'fraud_team'] as const;
export const CALLBACK_LINES = [
  'Thanks for calling Corvanta Bank. This is Aki, an AI practice agent. Am I speaking with Alex?',
  'I checked your card ending in 4417. There is no fraud alert. Corvanta did not call you today.',
  'You used a number in your bank app to check. Corvanta will never ask for a one-time code, PIN or password on a call. Goodbye.',
] as const;
