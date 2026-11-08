'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Action, Challenge } from '../../lib/challenge/types';
import type { RevealCall, RevealPayload } from '../../lib/challenge/reveal';
import { CALLERS, CALL_ORDER } from '../../lib/challenge/scenarios';
import SpritePlayer from '../components/SpritePlayer';
import { Flip, Stamp } from '../components/ui';
import Rewind from './Rewind';
import './reveal.css';

type State = { status: 'loading' | 'ready' | 'error'; reveal: RevealPayload | null; error: string; phase?: 'thinking' | 'typing' };
type Flag = RevealCall['result']['red_flags'][number];

const TACTIC_LABEL: Record<string, string> = {
  authority: 'authority', urgency: 'urgency', fear: 'fear', reward: 'reward',
  'details-as-proof': 'details as proof', 'odd-payment': 'odd payment', 'asks-for-secret': 'asks for a secret',
};
const RULE_STATUS = { kept: 'Kept', broken: 'Broken', not_tested: 'Not tested' } as const;

/** Wraps each red-flag span in a mark that also names the tactic in words (never colour alone). */
function highlight(text: string, flags: Flag[]): ReactNode {
  const sorted = [...flags].sort((a, b) => a.span.start - b.span.start);
  const nodes: ReactNode[] = [];
  let at = 0;
  sorted.forEach((flag, i) => {
    const { start, end } = flag.span;
    if (start < at || end <= start || end > text.length) return; // overlapping or stale span: skip it
    if (start > at) nodes.push(text.slice(at, start));
    nodes.push(<mark className="flag" key={i}>{text.slice(start, end)}<span className="flag-tag">{TACTIC_LABEL[flag.tactic] ?? flag.tactic}</span></mark>);
    at = end;
  });
  nodes.push(text.slice(at));
  return nodes;
}

function useRevealData(day: Challenge, requestReveal?: () => Promise<Response>) {
  const [state, setState] = useState<State>({ status: 'loading', reveal: null, error: '' });
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (mode?: 'fixed') => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(s => ({ ...s, status: 'loading', error: '', phase: 'thinking' }));
    try {
      async function read(path: string) {
        const response = requestReveal ? await requestReveal() : await fetch(path, { cache: 'no-store', signal: controller.signal, headers: path.includes('mode=basic') ? {} : { Accept: 'application/x-ndjson' } });
        if (response.ok && response.headers.get('content-type')?.includes('ndjson') && response.body) {
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          let reveal: RevealPayload | undefined;
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += chunk.value;
            const lines = buffer.split('\n'); buffer = lines.pop()!;
            for (const line of lines.filter(Boolean)) {
              const event = JSON.parse(line) as { phase?: 'thinking' | 'typing'; reveal?: RevealPayload; error?: string };
              if (event.error) throw new Error(event.error);
              if (event.phase && !controller.signal.aborted) setState(s => ({ ...s, phase: event.phase }));
              if (event.reveal) reveal = event.reveal;
            }
          }
          if (!reveal) throw new Error('The report was interrupted. Please try again.');
          return reveal;
        }
        const result = await response.json() as { reveal?: RevealPayload; error?: string };
        if (!response.ok || !result.reveal) throw new Error(result.error || 'The reveal could not be built.');
        return result.reveal;
      }
      // Show code's identities and effects first. Agent and retrieval latency cannot hold them back.
      const basic = await read('/api/challenge/reveal?mode=basic');
      if (requestReveal) {
        if (!controller.signal.aborted) setState({ status: 'ready', reveal: basic, error: '' });
        return;
      }
      if (!controller.signal.aborted) setState({ status: 'loading', reveal: basic, error: '' });
      const reveal = await read(`/api/challenge/reveal${mode ? '?mode=fixed' : ''}`);
      if (!controller.signal.aborted) setState({ status: 'ready', reveal, error: '' });
    } catch (e) {
      if (!controller.signal.aborted) setState(s => ({ status: 'error', reveal: s.reveal, error: e instanceof Error ? e.message : 'The reveal could not be built.' }));
    }
  }, []);
  const outcome = `${day.balance}|${day.interview}|${day.bank}|${day.events.length}`;
  useEffect(() => { void load(); return () => request.current?.abort(); }, [day.id, outcome, load]);
  return { ...state, load };
}

