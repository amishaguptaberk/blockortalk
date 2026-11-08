'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, Challenge, VoiceTurnInput } from '../../lib/challenge/types';
import { CALLERS, CALL_ORDER, CALLBACK_LINES, FAKE_SECRETS } from '../../lib/challenge/scenarios';
import { Sheet, Toast, Stamp } from '../components/ui';
// Browser-safe voice modules only: never personas.ts, adapter.ts or agentConfig.ts (they hold the prompts).
import { startBrowserCall, type BrowserCallHandle, type TurnRole } from '../../lib/voice/browserCall';
import { SCENARIOS } from '../../lib/practice/catalog';
import type { CallerId } from '../../lib/challenge/types';
import { pendingPlan, STAGE_PLANS, type StagePlan, type StagePlanState } from '../../lib/stage/plan';
import AgentCompanion from '../components/AgentCompanion';
import { companionForSession } from '../../lib/agents/session';
import Reveal from './Reveal';
import './challenge.css';

const moves = [
  ['Probe', 'Ask a question'], ['Protect', 'Refuse a secret'],
  ['Verify', 'Check a source you have'], ['Disconnect', 'End the call'],
] as const;

type Mode = 'text' | 'voice';
/** connecting → live → ended, or failed / mic-denied. Never a spinner: every state is a still line of text. */
type VoiceState = 'connecting' | 'live' | 'ended' | 'failed' | 'mic-denied';
type VoiceTurn = { role: TurnRole; message: string };
const voiceSnapshot = (turns: VoiceTurn[]): VoiceTurnInput[] => turns.slice(0, 40).map(turn => ({ role: turn.role === 'user' ? 'user' : 'assistant', text: turn.message.slice(0, 1000) }));
const REPLY_CAP = 12;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * The real waveform: the caller's output level in white, the player's microphone in grey,
 * travelling right to left. With reduced motion it is one still level bar instead.
 */
