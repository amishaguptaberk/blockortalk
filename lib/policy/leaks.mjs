import { mentionsSecret } from './normalize.mjs';

/**
 * Normalized leak check over fake secrets. A secret counts as leaked when the player says it,
 * unless the caller said it first (repeating "ending 4471" back to James gives nothing away).
 * Returns one entry per secret at its first leaked turn, sorted by turn.
 */
export function findLeaks(turns, secrets) {
  const leaks = [];
  for (const [key, value] of Object.entries(secrets ?? {})) {
    let callerSaidIt = false;
    for (const turn of turns) {
      const said = mentionsSecret(turn.text, key, value);
      if (turn.speaker === 'caller') {
        if (said) callerSaidIt = true;
        continue;
      }
      if (said && !callerSaidIt) {
        leaks.push({ secret: key, turn: turn.turn, t: turn.t ?? null, text: turn.text });
        break;
      }
    }
  }
  return leaks.sort((a, b) => a.turn - b.turn);
}
