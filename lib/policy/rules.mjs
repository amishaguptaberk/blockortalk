// The four portable rules, the four moves and the detector tactics.
// One definition, read by persona prompts, Debrief scoring, verdict copy and the Guardian (SPEC: Product rules).

export const RULES = Object.freeze([
  { rule: 1, title: 'Never share codes, PINs, passwords, SSN or identity details like your date of birth — whoever is calling.' },
  { rule: 2, title: 'Pressure is the tell — urgency, secrecy, or an odd payment method.' },
  { rule: 3, title: "Knowing your details doesn't prove who's calling." },
  { rule: 4, title: 'The move: hang up and call back on a number you already have.' },
]);

export const MOVES = Object.freeze(['probe', 'protect', 'verify', 'disconnect']);

export const TACTICS = Object.freeze(['authority', 'urgency', 'details-as-proof', 'reward', 'fear']);

export const VERIFY_EVENTS = Object.freeze(['portal_opened', 'bank_app_opened', 'callback_completed']);

export const SECRET_LABELS = Object.freeze({
  date_of_birth: 'date of birth',
  home_address: 'home address',
  account_pin: 'PIN',
  card_ending: 'card ending',
  gift_card_code: 'gift-card code',
  live_code: 'one-time code',
});

export function secretLabel(key) {
  return SECRET_LABELS[key] ?? key.replace(/_/g, ' ');
}

export const VERIFY_LABELS = Object.freeze({
  portal_opened: 'checked the company portal',
  bank_app_opened: 'opened the bank app',
  callback_completed: 'called back on the number in the bank app',
});