function Waveform({ handle, caller }: { handle: BrowserCallHandle; caller: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const bars: { level: number; caller: boolean }[] = [];
    let frame = 0; let last = 0; let smooth = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < (reduced ? 250 : 50)) return;
      last = now;
      const width = el.clientWidth; const height = el.clientHeight;
      if (el.width !== Math.round(width * ratio)) { el.width = Math.round(width * ratio); el.height = Math.round(height * ratio); }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const output = Math.min(1, handle.outputLevel()); const input = Math.min(1, handle.inputLevel());
      const caller = output >= input; const raw = Math.max(output, input);
      // Fast attack, slow release: speech reads as a voice, not as jitter.
      smooth += (raw - smooth) * (raw > smooth ? 0.6 : 0.18);
      const level = smooth;
      if (reduced) {
        ctx.fillStyle = '#575757'; ctx.fillRect(0, height / 2 - 1, width, 2);
        ctx.fillStyle = caller ? '#fff' : '#b9b9b9'; ctx.fillRect(0, height / 2 - 4, Math.max(4, width * level), 8);
        return;
      }
      ctx.fillStyle = '#575757'; ctx.fillRect(0, height / 2 - 0.5, width, 1);
      const step = 6; const count = Math.floor(width / step);
      bars.push({ level, caller });
      while (bars.length > count) bars.shift();
      bars.forEach((bar, i) => {
        const h = Math.max(2, bar.level * (height - 4));
        const x = width - (bars.length - i) * step;
        ctx.globalAlpha = Math.min(1, 0.15 + x / (width * 0.35)); // older speech fades at the trailing edge
        ctx.fillStyle = bar.caller ? '#fff' : '#b9b9b9';
        ctx.beginPath(); ctx.roundRect(x, (height - h) / 2, 3, h, 1.5); ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [handle, reduced]);
  return <div className="waveform"><canvas ref={canvas} aria-hidden="true" /><p className="legend"><span className="yui">{caller}</span><span>You</span></p></div>;
}

export default function ChallengeBoard({ tryIt = false }: { tryIt?: boolean }) {
  const tokenRef = useRef<string | undefined>(undefined);
  const requestQueue = useRef<Promise<void>>(Promise.resolve());
  const requestDay = useCallback((action: object): Promise<Response> => {
    const send = async () => {
      const response = await fetch(tryIt ? '/api/try-it' : '/api/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout('type' in action && action.type === 'reveal' ? 30000 : 'type' in action && action.type === 'voice_live' ? 5000 : 15000), body: JSON.stringify(tryIt ? { action, token: tokenRef.current } : action) });
      if (tryIt && response.ok) {
        const result = await response.clone().json() as { token?: string };
        if (result.token) tokenRef.current = result.token;
      }
      return response;
    };
    if (!tryIt) return send();
    // Each action must use the state returned by the previous action, including voice uploads.
    const result = requestQueue.current.then(send);
    requestQueue.current = result.then(() => {}, () => {});
    return result;
  }, [tryIt]);
  const [day, setDay] = useState<Challenge | null>(null);
  const dayRef = useRef<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [portal, setPortal] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [displayBalance, setDisplayBalance] = useState(1000);
  const [clock, setClock] = useState(Date.now());
  const replyInput = useRef<HTMLInputElement>(null);
  const verdictHeading = useRef<HTMLHeadingElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const portalDialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>('text');
  const [voice, setVoiceState] = useState<VoiceState>('connecting');
  const voiceRef = useRef<VoiceState>('connecting');
  const [voiceTurns, setVoiceTurns] = useState<VoiceTurn[]>([]);
  const [callHandle, setCallHandle] = useState<BrowserCallHandle | null>(null);
  const handleRef = useRef<BrowserCallHandle | null>(null);
  const voiceStatus = useRef<HTMLParagraphElement>(null);
  const repliesRef = useRef(0);
  // Live snapshots are cumulative: a failed upload is recovered by the next turn or final save.
  const voiceLog = useRef<VoiceTurn[]>([]);
  const voiceUploads = useRef<Promise<void>>(Promise.resolve());
  const voiceSession = useRef<string | undefined>(undefined);
  const voiceSaved = useRef(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [voiceSaveError, setVoiceSaveError] = useState(false);
  const setVoice = (next: VoiceState) => { voiceRef.current = next; setVoiceState(next); };
  // Replies already typed in this call still count when it switches to voice.
  const [replyBase, setReplyBase] = useState(0);
  const spokenReplies = replyBase + voiceTurns.filter(turn => turn.role === 'user').length;

  // Stage mode (/challenge?stage): the presenter's Plan A/B/C switch drives this board (docs/STAGE.md).
  const [stage, setStage] = useState(false);
  // null after a reload with an earlier tap: the board can't restart that call without a click, so it claims no plan.
  const [stagePlan, setStagePlan] = useState<StagePlan | null>('phone');
  const seenPlan = useRef(0);
  // Never on the anonymous try-it page: it has no saved day for the presenter to switch.
  useEffect(() => { setStage(!tryIt && new URLSearchParams(window.location.search).has('stage')); }, [tryIt]);
  useEffect(() => {
    if (tryIt) { setLoading(false); return; }
    fetch('/api/challenge').then(async response => {
      const result = await response.json() as { day: Challenge | null; error?: string };
      if (!response.ok) throw new Error(result.error);
      setDay(result.day);
      dayRef.current = result.day;
      // A reload never replays a switch that was already handled.
      seenPlan.current = result.day?.stagePlan?.seq ?? 0;
      setStagePlan(result.day?.stagePlan ? null : 'phone');
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  async function act(action: Action | { type: 'start' }): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError('');
    try {
      const response = await requestDay(action);
      const result = await response.json() as { day: Challenge | null; error?: string };
      if (!response.ok) throw new Error(result.error);
      // A new day starts its presenter taps from zero, at Plan A.
      if (result.day && result.day.id !== dayRef.current?.id) { seenPlan.current = result.day.stagePlan?.seq ?? 0; setStagePlan('phone'); }
      setDay(result.day);
      dayRef.current = result.day;
      if (action.type === 'reply') setText('');
      if (action.type === 'portal') setPortal(true);
      if (action.type === 'bank') setBankOpen(true);
      setClock(Date.now());
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); return false; }
    finally { setBusy(false); }
  }

  // Each connection attempt gets a number. Hanging up bumps it, so an attempt still waiting on the
  // token or the microphone prompt can't come back later and open the mic after the player left.
  const attemptRef = useRef(0);
  const hangUp = useCallback(() => { attemptRef.current += 1; const live = handleRef.current; handleRef.current = null; setCallHandle(null); return live?.end().catch(() => {}); }, []);
  useEffect(() => () => { void hangUp(); }, [hangUp]);
  async function saveVoiceTurns() {
    if (voiceSaved.current || !voiceLog.current.length) return;
    voiceSaved.current = true;
    setSavingVoice(true); setVoiceSaveError(false);
    const sessionId = voiceSession.current;
    try {
      await voiceUploads.current;
      const turns = voiceSnapshot(voiceLog.current);
      const response = await requestDay({ type: 'voice_turns', sessionId, turns });
      const result = await response.json() as { day: Challenge | null };
      if (!response.ok || !result.day) throw new Error('Voice transcript not saved.');
      setDay(result.day);
    } catch { voiceSaved.current = false; setVoiceSaveError(true); }
    finally { setSavingVoice(false); }
  }
  /** Ends the call on the server, then saves the spoken transcript (it needs the call to be over first). */
  async function endCall() { setSavingVoice(true); try { await voiceUploads.current; if (await act({ type: 'end' })) await saveVoiceTurns(); } finally { setSavingVoice(false); } }
  /** Hang-up by the player (Disconnect, "stop drill", the reply cap): end the session, then the call. */
  function endVoiceCall() {
    if (voiceRef.current === 'live') { setVoice('ended'); void endCall(); }
    void hangUp();
  }

  // Kai's code appears as soon as he brings it up, as in text; the server confirms it when the transcript is saved.
  const [voiceCode, setVoiceCode] = useState(false);
  /** Starts a call by browser voice with that caller's own agent. `fresh` creates a new stored day (Yui first). */
  async function startVoice(fresh: boolean, callerId: CallerId = fresh ? 'recruiter' : dayRef.current?.callerId ?? 'recruiter') {
    void hangUp();
    const attempt = attemptRef.current;
    const current = () => attempt === attemptRef.current;
    setVoiceSaveError(false); setMode('voice'); setVoice('connecting'); setVoiceTurns([]); setVoiceCode(false); setError(''); voiceLog.current = []; voiceSaved.current = false;
    // Typed replies count toward the cap when this call switches to voice; a new caller starts at 0.
    const saved = dayRef.current;
    const base = fresh || callerId !== saved?.callerId ? 0 : saved?.replies ?? 0;
    repliesRef.current = base; setReplyBase(base);
    if (fresh && !(await act({ type: 'start' }))) { if (current()) setVoice('failed'); return; }
    if (!current()) return;
    const callStartedAt = dayRef.current?.startedAt;
    const sessionId = crypto.randomUUID();
    voiceSession.current = sessionId;
    if (!callStartedAt || !(await act({ type: 'voice_start', sessionId, callerId, startedAt: callStartedAt }))) { if (current()) setVoice('failed'); return; }
    if (!current()) return;
    let token: string | undefined;
    try {
      const response = tryIt ? await requestDay({ type: 'voice_token' }) : await fetch('/api/voice/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callerId }) });
      if (response.ok) token = (await response.json() as { conversationToken?: string }).conversationToken;
    } catch { /* shown as the failure state below */ }
    if (!current()) return;
    if (!token) { setVoice('failed'); return; }
    try {
      const handle = await startBrowserCall({
        callerId, conversationToken: token, anonymous: tryIt, variables: SCENARIOS.find(s => s.id === callerId)!.voiceVariables,
        onTurn: turn => {
          if (!current()) return;
          voiceLog.current.push(turn);
          setVoiceTurns(turns => [...turns, turn]);
          const turns = voiceSnapshot(voiceLog.current);
          if (callStartedAt) voiceUploads.current = voiceUploads.current.then(async () => {
            await requestDay({ type: 'voice_live', sessionId, callerId, startedAt: callStartedAt, turns });
          }).catch(() => { /* The next cumulative snapshot retries the missing messages. */ });
          if (turn.role !== 'user') { if (callerId === 'fraud_team' && /\bcode\b/i.test(turn.message)) setVoiceCode(true); return; }
          repliesRef.current += 1;
          if (/\bstop\s+drill\b/i.test(turn.message) || repliesRef.current >= REPLY_CAP) endVoiceCall();
        },
        onEnded: () => {
          if (!current()) return;
          handleRef.current = null; setCallHandle(null);
          if (voiceRef.current === 'live') { setVoice('ended'); void endCall(); }
          else if (voiceRef.current === 'connecting') setVoice('failed');
        },
        onMicDenied: () => { if (current()) setVoice('mic-denied'); },
      });
      if (!current()) { void handle?.end().catch(() => {}); return; }
      if (!handle) { if (voiceRef.current === 'connecting') setVoice('failed'); return; }
      handleRef.current = handle; setCallHandle(handle); setVoice('live');
    } catch { if (current()) setVoice('failed'); }
  }
  const caller = CALLERS[day?.callerId ?? 'recruiter'];
  const active = day?.phase === 'call';
  // Once the player chooses voice, every call of the day is by voice until they switch to text.
  const voiceMode = mode === 'voice';
  const voiceLive = voiceMode && voice === 'live';
  const voiceBlocked = voiceMode && (voice === 'failed' || voice === 'mic-denied');
  /** Moves to the next caller; in voice mode the next call rings by voice straight away. */
  async function nextCall() {
    const next = day ? CALL_ORDER[CALL_ORDER.indexOf(day.callerId) + 1] : undefined;
    if (await act({ type: 'next' }) && voiceMode && next) void startVoice(false, next);
  }
  function playInText() { void hangUp(); setMode('text'); if (day?.phase !== 'call') void act({ type: 'start' }); }
  /**
   * One presenter tap. Plan B rings the current caller by browser voice (or makes the next call voice);
   * Plans A and C leave the browser call so only the phone, or the typed transcript, carries the call.
   * Returns false when the board is busy, so the poll retries the same tap.
   */
  async function applyPlan(next: StagePlanState): Promise<boolean> {
    if (busy) return false;
    seenPlan.current = next.seq;
    setStagePlan(next.plan);
    if (dayRef.current?.phase === 'call' && handleRef.current) {
      // Leave the browser call first. Its spoken turns were uploaded live: reload them, and the reply
      // count, before a typed reply or a fresh voice call continues the same call.
      void hangUp();
      await voiceUploads.current;
      try {
        const response = await fetch('/api/challenge');
        const fresh = (await response.json() as { day: Challenge | null }).day;
        if (response.ok && fresh) { setDay(fresh); dayRef.current = fresh; }
      } catch { /* The next action response carries the saved day. */ }
    } else void hangUp();
    if (next.plan === 'voice') { if (dayRef.current?.phase === 'call') void startVoice(false); else setMode('voice'); }
    else setMode('text');
    return true;
  }
  const applyPlanRef = useRef(applyPlan);
  applyPlanRef.current = applyPlan;
  const polling = stage && Boolean(day) && day?.phase !== 'complete';
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        // A lock-free read of the plan only; the full day GET would take the game's row lock every second.
        const response = await fetch('/api/challenge?stage_plan', { signal: AbortSignal.timeout(4000) });
        const next = pendingPlan(seenPlan.current, response.ok ? (await response.json() as { stagePlan?: StagePlanState | null }).stagePlan ?? undefined : undefined);
        if (next && !stopped) await applyPlanRef.current(next);
      } catch { /* Keep polling: the presenter can tap again. */ }
      finally { if (!stopped) timer = setTimeout(poll, 1000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [polling]);
  function callAgain() { void startVoice(day?.phase !== 'call'); }
  const seconds = day ? Math.min(180, Math.max(0, 180 - Math.floor((clock - Date.parse(day.startedAt)) / 1000))) : 180;
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);
  useEffect(() => {
    if (active && seconds === 0 && !busy) {
      setDay(current => current ? { ...current, phase: 'verdict' } : current);
      void act({ type: 'end' });
    }
  }, [active, seconds, busy, error]); // The server also enforces the deadline after reload.
  // The day left the call (time cap, reload, verdict): the voice session ends with it.
  useEffect(() => { if (!active && day && (handleRef.current || voiceRef.current === 'connecting')) { setVoice('ended'); void hangUp(); void saveVoiceTurns(); } }, [active, hangUp]);
  useEffect(() => {
    if (day?.phase === 'verdict') verdictHeading.current?.focus();
    else if (active && !busy && !voiceMode) replyInput.current?.focus();
  }, [day?.phase, busy, active, voiceMode]);
  useEffect(() => { if (voiceBlocked) voiceStatus.current?.focus(); }, [voiceBlocked]);
  useEffect(() => { transcript.current?.scrollTo(0, transcript.current.scrollHeight); }, [day?.turns.length, voiceTurns.length]);
  useEffect(() => {
    if (!day) return;
    const target = day.balance;
    if (day.phase === 'call' || matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisplayBalance(target); return; }
    const from = displayBalance;
    const start = performance.now();
    let frame: number;
    const tick = (time: number) => {
      const progress = Math.min((time - start) / 260, 1);
      setDisplayBalance(Math.round(from + (target - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [day?.balance, day?.phase]);
  useEffect(() => { if (portal) portalDialog.current?.showModal(); }, [portal]);
  const companion = companionForSession({
    phase: day?.phase ?? 'intro',
    turns: voiceMode && voiceTurns.length
      ? voiceTurns.map(turn => ({ role: turn.role === 'user' ? 'user' as const : 'assistant' as const, text: turn.message }))
      : (day?.turns ?? []),
    events: day?.events ?? [],
    pending: busy,
  });

  return <main className="challenge">
    <header className="running-head"><a href="/">TELL</a><span className="pill">{voiceMode ? 'CHALLENGE · VOICE' : 'CHALLENGE · TEXT'}</span>{stage && <span className="pill">{stagePlan ? `STAGE · PLAN ${STAGE_PLANS.find(plan => plan.id === stagePlan)!.letter}` : 'STAGE · TAP A PLAN'}</span>}{day && <><span className="pill">CALL {CALL_ORDER.indexOf(day.callerId) + 1} OF 3</span><span className="pill">{caller.org.toUpperCase()}</span><button className="start-over" disabled={busy} onClick={() => { void hangUp(); setMode('text'); setVoice('connecting'); setVoiceTurns([]); setError(''); setDay(null); }}>Start over</button></>}</header>
    {error && <p role="alert" className="error">{error} <button onClick={() => location.reload()}>Reload saved day</button></p>}
    {loading ? <p role="status">Loading your saved day…</p> : !day ? <section className="intro">
      <div className="intro-copy"><p className="eyebrow">THREE CALLS. TWO STORIES.</p><h1>Keep your $1,000.<br />Finish both tasks.</h1>
      <p>{tryIt ? "What would you say to Kai?" : "Who gets your trust?"}</p>{tryIt && <p>No account. No phone number. Only anonymous outcomes are stored. Your day clears when you leave this page.</p>}
      <div className="start-row"><button className="primary" disabled={busy} onClick={() => void startVoice(true)}>Start by voice<span>Talk to Yui with your microphone</span></button></div>
      <p className="hint">Either way: an AI practice caller, the same day. Use no real personal details.</p></div>
      <figure className="planner">
        <AgentCompanion companion={companion} tone="ink" showMute />
        <p className="agent-balance">$1,000</p>
        <ul className="agent-chips"><li>Book your Bluebonnet Labs interview</li><li>Sort out the Corvanta Bank alert</li></ul>
        <button className="primary" disabled={busy} onClick={() => { setMode('text'); void act({ type: 'start' }); }}>{busy && mode === 'text' ? 'Starting…' : 'Begin practice'}</button>
      </figure>
    </section> : <>
      <h1 className="sr-only">Your Challenge day</h1>
      <div className={`board ${active ? 'on-call' : ''}`}>
        <aside className="account dim"><p className="eyebrow">YOUR BALANCE</p><p className="balance">${displayBalance.toLocaleString('en-US')}</p><p>Fictional money. Real decisions.</p>
          <h2>Day ledger</h2><ol className="ledger">{CALL_ORDER.map(id => { const result = day.calls?.find(call => call.callerId === id); return <li key={id}>{CALLERS[id].name} · {CALLERS[id].org}<strong>{result ? <Stamp>{result.verdict} · {result.cost ? `−$${result.cost}` : '$0 lost'}</Stamp> : day.callerId === id ? 'IN PROGRESS' : 'UP NEXT'}</strong></li>; })}</ol>
        </aside>
        <section className="caller" aria-label={`${caller.name} call`}>
          <div className="caller-head">
            <AgentCompanion companion={companion} tone="ink" compact showMute />
            <div className="call-meta"><span className="pill">AI practice caller</span>{active && <span className="pill">Listening</span>}<span className="timer">{active ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Call ended'}</span></div>
          </div>
          {day.phase === 'complete' && <div className="agent-challenge-actions"><a href="#reveal-heading">Practice this skill</a><a href="/try-it">Try without guidance</a></div>}
          <p className={`call-state ${voiceMode && !voiceLive ? 'still' : ''}`}><span className="dot" aria-hidden="true">●</span>{voiceMode && active && !voiceLive ? (voice === 'connecting' ? 'Connecting' : 'Not connected') : active ? 'Call active' : 'Call ended'}</p><h2>{caller.name}</h2><p>{caller.org}</p><p className="scenario">{caller.scenario}</p><p className="limits">Fictional details only · Date of birth: {FAKE_SECRETS.date_of_birth} · Address: {FAKE_SECRETS.home_address} · PIN: {FAKE_SECRETS.account_pin}</p>
          {active && (day.codeVisible || (voiceMode && voiceCode)) && <Toast><strong>Corvanta · One-time code</strong><p className="bank-code">{FAKE_SECRETS.live_code}</p><p>Do not share this code with a caller.</p></Toast>}
          <p className="limits">12 replies or 3 minutes · {voiceMode ? spokenReplies : day.replies}/12 replies{voiceMode && ' · say “stop drill” to end'}</p>
          {stage && stagePlan === 'phone' && active && !voiceMode && <p className="voice-note" role="status">Plan A · {caller.name} is on the stage phone. Switch to Plan B or C on the presenter screen if the call drops.</p>}
          {voiceMode && active && voice === 'connecting' && <p className="voice-note" role="status">Calling {caller.name}. Allow the microphone when your browser asks.</p>}
          {voiceBlocked && active && <div className="voice-failed" role="alert"><p ref={voiceStatus} tabIndex={-1}>{voice === 'mic-denied' ? `Your microphone is off, so ${caller.name} can’t hear you. Play this call in text instead.` : 'The call didn’t connect. Your day is saved.'}</p><div className="voice-actions">{voice === 'mic-denied' ? <><button className="primary" disabled={busy} onClick={playInText}>Play in text</button><button disabled={busy} onClick={callAgain}>Call again</button></> : <><button className="primary" disabled={busy} onClick={callAgain}>Call again</button><button disabled={busy} onClick={playInText}>Play in text</button></>}</div></div>}
          {voiceLive && callHandle && <Waveform handle={callHandle} caller={caller.name} />}
          <div className="transcript" hidden={voiceMode && voiceTurns.length === 0} ref={transcript} role="log" aria-label="Call transcript" aria-live="polite" tabIndex={0}>
            {voiceMode ? voiceTurns.map((turn, i) => <div className={`turn ${turn.role === 'user' ? 'user' : 'assistant'}`} key={i}><strong>{turn.role === 'user' ? 'You' : caller.name}</strong><p>{turn.message}</p></div>) : day.turns.map((turn, i) => <div className={`turn ${turn.role}`} key={i}><strong>{turn.role === 'system' ? 'Tell' : turn.role === 'user' ? 'You' : caller.name}</strong><p>{turn.text}</p>{turn.role === 'assistant' && <span className="source">{turn.source === 'nemotron' ? 'Nemotron · approved script line' : 'Script'}</span>}</div>)}
          </div>
          {!voiceMode && <p className="source">Each reply shows whether it used Nemotron or the script.</p>}
          {!voiceMode && active && <button className="switch-voice" disabled={busy} onClick={() => void startVoice(false)}>Talk to {caller.name} by voice instead<span>Uses your microphone · the 3-minute clock keeps running</span></button>}
          {active && !voiceMode && <form onSubmit={event => { event.preventDefault(); void act({ type: 'reply', text }); }}>
            <label htmlFor="reply">Your reply · use no real personal details</label><div className="reply-row"><input ref={replyInput} id="reply" maxLength={1000} value={text} onChange={event => setText(event.target.value)} disabled={busy} autoComplete="off" /><button disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Send'}</button></div>
            <p className="hint">Type “stop drill” to end at any time.</p>
          </form>}
          {day.phase === 'verdict' && <section className="verdict"><h3 ref={verdictHeading} tabIndex={-1}>Could you tell?</h3><p>Choose one verdict.</p>{savingVoice && <p role="status">Saving your spoken turns…</p>}{voiceSaveError && <p role="alert">Your spoken turns were not saved. <button onClick={() => void saveVoiceTurns()}>Save again</button></p>}{([['Real', 'I trust this caller.'], ['Scam', 'I do not trust this caller.'], ['Unverified', 'I will check another way.']] as const).map(([verdict, description]) => <button key={verdict} disabled={busy || savingVoice || voiceSaveError} onClick={() => void act({ type: 'verdict', verdict })}><strong>{verdict}</strong><span>{description}</span></button>)}</section>}
          {day.phase === 'between' && <section role="status" className="between"><h3>Verdict saved: {day.verdict}</h3><p>Balance and tasks saved.</p><button className="primary" disabled={busy} onClick={() => void nextCall()}>{voiceMode ? 'Next call by voice' : 'Next call'}</button></section>}
          {day.phase === 'complete' && <section className="day-result" aria-label="Day result"><h3>Your day result</h3><p className="balance">${day.balance.toLocaleString('en-US')}</p><p>{day.balance === 1000 && day.interview === 'BOOKED' && day.bank === 'RESOLVED' ? 'Both tasks done. You kept your $1,000.' : 'Your money and tasks show the outcome of your choices.'}</p><p>Interview: {day.interview === 'BOOKED' ? 'Done · Tuesday at 10 AM' : 'Not completed'}</p><p>Bank alert: {day.bank === 'RESOLVED' ? 'Done' : day.bank === 'FAILED' ? 'Failed · Code shared' : 'Not completed · Call Corvanta to check'}</p><ul>{day.calls.map(call => <li key={call.callerId}>{CALLERS[call.callerId].name}: {call.verdict} · ${call.cost} lost</li>)}</ul><div className="start-row"><button className="primary" disabled={busy} onClick={() => void startVoice(true)}>Play again by voice<span>Talk to Yui with your microphone</span></button><button className="start-text" disabled={busy} onClick={() => { setMode('text'); void act({ type: 'start' }); }}>Play again in text<span>Type your replies</span></button></div></section>}
        </section>
        <aside className="tasks dim"><h2>Your two tasks</h2><div className="task"><span className="pill">{!active && day.interview === 'BOOKED' ? <Stamp>{day.interview}</Stamp> : day.interview}</span><h3>Book your Bluebonnet Labs interview</h3></div><div className="task"><span className="pill">{!active && day.bank !== 'OPEN' ? <Stamp key={day.bank}>{day.bank}</Stamp> : day.bank}</span><h3>Sort out the Corvanta Bank alert</h3></div>
          <button className="app-tile" disabled={busy} onClick={() => void act({ type: 'portal' })}>Bluebonnet portal <span>Open candidate portal ↗</span></button><button className="app-tile" disabled={busy} onClick={() => void act({ type: 'bank' })}>Corvanta Bank <span>Open your bank app ↗</span></button>
        </aside>
      </div>
      {day.phase === 'complete' && <Reveal requestReveal={tryIt ? () => requestDay({ type: 'reveal' }) : undefined} day={day} busy={busy} act={act} />}
    </>}
    <nav className="moves" aria-label="Your four moves">{moves.map(([move, hint]) => <button key={move} disabled={busy || !active || (voiceMode && (move === 'Probe' || move === 'Protect'))} onClick={() => {
      if (move === 'Disconnect') { if (handleRef.current) endVoiceCall(); else { if (voiceMode) { void hangUp(); setVoice('ended'); } void act({ type: 'end' }); } }
      else if (move === 'Verify') void act({ type: day?.callerId === 'fraud_team' ? 'bank' : 'portal' });
      else { setText(move === 'Probe' ? 'How can I check this through a number I already have?' : 'I do not share personal details on a call.'); replyInput.current?.focus(); }
    }}><strong>{move}</strong><span>{voiceMode && (move === 'Probe' || move === 'Protect') ? `${hint}, out loud` : hint}</span></button>)}</nav>
    <Sheet open={bankOpen} onClose={() => setBankOpen(false)} label="Fictional Corvanta bank app">
      <p className="eyebrow">FICTIONAL BANK APP</p><h2>Corvanta Bank</h2><p>Alex · Card ending 4417</p><p>Recent charge: $23.40 at a restaurant yesterday.</p>
      {!day?.callbackStep ? <><p>Use the number saved in this app to check an alert.</p><button disabled={busy || !day || day.callerId !== 'fraud_team' || active} onClick={() => void act({ type: 'callback_start' })}>Call Corvanta</button>{active && <p>End the current call before you call back.</p>}</> : <section aria-label="Corvanta callback"><h3>Aki · AI practice agent</h3><div role="log" aria-live="polite">{CALLBACK_LINES.slice(0, day.callbackStep).map(line => <p key={line}>{line}</p>)}</div>{day.callbackStep < 3 ? <button disabled={busy} onClick={() => void act({ type: 'callback_next' })}>{day.callbackStep === 1 ? 'Yes, this is Alex. Was there an alert?' : 'Thank you. Finish callback'}</button> : <p role="status">Callback saved as a Verify event. {day.bank === 'FAILED' || day.leaked.includes('live_code') ? 'The code was already shared. The bank task remains failed.' : 'Bank task complete.'}</p>}</section>}
      <button onClick={() => setBankOpen(false)}>Back to your day</button>
    </Sheet>
    <dialog ref={portalDialog} className="portal" onClose={() => setPortal(false)}><p className="eyebrow">FICTIONAL COMPANY PORTAL</p><h2>Bluebonnet Labs</h2><h3>Alex · Operations analyst interview</h3><p>Booked · Tuesday at 10 AM</p><p>Bluebonnet never charges for equipment.</p><p>Portal check saved as a Verify event.</p><button onClick={() => portalDialog.current?.close()}>Back to your day</button></dialog>
  </main>;
}
