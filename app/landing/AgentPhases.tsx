'use client';

import { useState } from 'react';
import { BENIGN_OPENING, SIGN_IN_CODE_ASK, riskyRequest } from '../../lib/agents/risky.ts';
import { DEBRIEF_LINE, LISTENING, PREPARE, type Companion } from '../../lib/agents/machine.ts';

const phases = ['before', 'during', 'after'] as const;
type Phase = typeof phases[number];

const planner: Companion = { personality: 'planner', state: 'planning', pose: 'speaking', message: PREPARE };
const listening: Companion = { personality: 'detector', state: 'listening', pose: 'listening', message: LISTENING };

function duringCompanion(): Companion {
  const hit = riskyRequest(SIGN_IN_CODE_ASK);
  if (!hit) return listening;
  return { personality: 'detector', state: 'alert', pose: 'alert', message: hit.message, evidence: hit.message, exchange: hit.quote };
}

const debrief: Companion = {
  personality: 'debrief',
  state: 'debrief',
  pose: 'debrief',
  message: DEBRIEF_LINE,
  exchange: SIGN_IN_CODE_ASK,
  outcome: 'The caller asked for a one-time code. Nothing was shared in this preview.',
  skill: 'Practice this: never share a sign-in code with a caller.',
};

const quiet: Record<Phase, Companion> = { before: planner, during: duringCompanion(), after: debrief };

export default function AgentPhases({ paused = false }: { paused?: boolean }) {
  const [phase, setPhase] = useState<Phase>('before');
  const [muted, setMuted] = useState(false);
  const [entered, setEntered] = useState(true);
  const selected = quiet[phase];
  return <section className="agent-phases" aria-labelledby="agent-phases-title">
    <header>
      <h3 id="agent-phases-title">One agent. Three moments.</h3>
      <p>The same companions, before the call, during it, and after.</p>
    </header>
    <div className="agent-phase-tabs" role="tablist" aria-label="Before, during, and after">
      {phases.map(item => <button key={item} type="button" role="tab" aria-selected={phase === item} aria-pressed={phase === item} onClick={() => { setPhase(item); setEntered(true); }}>{item === 'before' ? 'Before' : item === 'during' ? 'During' : 'After'}</button>)}
    </div>
    <div className={`agent-phase-row${entered ? ' is-entering' : ''}`} role="tabpanel">
      <div className="agent-phase-detail">
        {phase === 'before' && <>
          <p className="agent-message">{planner.message}</p>
          <p className="agent-balance">$1,000</p>
          <p>Fictional balance. Real decisions.</p>
          <ul className="agent-chips">
            <li>Book your Bluebonnet Labs interview</li>
            <li>Sort out the Corvanta Bank alert</li>
          </ul>
          <a className="agent-go" href="/challenge">Begin practice</a>
        </>}
        {phase === 'during' && <>
          <p className="agent-message">{selected.message}</p>
          <div className="agent-preview">
            <strong>AI practice caller</strong>
            <p>{BENIGN_OPENING}</p>
            <p>{SIGN_IN_CODE_ASK}</p>
          </div>
        </>}
        {phase === 'after' && <>
          <p className="agent-message">{debrief.message}</p>
          <p className="agent-outcome">{debrief.outcome}</p>
          <blockquote className="agent-exchange">{debrief.exchange}</blockquote>
          <p className="agent-skill">{debrief.skill}</p>
          <div className="agent-actions">
            <a className="agent-go" href="/challenge">Practice this skill</a>
            <a className="agent-go quiet" href="/try-it">Try without guidance</a>
          </div>
        </>}
        <button type="button" className="agent-mute" aria-pressed={muted} onClick={() => setMuted(value => !value)}>{muted ? 'Unmute companion' : 'Mute companion'}</button>
      </div>
    </div>
  </section>;
}
