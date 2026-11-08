'use client';

import { useEffect, useRef, useState } from 'react';
import { startBrowserCall, type BrowserCallHandle } from '../../lib/voice/browserCall';
import VoiceOrb from '../challenge/VoiceOrb';
import { SCENARIOS, type ScenarioId } from '../../lib/practice/catalog';
import { scenarioCatalog } from '../../lib/season/scenarios/catalog';
import SpritePlayer from '../components/SpritePlayer';
import './dashboard.css';
import Welcome from './Welcome';
import PracticeCard from './PracticeCard';
import TypedGreeting from './TypedGreeting';
import HubBoard from './HubBoard';
import Leaderboard from '../leaderboard/Leaderboard';
import { dashboardView, type DashboardView } from './view';

type View = DashboardView;
type Turn = { role: 'caller' | 'you'; text: string };
type Alert = { title: string; link: string; summary: string; date?: string };

export default function Dashboard({ initialView = 'Home' }: { initialView?: View }) {
  const [playerName, setPlayerName] = useState('');
  const [view, setView] = useState<View>(initialView);
  useEffect(() => {
    const restore = () => {
      setView(dashboardView(new URLSearchParams(location.search).get('view') ?? undefined));
      stopVoice(); setScenario(null); setShowCode(false);
    };
    restore(); window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newsState, setNewsState] = useState('Loading consumer alerts…');
  const [saved, setSaved] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceHandle, setVoiceHandle] = useState<BrowserCallHandle | null>(null);
  const voiceRef = useRef<BrowserCallHandle | null>(null);
  const connection = useRef(0);
  const [connecting, setConnecting] = useState(false);
  function stopVoice() { connection.current += 1; void voiceRef.current?.end(); voiceRef.current = null; setVoiceHandle(null); setConnecting(false); }
  useEffect(() => () => { connection.current += 1; void voiceRef.current?.end(); }, []);
  const [ended, setEnded] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ explanation: string; safest: string } | null>(null);
  useEffect(() => {
    fetch('/api/challenge').then(response => response.json()).then(value => setSaved(Boolean((value as { day?: unknown }).day))).catch(() => {});
    fetch('/api/news').then(async response => {
      if (!response.ok) throw new Error();
      const value = await response.json() as { items: Alert[] };
      setAlerts(value.items); setNewsState(value.items.length ? '' : 'No alerts available right now.');
    }).catch(() => setNewsState('Consumer alerts are unavailable right now. Read the FTC feed directly.'));
  }, []);
  async function practice(action: 'open' | 'reply' | 'verdict', scenarioId: ScenarioId, verdict?: string) {
    if (busy) return;
    setBusy(true); setError('');
    const next = action === 'reply' ? [...turns, { role: 'you' as const, text }] : turns;
    try {
      const response = await fetch('/api/practice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, scenarioId, turns: next, verdict }) });
      const value = await response.json() as { error?: string; turns?: Turn[]; line?: string; ended?: string; showCode?: boolean; explanation: string; safest: string };
      if (!response.ok) throw new Error(value.error ?? 'Please try again.');
      if (action === 'open') { setShowCode(false); setScenario(scenarioId); setTurns(value.turns ?? []); setResult(null); setEnded(false); }
      if (action === 'reply') { if(value.showCode)setShowCode(true); setTurns(value.line ? [...next, { role: 'caller', text: value.line }] : next); setText(''); setEnded(Boolean(value.ended)); }
      if (action === 'verdict') setResult(value);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function practiceVoice(scenarioId: ScenarioId) {
    stopVoice();
    const attempt = connection.current;
    setShowCode(false); setScenario(scenarioId); setTurns([]); setResult(null); setEnded(false); setError(''); setConnecting(true);
    try {
      const response = await fetch('/api/voice/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callerId: scenarioId }) });
      const session = await response.json() as { conversationToken?: string };
      if (!response.ok || !session.conversationToken) throw new Error('Voice is unavailable. You can still practice in text.');
      if (attempt !== connection.current) return;
      const selected = SCENARIOS.find(item => item.id === scenarioId)!;
      const handle = await startBrowserCall({ callerId: scenarioId, conversationToken: session.conversationToken, variables: selected.voiceVariables,
        onTurn: turn => { if (attempt === connection.current) setTurns(current => [...current, { role: turn.role === 'user' ? 'you' : 'caller', text: turn.message }]); },
        onEnded: () => { if (attempt === connection.current) { setEnded(true); setVoiceHandle(null); voiceRef.current = null; setConnecting(false); } },
        onMicDenied: () => { if (attempt === connection.current) setError('Microphone access was denied. Choose text practice or allow your microphone and retry.'); },
      });
      if (attempt !== connection.current) { void handle?.end(); return; }
      if (!handle) throw new Error('Voice did not connect. Return to scenarios to retry or choose text.');
      voiceRef.current = handle; setVoiceHandle(handle);
    } catch (failure) { if (attempt === connection.current) { setError(failure instanceof Error ? failure.message : 'Voice did not connect.'); setEnded(true); } }
    finally { if (attempt === connection.current) setConnecting(false); }
  }
  const pendingBoard = useRef(false);
  function navigate(next: View) { stopVoice(); setView(next); setScenario(null); setError(''); history.pushState(null, '', next === 'Home' ? '/dashboard' : `/dashboard?view=${next}`); }
  function scrollBoard() {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    document.getElementById('standings')?.scrollIntoView({ behavior });
  }
  function openBoard() {
    pendingBoard.current = true;
    if (view === 'Home') { pendingBoard.current = false; scrollBoard(); }
    else navigate('Home');
  }
  useEffect(() => { if (view === 'Home' && pendingBoard.current) { pendingBoard.current = false; scrollBoard(); } }, [view]);
  return <main className="hub">
    <Welcome onName={setPlayerName} />
    {playerName && <TypedGreeting name={playerName} />}
    <header className="hub-nav"><a href="/">Block or Talk<span>Practice your judgment.</span></a><nav aria-label="Dashboard">{(['Home', 'Scenarios', 'News'] as const).map(item => <button key={item} aria-current={view === item ? 'page' : undefined} onClick={() => navigate(item)}>{item}</button>)}<button onClick={openBoard}>Leaderboard</button></nav><a className="hub-launch" href="/challenge">Enter Challenge ↗</a></header>
    <section className="hub-intro"><div className="hub-mascot"><SpritePlayer personality="planner" animation="idle" /></div><div><p>Your practice space</p><h1>{view === 'Home' ? 'A little practice. Better instincts.' : view === 'Leaderboard' ? 'Good judgment adds up.' : view === 'Scenarios' ? 'One call. Your judgment.' : 'Stay one step ahead.'}</h1><p>{view === 'Home' ? 'Choose a challenge, practice a single call, or catch up on the latest alerts. Your next move starts here.' : view === 'Leaderboard' ? 'Practice spotting scam calls. Earn Blokbuks with each Scored call.' : view === 'Scenarios' ? 'Practice individual calls in text. No money or tasks to manage.' : 'Consumer alerts from the Federal Trade Commission.'}</p></div></section>
    {error && <p role="alert">{error}</p>}
    {view === 'Home' && <section className="hub-grid" aria-label="Choose your practice">
      <article className="hub-card hub-feature"><span className="hub-chip">The Challenge</span><div><h2>Three calls.<br />Keep your $1,000.</h2><p>Book your interview. Check your bank alert. Decide who gets your trust.</p></div><a className="hub-primary" href="/challenge">{saved ? 'Continue your day' : 'Start your day'} <span>↗</span></a><small>Voice or text · fictional money · no signup</small></article>
      <article className="hub-card"><span className="hub-chip">Scenario practice</span><h2>A single call.<br />A fresh perspective.</h2><p>Meet Yui, Ren, Kai, or Aki. Make a decision and see the evidence.</p><div className="hub-people">{SCENARIOS.map(item => <span key={item.id}>{item.caller}</span>)}</div><button className="hub-link" onClick={() => navigate('Scenarios')}>Choose a scenario ↗</button></article>
      <article className="hub-card hub-orb-card"><span className="hub-chip">Speak or type</span><div className="hub-orb" aria-hidden="true"/><h2>Your call. Your pace.</h2><p>Talk naturally in Challenge, or take your time with text. Voice carries across all three callers.</p><a className="hub-link" href="/challenge">Open call options ↗</a></article>
      <article className="hub-card hub-news"><span className="hub-chip">FTC consumer alerts</span><h2>What’s happening now.</h2>{alerts.slice(0, 2).map(item => <a key={item.link} href={item.link} target="_blank" rel="noreferrer">{item.title} ↗</a>)}{newsState && <p role="status">{newsState}</p>}<button className="hub-link" onClick={() => navigate('News')}>Read the latest ↗</button></article>
      <article className="hub-card hub-rule"><span className="hub-chip">Take it with you</span><h2>Knowing your details doesn’t prove who’s calling.</h2><p>Hang up. Call back on a number you already have.</p><span className="hub-rule-number">One rule. Any call.</span></article>
    </section>}
    {view === 'Home' && <HubBoard />}
    {view === 'Scenarios' && !scenario && <section className="hub-library">{SCENARIOS.map(item => <article className="hub-card" key={item.id}><span className="hub-chip">{item.theme} · {item.direction}</span><h2>{item.caller}</h2><p>{item.org}</p><p>{item.card}</p><button disabled={busy || connecting} className="hub-primary" onClick={() => void practiceVoice(item.id)}>Play by voice ↗</button><button disabled={busy || connecting} className="hub-link" onClick={() => void practice('open', item.id)}>Practice in text ↗</button></article>)}{scenarioCatalog.map(item => <article className="hub-card" key={item.id}><span className="hub-chip">{item.category}</span><h2>{item.org}</h2><p>{item.card.facts[0]}</p><a className="hub-primary" href={'/play/' + encodeURIComponent(item.id)}>Practice this call ↗</a></article>)}</section>}
    {view === 'Scenarios' && scenario && <section className="hub-practice"><button className="hub-link" disabled={busy} onClick={() => { stopVoice(); setScenario(null); setShowCode(false); }}>← All scenarios</button><h2>{SCENARIOS.find(item => item.id === scenario)?.caller} · Practice call</h2><p>Use fictional details only.</p><PracticeCard scenario={SCENARIOS.find(item => item.id === scenario)!} showCode={showCode} voiceMode={Boolean(voiceHandle || connecting)}/>{(voiceHandle || connecting) && <><VoiceOrb handle={voiceHandle} active={Boolean(voiceHandle)} connecting={connecting} /><button onClick={() => { stopVoice(); setEnded(true); }}>End voice call</button></>}<div className="hub-transcript" role="log" aria-label="Practice transcript" aria-live="polite">{turns.map((turn, index) => <p key={index} data-role={turn.role}><strong>{turn.role === 'you' ? 'You' : 'Caller'}</strong>{turn.text}</p>)}</div>{result ? <div role="status"><h3>The evidence</h3><p>{result.explanation}</p><p>{result.safest}</p></div> : <>{!ended && !voiceHandle && !connecting && <form onSubmit={event => { event.preventDefault(); void practice('reply', scenario); }}><label htmlFor="practice-reply">Your reply</label><div><input id="practice-reply" maxLength={1000} value={text} onChange={event => setText(event.target.value)} disabled={busy}/><button disabled={busy || !text.trim()}>Send</button></div></form>}<h3>What’s your verdict?</h3><div className="hub-verdict">{['Real', 'Scam', 'Unverified'].map(verdict => <button key={verdict} disabled={busy || connecting || Boolean(voiceHandle)} onClick={() => void practice('verdict', scenario, verdict)}>{verdict}</button>)}</div></>}</section>}
    {view === 'News' && <section className="hub-library">{newsState && <p role="status">{newsState} <a href="https://consumer.ftc.gov/consumer-alerts">Read FTC alerts ↗</a></p>}{alerts.map(item => <article className="hub-card" key={item.link}><span className="hub-chip">FTC · Consumer alert</span><h2>{item.title}</h2><p>{item.summary}</p><a className="hub-link" href={item.link} target="_blank" rel="noreferrer">Read the source ↗</a></article>)}</section>}
    {view === 'Leaderboard' && <Leaderboard embedded />}
    <footer className="hub-footer">Block or Talk · Fictional calls. Practical instincts.<a href="#standings" onClick={event => { event.preventDefault(); openBoard(); }}>Leaderboard</a><a href="/profile">Player profile</a><a href="/me">Your analysis</a><a href="/about">About the project ↗</a></footer>
  </main>;
}