function CallCard({ call, index }: { call: RevealCall; index: number }) {
  const who = call.identity; // the wording comes from the server, only after the third verdict
  const flagged = call.result.red_flags;
  return <Flip index={index}>
    <article className="reveal-card" aria-label={`${call.persona.name}, revealed`}>
      <p className="eyebrow">CALL {index + 1} OF 3</p>
      <h3>{call.persona.name}</h3>
      <p className="claimed">Said they were: {call.persona.claimed_org}</p>
      <p className="identity"><span className={`pill tone-${who.tone}`}>{who.label}</span></p>
      <p>{who.line}</p>{call.warning && <p className="limits">{call.warning}</p>}
      <p className="limits">Verdict you gave: {call.result.verdict ?? 'none'} · {call.result.outcome.money_lost ? `−$${call.result.outcome.money_lost}` : '$0 lost'}{call.result.outcome.task ? ` · task ${call.result.outcome.task.status}` : ''}</p>
      <ul className="decisions">
        {call.result.decisions.map(decision => <li key={decision.id}>
          <Stamp>{decision.result === 'worked' ? 'Worked' : 'Cost you'}</Stamp>
          <p>Turn {decision.turn} · {decision.sentence}{decision.result === 'cost_you' && <span className="cost"> ({decision.cost_label})</span>}</p>
        </li>)}
      </ul>
      <details className="transcript-box" open={call.result.decisions.some(d => d.result === 'cost_you')}>
        <summary>Transcript · {flagged.length} red-flag {flagged.length === 1 ? 'line' : 'lines'} marked</summary>
        <ol className="lines">
          {call.turns.map(turn => <li key={turn.turn} className={`${turn.speaker} ${call.result.decisions.some(d => d.turn === turn.turn && d.kind === 'leak') ? 'leak-turn' : ''}`}>
            <strong>Turn {turn.turn} · {turn.speaker === 'player' ? 'You' : call.persona.name}</strong>
            <p>{highlight(turn.text, flagged.filter(flag => flag.turn === turn.turn))}</p>
            {call.result.decisions.filter(d => d.turn === turn.turn && d.kind === 'leak').map(d => <p className="leak-decision" key={d.id}><mark>Cost you · {d.cost_label}</mark> · {d.sentence}</p>)}
          </li>)}
        </ol>
      </details>
    </article>
  </Flip>;
}

function PlaceholderCard({ id, index }: { id: typeof CALL_ORDER[number]; index: number }) {
  return <article className="reveal-card pending" aria-label={`${CALLERS[id].name}, not yet revealed`}>
    <p className="eyebrow">CALL {index + 1} OF 3</p>
    <h3>{CALLERS[id].name}</h3>
    <p className="claimed">{CALLERS[id].org}</p>
    <p className="pill">AI practice caller</p>
  </article>;
}

function Steps({ reveal }: { reveal: RevealPayload }) {
  return <section className="steps" aria-label="Debrief agent steps">
    <h3>Agent steps</h3>
    {reveal.calls.map(call => {
      const { result } = call;
      return <div className="step-group" key={call.callerId}>
        <h4>{call.persona.name} · {result.path === 'agent' ? 'Nemotron tool loop' : 'Fixed sequence'}{result.model ? ` · ${result.model}` : ''}</h4>
        {result.path === 'fixed' && result.fallback_reason && <p className="limits">{result.fallback_reason.includes('timed out') ? 'The agent took too long. The fixed sequence completed the report.' : 'The agent was unavailable. The fixed sequence completed the report.'}</p>}
        <p className="limits">Detector: {result.detector.source}{result.detector.label === null ? ". Cannot tell. Verify through a number you already have." : ""}</p>
        <ol>
          {result.steps.map(step => <li key={step.n + step.tool}>
            <code>{step.tool}</code><span className="by">{step.by === 'nemotron' ? 'chosen by Nemotron' : 'run by code'}</span>
            <p>{step.result_summary}</p>
          </li>)}
        </ol>
        {result.mismatches.length > 0 && <p className="limits">Where the model disagreed with the code, the code’s answer is shown: {result.mismatches.map(m => m.field).join(', ')}.</p>}
      </div>;
    })}
  </section>;
}

