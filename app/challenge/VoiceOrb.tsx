'use client';

import { useEffect, useRef } from 'react';
import type { BrowserCallHandle } from '../../lib/voice/browserCall';
import './voice-orb.css';

export default function VoiceOrb({ handle, active, connecting }: { handle: BrowserCallHandle | null; active: boolean; connecting: boolean }) {
  const orb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = orb.current;
    if (!element) return;
    let visible = true;
    const update = () => element.style.setProperty('--orb-play', visible && !document.hidden ? 'running' : 'paused');
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; update(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  useEffect(() => {
    if (!handle || !active) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const level = Math.min(1, Math.max(handle.outputLevel(), handle.inputLevel()));
      orb.current?.style.setProperty('--voice-level', String(level));
    }, 80);
    return () => { window.clearInterval(timer); orb.current?.style.setProperty('--voice-level', '0'); };
  }, [handle, active]);
  return <div className="voice-stage">
    <div className="orb-instrument" aria-hidden="true">
      <svg className="orb-orbit" viewBox="0 0 240 240" fill="none"><circle cx="120" cy="120" r="113" stroke="currentColor" strokeDasharray="1 13"/><circle cx="120" cy="120" r="101" stroke="currentColor" strokeDasharray="72 28 12 90 35 400"/><ellipse cx="120" cy="120" rx="118" ry="40" stroke="currentColor" transform="rotate(-28 120 120)"/><path d="M120 0v12M120 228v12M0 120h12M228 120h12" stroke="currentColor"/></svg>
      <div ref={orb} className="voice-orb" data-live={active && Boolean(handle)}><span /></div>
    </div>
    <p>{connecting ? 'Connecting your call' : active && handle ? 'Speak naturally. You’re on the call.' : active ? 'Your conversation starts here.' : 'Take a moment. Make your decision.'}</p>
    <span>Practice conversation · fictional details only</span>
  </div>;
}
