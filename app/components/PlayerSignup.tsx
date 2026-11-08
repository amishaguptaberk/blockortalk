'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Player = { id: string; nickname: string };
type Result = { player?: Player | null; errors?: { email?: string; nickname?: string }; error?: string };

export default function PlayerSignup() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Result['errors']>({});
  const [message, setMessage] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/players', { signal: controller.signal }).then(async response => {
      if (response.ok) setPlayer(((await response.json()) as Result).player ?? null);
    }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setErrors({}); setMessage('');
    try {
      const response = await fetch('/api/players', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: player ? 'signout' : mode, email: data.get('email'), nickname: data.get('nickname') }),
      });
      const result = await response.json() as Result;
      if (!response.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.error ?? 'Check the fields below.');
        if (result.errors?.email) emailRef.current?.focus();
        else if (result.errors?.nickname) nicknameRef.current?.focus();
        return;
      }
      setPlayer(result.player ?? null);
      setMessage(result.player ? `You are signed in as ${result.player.nickname}.` : 'You are signed out.');
    } catch { setMessage('Sign-in is unavailable. Please try again.'); }
    finally { setBusy(false); }
  }

  return <section className="player-signup" aria-labelledby="player-heading" aria-busy={loading || busy}>
    <h2 id="player-heading">{player ? `Welcome, ${player.nickname}` : mode === 'signup' ? 'Create your Player profile' : 'Sign in to Tell'}</h2>
    <p className="player-message" role="status">{loading ? 'Checking your sign-in…' : message}</p>
    {!loading && <form onSubmit={submit} noValidate>
      {player ? <p>Your profile is saved on this device for 30 days. <a href="/play">Choose a Call scenario</a></p> : <>
        <p>{mode === 'signup' ? 'Use an email and nickname to save your play.' : 'Enter the email you used to sign up.'}</p>
        <div className="player-fields">
          <div><label htmlFor="player-email">Email</label>
            <input ref={emailRef} id="player-email" name="email" type="email" autoComplete="email" required aria-invalid={!!errors?.email} aria-describedby={errors?.email ? 'player-email-error' : undefined} />
            {errors?.email && <p id="player-email-error" className="player-error">{errors.email}</p>}
          </div>
          {mode === 'signup' && <div><label htmlFor="player-nickname">Nickname</label>
            <input ref={nicknameRef} id="player-nickname" name="nickname" autoComplete="nickname" required aria-invalid={!!errors?.nickname} aria-describedby={'player-nickname-help' + (errors?.nickname ? ' player-nickname-error' : '')} />
            <p id="player-nickname-help" className="player-help">3 to 20 characters. Shown on the Leaderboard.</p>
            {errors?.nickname && <p id="player-nickname-error" className="player-error">{errors.nickname}</p>}
          </div>}
        </div>
      </>}
      <div className="player-actions"><button className="ui-button ui-button--primary" disabled={busy} type="submit">{busy ? 'Please wait…' : player ? 'Sign out' : mode === 'signup' ? 'Sign up' : 'Sign in'}</button>
        {!player && <button className="ui-button" type="button" disabled={busy} onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErrors({}); setMessage(''); }}>{mode === 'signup' ? 'Already a Player? Sign in' : 'New Player? Sign up'}</button>}
      </div>
    </form>}
  </section>;
}