function Rules({ reveal }: { reveal: RevealPayload }) {
  const titles = reveal.calls[0].result.rules;
  const dayStatus = (i: number) => reveal.calls.some(c => c.result.rules[i].status === 'broken') ? 'broken' : reveal.calls.some(c => c.result.rules[i].status === 'kept') ? 'kept' : 'not_tested';
  return <section className="rules" aria-label="The four rules">
    <h3>The four rules</h3>
    {titles.map((rule, i) => <article key={rule.rule}>
      <h4>Rule {rule.rule} · {RULE_STATUS[dayStatus(i)]} for the day</h4><p>{rule.title}</p>
      <ul>
        {reveal.calls.map(call => {
          const r = call.result.rules[i];
          return <li key={call.callerId} className={`rule-${r.status}`}><strong>{call.persona.name} · {RULE_STATUS[r.status]}</strong><span>{r.evidence}</span></li>;
        })}
      </ul>
    </article>)}
  </section>;
}

export default function Reveal({ requestReveal, day, busy, act }: { requestReveal?: () => Promise<Response>; day: Challenge; busy: boolean; act: (action: Action) => Promise<boolean> }) {
  const { status, reveal, error, load, phase } = useRevealData(day, requestReveal);
  const goodDay = !!reveal && reveal.summary.balance === 1000 && reveal.summary.interview === 'BOOKED' && reveal.summary.bank === 'RESOLVED';
  const cat = { animation: status === 'loading' ? phase ?? 'thinking' as const : goodDay ? 'excited' as const : 'talking' as const, active: status === 'loading', caption: status === 'loading' ? 'Checking the calls…' : 'Debrief agent' };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (status === 'ready') heading.current?.focus({ preventScroll: true }); }, [status === 'ready']);

  return <section className="reveal" aria-labelledby="reveal-heading">
    <header className="reveal-head">
      <div>
        <p className="eyebrow">DETECTIVE REVEAL</p>
        <h2 id="reveal-heading" ref={heading} tabIndex={-1}>Who was really calling</h2>
        {status === 'loading' && !reveal && <p role="status">The Debrief agent is reading your three calls.</p>}
        {status === 'loading' && reveal && <p role="status">Identities and effects are ready. The agent and detector are checking the details.</p>}
        {reveal && <p className="limits">{reveal.calls.every(c => c.result.path === 'agent') ? 'Explained by Nemotron’s tool loop. Code decided every score.' : 'Some or all of this ran on the fixed sequence of the same tools, labelled below. Code decided every score.'}</p>}
      </div>

    </header>
    {status === 'error' && <div className="error" role="alert"><p>{error}</p><div className="voice-actions"><button className="primary" onClick={() => void load()}>Try again</button><button onClick={() => void load('fixed')}>Use the fixed sequence</button></div></div>}
    <div className="reveal-cards">
      {reveal
        ? reveal.calls.map((call, i) => <CallCard key={call.callerId} call={call} index={i} />)
        : CALL_ORDER.map((id, i) => <PlaceholderCard key={id} id={id} index={i} />)}
    </div>
    {reveal && <Fragment>
      <div className="reveal-lower">
        <div><figure className="debrief-cat"><SpritePlayer personality="debrief" animation={cat.animation} active={cat.active} scale={2} /><figcaption>{cat.caption}</figcaption></figure><Steps reveal={reveal} /></div>
        <div><Rules reveal={reveal} /></div>
      </div>
      <Rewind day={day} reveal={reveal} busy={busy} act={act} />
    </Fragment>}
  </section>;
}
