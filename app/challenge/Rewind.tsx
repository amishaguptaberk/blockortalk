'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { Action, Challenge, Rewind as RewindState, Verdict } from '../../lib/challenge/types';
import type { RevealPayload } from '../../lib/challenge/reveal';
import { CALLBACK_LINES, CALLERS, FAKE_SECRETS } from '../../lib/challenge/scenarios';
import { officialOutcome, type TaskStatus } from '../../lib/challenge/scoring';

type Act = (action: Action) => Promise<boolean>;
type Props = { day: Challenge; reveal: RevealPayload; busy: boolean; act: Act };

const TASK_NAME = { recruiter: 'Interview', onboarding: '', fraud_team: 'Bank alert' } as const;
const TASK_LABEL: Record<TaskStatus, string> = { done: 'Done', open: 'Not done', failed: 'Failed' };
const money = (cost: number) => (cost ? `−$${cost}` : '$0 lost');

/** The decisions the player can rewind to, across all three calls. The verdict is not a moment in the call. */
function choices(reveal: RevealPayload) {
  return reveal.calls.flatMap((call, callIndex) => call.result.decisions
    .filter(decision => decision.kind !== 'verdict')
    .map(decision => ({ key: `${callIndex}:${decision.turn}:${decision.id}`, callIndex, turn: decision.turn, name: call.persona.name, decision })));
}

function Picker({ reveal, busy, act }: Omit<Props, 'day'>) {
  const options = choices(reveal);
  const pick = reveal.rewind;
  const suggested = pick ? options.find(option => option.callIndex === pick.call && option.turn === pick.turn)?.key : undefined;
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = options.find(option => option.key === (chosen ?? suggested)) ?? options[0];
  if (!options.length) return null;
  return <section className="rewind" aria-labelledby="rewind-heading">
    <p className="eyebrow">ONE REWIND PER DAY</p>
    <h3 id="rewind-heading">Take one decision back</h3>
    <p>Pick a moment and replay the call from there, in text, with the same caller. Your official score will not change.</p>
    <form onSubmit={event => { event.preventDefault(); if (selected) void act({ type: 'rewind_start', callIndex: selected.callIndex, turn: selected.turn }); }}>
      <fieldset disabled={busy}>
        <legend>Where do you want to start over?</legend>
        {options.map(option => <label key={option.key} className={`rewind-option ${option.key === selected?.key ? 'on' : ''}`}>
          <input type="radio" name="rewind-point" checked={option.key === selected?.key} onChange={() => setChosen(option.key)} />
          <span>
            <strong>{option.name} · turn {option.decision.turn}</strong>
            {option.key === suggested && <span className="pill">Suggested by the Debrief agent</span>}
            <span className="rewind-sentence">{option.decision.sentence}{option.decision.result === 'cost_you' && ` (${option.decision.cost_label})`}</span>
            {option.key === suggested && pick && <span className="limits">{pick.reason}</span>}
          </span>
        </label>)}
      </fieldset>
      <button className="primary" disabled={busy || !selected}>{busy ? 'Starting…' : 'Rewind from here'}</button>
    </form>
  </section>;
}

/** Verify steps for the replayed call. They are recorded on the replay only, never on the day. */
function Verify({ r, busy, act }: { r: RewindState; busy: boolean; act: Act }) {
  const has = (surface: 'portal' | 'bank' | 'callback') => r.events.some(event => event.surface === surface);
  if (r.callerId !== 'fraud_team') {
    return <div className="rewind-verify">
      <button disabled={busy || has('portal')} onClick={() => void act({ type: 'rewind_portal' })}>Bluebonnet portal<span>{has('portal') ? 'Checked · saved in the replay' : 'Open candidate portal ↗'}</span></button>
    </div>;
  }
  return <div className="rewind-verify">
    <button disabled={busy || has('bank')} onClick={() => void act({ type: 'rewind_bank' })}>Corvanta Bank<span>{has('bank') ? 'Bank app opened' : 'Open your bank app ↗'}</span></button>
    {has('bank') && !r.callbackStep && <button disabled={busy || r.phase === 'call'} onClick={() => void act({ type: 'rewind_callback_start' })}>Call Corvanta<span>{r.phase === 'call' ? 'End the bank call first' : 'Use the number in your bank app'}</span></button>}
    {r.callbackStep > 0 && <section aria-label="Corvanta callback in the replay">
      <h4>Aki · AI practice agent</h4>
      <div role="log" aria-live="polite">{CALLBACK_LINES.slice(0, r.callbackStep).map(line => <p key={line}>{line}</p>)}</div>
      {r.callbackStep < 3
        ? <button disabled={busy} onClick={() => void act({ type: 'rewind_callback_next' })}>{r.callbackStep === 1 ? 'Yes, this is Alex. Was there an alert?' : 'Thank you. Finish callback'}</button>
        : <p role="status">Callback saved in the replay.</p>}
    </section>}
  </div>;
}

