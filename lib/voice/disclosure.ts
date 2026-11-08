/**
 * The fixed spoken disclosure that opens every phone and browser-voice call
 * (docs/SPEC.md, "Call disclosure"). It is identical for every call type, so it
 * reveals nothing about who is calling.
 */
export const DISCLOSURE_LINE =
  "It's recorded for your report. Say 'stop drill' anytime.";

/** Drill caps from the spec: 12 player replies or 3 minutes, whichever comes first. */
export const DRILL_MAX_SECONDS = 180;
export const DRILL_MAX_PLAYER_REPLIES = 12;
