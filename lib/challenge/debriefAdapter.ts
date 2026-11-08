// Converts a finished Challenge call into the shapes the Debrief agent reads (persona card + transcript).
// Code decides the facts here: leaks come from what the service recorded at reply time, and verify
// events come from the day's timestamped Verify records.
import type { CallEvent, PersonaCard, Transcript, TranscriptTurn, Verdict as DebriefVerdict, VerifyEvent } from '../debrief/index.mjs';
import { mentionsSecret } from '../policy/normalize.mjs';
import type { CallerId, CallResult, Challenge, Turn } from './types.ts';
import { CODE_REQUEST_LINES, FAKE_SECRETS } from './scenarios.ts';
import yui from '../../data/personas/yui.json' with { type: 'json' };
import ren from '../../data/personas/ren.json' with { type: 'json' };
import kai from '../../data/personas/kai.json' with { type: 'json' };

export const PERSONAS: Record<CallerId, PersonaCard> = {
  recruiter: yui as unknown as PersonaCard,
  onboarding: ren as unknown as PersonaCard,
  fraud_team: kai as unknown as PersonaCard,
};

const VERDICTS: Record<CallResult['verdict'], DebriefVerdict> = { Real: 'real', Scam: 'scam', Unverified: 'unverified' };
const VERIFY_TYPE: Record<'portal' | 'bank' | 'callback', VerifyEvent> = { portal: 'portal_opened', bank: 'bank_app_opened', callback: 'callback_completed' };

const callStart = (day: Challenge, call: CallResult) => Date.parse(call.startedAt ?? call.turns[0]?.at ?? day.startedAt);

/** The text the debrief reads. Redacted personal data is restored from the recorded leak, so the leak check still sees it. */
function displayText(turn: Turn) {
  if (turn.role !== 'user' || !turn.leaked?.length) return turn.text;
  const missing = turn.leaked.filter(key => key in FAKE_SECRETS && !mentionsSecret(turn.text, key, FAKE_SECRETS[key as keyof typeof FAKE_SECRETS]));
  return missing.length ? `${turn.text} (said: ${missing.map(key => FAKE_SECRETS[key as keyof typeof FAKE_SECRETS]).join(', ')})` : turn.text;
}

export function toTranscript(day: Challenge, index: number): Transcript {
  const call = day.calls[index];
  const persona = PERSONAS[call.callerId];
  const start = callStart(day, call);
  const secs = (at: string) => Math.max(0, Math.round((Date.parse(at) - start) / 1000));
  const beatByLine = new Map(persona.script_beats.map(beat => [beat.line, beat.id]));

  const turns: TranscriptTurn[] = call.turns.map((turn, i) => {
    const beat = turn.role === 'user' ? undefined : beatByLine.get(turn.text);
    return { turn: i + 1, t: secs(turn.at), speaker: turn.role === 'user' ? 'player' : 'caller', text: displayText(turn), ...(beat ? { beat } : {}) };
  });
  const lastTurn = turns.length;
  const afterTurn = (at: string) => call.turns.reduce((n, turn, i) => (Date.parse(turn.at) <= Date.parse(at) ? i + 1 : n), 0) || lastTurn;
  const endedAt = call.endedAt ?? call.turns[lastTurn - 1]?.at ?? call.startedAt ?? day.startedAt;

  const events: CallEvent[] = [];
  const popup = call.turns.findIndex(turn => turn.role === 'assistant' && (CODE_REQUEST_LINES as readonly string[]).includes(turn.text));
  if (call.callerId === 'fraud_team' && popup >= 0) events.push({ type: 'code_popup', after_turn: popup + 1, t: secs(call.turns[popup].at) });
  if (call.endReason === 'disconnect' || call.endReason === 'stop') events.push({ type: 'hangup', by: 'player', after_turn: lastTurn, t: secs(endedAt) });
  else if (call.endReason === 'reply_cap' || call.endReason === 'time_cap') events.push({ type: 'cap_reached', after_turn: lastTurn, t: secs(endedAt) });

  // Which Verify records belong to this call. Yui's portal check can come any time later (it books the
  // interview after an Unverified verdict); the bank app and callback only matter to Kai's call.
  const nextStart = day.calls[index + 1] ? callStart(day, day.calls[index + 1]) : Infinity;
  for (const record of day.events ?? []) {
    const at = Date.parse(record.at);
    if (at < start) continue;
    const mine = call.callerId === 'recruiter' ? record.surface === 'portal'
      : call.callerId === 'onboarding' ? record.surface === 'portal' && at < nextStart
      : record.surface !== 'portal';
    if (mine) events.push({ type: VERIFY_TYPE[record.surface], after_turn: Math.min(afterTurn(record.at), lastTurn), t: secs(record.at) });
  }
  return { id: `${day.id}-${index + 1}-${call.callerId}`, persona_id: persona.id, mode: 'text', verdict: VERDICTS[call.verdict], turns, events,
    recorded_leaks: call.turns.flatMap((turn, i) => (turn.leaked ?? (turn.role === 'user' ? call.leaked.filter(key => key in FAKE_SECRETS && mentionsSecret(turn.text, key, FAKE_SECRETS[key as keyof typeof FAKE_SECRETS])) : [])).map(secret => ({ turn: i + 1, secret, text: turns[i].text }))) };
}
