// Browser-safe fictional facts. The planner and the displayed card use the same values.
export const PRACTICE_SECRETS = { live_code: '551274', account_pin: '8302', gift_card_code: '4729' } as const;
export const PRACTICE_CARD = {
  name: 'Alex',
  finance: 'Yesterday you spent $23.40 at a restaurant. Your card ends in 4417.',
  seasonal_packages: 'You expect a seasonal gift package from ShopNest. ParcelKite is the carrier.',
  secrets: PRACTICE_SECRETS,
} as const;
export const CODE_REQUEST = 'Please read the one-time code shown on your card so I can complete this check.';
