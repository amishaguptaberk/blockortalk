'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Blokbuks from './Blokbuks';
import './app-shell.css';

type Profile = { nickname: string } | null;
type PlayerResponse = { player: Profile };
type SeasonResponse = { ownRank: { blokbuks: number } | null };
const links = [{ href: '/play', label: 'Play' }, { href: '/me', label: 'Me' }, { href: '/leaderboard', label: 'Leaderboard' }];

/** Use on Season pages only. Challenge, Try it and presenter keep their own layouts. */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile>(null);
  const [amount, setAmount] = useState<number | null>();
  const [state, setState] = useState<'loading' | 'ready' | 'down'>('loading');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading'); setAmount(undefined); setProfile(null);
    async function load() {
      try {
        const response = await fetch('/api/players', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error();
        const { player } = await response.json() as PlayerResponse;
        if (controller.signal.aborted) return;
        setProfile(player); setState('ready');
        if (!player) return;
        const season = await fetch('/api/season', { signal: controller.signal, cache: 'no-store' }).catch(() => null);
        if (controller.signal.aborted) return;
        if (!season?.ok) { setAmount(null); return; }
        const { ownRank } = await season.json() as SeasonResponse;
        // Players who join after the deadline have no rank and start at 0 B.
        if (!controller.signal.aborted) setAmount(ownRank?.blokbuks ?? 0);
      } catch { if (!controller.signal.aborted) setState('down'); }
    }
    void load();
    const interval = setInterval(load, 10000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [pathname, retry]);

  return <>
    <a className="app-skip" href="#season-content">Skip to content</a>
    <header className="app-header">
      <a className="app-brand" href="/" aria-label="Tell home">Tell</a>
      <nav aria-label="Main navigation">{links.map(link => <a key={link.href} href={link.href}
        aria-current={pathname === link.href || pathname.startsWith(link.href + '/') ? 'page' : undefined}>{link.label}</a>)}</nav>
      <div className="app-player" aria-label="Player profile">
        {state === 'loading' ? <span role="status">Loading profile…</span> : state === 'down' ? <><span>Profile unavailable</span><button className="ui-button" onClick={() => setRetry(value => value + 1)}>Try again</button></> : profile ? <>
          <span className="app-nickname">{profile.nickname}</span>
          {amount === undefined ? <span className="app-score-note" role="status">Loading Blokbuks…</span> : amount === null ? <span className="app-score-note">Blokbuks unavailable</span> : <Blokbuks amount={amount} />}
        </> : <a href="/profile">Sign in</a>}
      </div>
    </header>
    <div id="season-content" tabIndex={-1}>{children}</div>
    <footer className="app-footer"><span>Tell · Every scam has a tell.</span><a href="/credits" aria-current={pathname === '/credits' ? 'page' : undefined}>Credits</a></footer>
  </>;
}
