import { meHandlers } from '../../lib/season/meServer';
import { headers } from 'next/headers';
import type { MeView } from '../../lib/season/me';
import './me.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your analysis · Tell' };

async function load(): Promise<MeView | 'signin' | 'down'> {
  try {
    const response = await meHandlers().GET(new Request('https://tell.local/api/me', { headers: await headers() }));
    if (response.status === 401) return 'signin';
    return response.ok ? await response.json() as MeView : 'down';
  } catch { return 'down'; }
}

export default async function MePage() {
  const view = await load();
  return (
    <main className="me">
      <h1>Your analysis</h1>
      {view === 'signin' && <p className="me-note">Sign in to see your analysis.</p>}
      {view === 'down' && <p className="me-note">Your analysis is not available right now. Please try again soon.</p>}
      {typeof view === 'object' && view.state === 'locked' && (
        <p className="me-note" role="status">{view.message}</p>
      )}
      {typeof view === 'object' && view.state === 'ready' && view.sections.map(section => (
        <section key={section.id} className="me-section" aria-labelledby={`me-${section.id}`}>
          <h2 id={`me-${section.id}`}>{section.title}</h2>
          <p className="me-sentence">{section.sentence}</p>
          {section.facts.length > 0 && (
            <ul className="me-facts">{section.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
          )}
          {section.link && <a className="me-link" href={section.link.href}>Try {section.link.label}</a>}
        </section>
      ))}
    </main>
  );
}