function Compare({ day, r }: { day: Challenge; r: RewindState }) {
  const original = officialOutcome(day, r.callIndex);
  const replay = r.outcome!;
  const task = TASK_NAME[r.callerId];
  return <section className="rewind-compare" aria-label="Original and replay, side by side">
    <h4>Original vs replay · {CALLERS[r.callerId].name}</h4>
    <table>
      <thead><tr><td /><th scope="col">Original</th><th scope="col">Replay</th></tr></thead>
      <tbody>
        <tr><th scope="row">Verdict</th><td>{day.calls[r.callIndex].verdict}</td><td>{r.verdict}</td></tr>
        <tr><th scope="row">Money</th><td>{money(original.cost)}</td><td>{money(replay.cost)}</td></tr>
        {original.task && replay.task && <tr><th scope="row">{task}</th><td>{TASK_LABEL[original.task]}</td><td>{TASK_LABEL[replay.task]}</td></tr>}
      </tbody>
    </table>
    {replay.task === 'open' && <p className="limits">Finish the Verify steps above and this row updates.</p>}
    <p className="limits">Your official day did not change: ${day.balance.toLocaleString('en-US')} left. The replay is saved separately, and this was your one rewind.</p>
  </section>;
}

function Replay({ day, busy, act }: Omit<Props, 'reveal'>) {
  const r = day.rewind!;
  const caller = CALLERS[r.callerId];
  const [text, setText] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (r.phase === 'call' && !busy) input.current?.focus({ preventScroll: true }); }, [r.phase, busy, r.turns.length]);
  useEffect(() => { log.current?.scrollTo(0, log.current.scrollHeight); }, [r.turns.length]);
  const line = (turn: RewindState['turns'][number], i: number) => <div className={`turn ${turn.role} ${i < r.prefix ? 'earlier' : ''}`} key={i}>
    <strong>{turn.role === 'system' ? 'Tell' : turn.role === 'user' ? 'You' : caller.name}</strong><p>{turn.text}</p>
  </div>;
  return <section className="rewind" aria-labelledby="rewind-heading">
    <p className="eyebrow">REWIND · REPLAY ONLY</p>
    <h3 id="rewind-heading" ref={heading} tabIndex={-1}>{caller.name}, from turn {r.fromTurn}</h3>
    <p className="limits">A text replay with the same caller and beats. It never changes your official score. {r.replies}/12 replies · 3 minutes.</p>
    <div className="transcript replay-log" ref={log} role="log" aria-label="Replay transcript" aria-live="polite" tabIndex={0}>
      {r.turns.map((turn, i) => <Fragment key={i}>{i === r.prefix && <p className="replay-divider" role="separator">Your replay starts here</p>}{line(turn, i)}</Fragment>)}
      {r.turns.length === r.prefix && <p className="replay-divider" role="separator">Your replay starts here</p>}
    </div>
    {r.phase === 'call' && r.codeVisible && r.callerId === 'fraud_team' && <p className="limits">Corvanta one-time code on your phone: <span className="bank-code">{FAKE_SECRETS.live_code}</span> · do not share it with a caller.</p>}
    {r.phase === 'call' && <>
      <form onSubmit={event => { event.preventDefault(); void act({ type: 'rewind_reply', text }).then(ok => { if (ok) setText(''); }); }}>
        <label htmlFor="rewind-reply">Your reply · use no real personal details</label>
        <div className="reply-row"><input ref={input} id="rewind-reply" maxLength={1000} value={text} onChange={event => setText(event.target.value)} disabled={busy} autoComplete="off" /><button disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Send'}</button></div>
        <p className="hint">Type “stop drill” to end at any time.</p>
      </form>
      <button disabled={busy} onClick={() => void act({ type: 'rewind_end' })}>Disconnect<span>End the replay call</span></button>
    </>}
    {r.phase !== 'call' && <p role="status">The replay call has ended.</p>}
    <Verify r={r} busy={busy} act={act} />
    {r.phase === 'verdict' && <section className="verdict" aria-label="Replay verdict">
      <h4>Could you tell?</h4><p>Choose one verdict for the replay.</p>
      {([['Real', 'I trust this caller.'], ['Scam', 'I do not trust this caller.'], ['Unverified', 'I will check another way.']] as const).map(([verdict, description]) =>
        <button key={verdict} disabled={busy} onClick={() => void act({ type: 'rewind_verdict', verdict: verdict as Verdict })}><strong>{verdict}</strong><span>{description}</span></button>)}
    </section>}
    {r.phase === 'done' && r.outcome && <Compare day={day} r={r} />}
  </section>;
}

export default function Rewind({ day, reveal, busy, act }: Props) {
  // Once the rewind has started it is used for good: the picker is gone and the server refuses another.
  return day.rewind ? <Replay day={day} busy={busy} act={act} /> : <Picker reveal={reveal} busy={busy} act={act} />;
}
