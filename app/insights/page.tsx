import { headers } from 'next/headers';
import { insightsHandlers } from '../../lib/insights/server';
import type { InsightsView } from '../../lib/insights/routes';
import './insights.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Carrier insights · Tell', robots: { index: false, follow: false } };

const OUTCOME_LABEL: Record<string, string> = { 'fell for': 'Fell for', caught: 'Caught', 'false alarm': 'False alarm', 'trusted real': 'Trusted real' };

async function load(synthetic: boolean): Promise<InsightsView | 'locked' | 'down'> {
  try {
    const response = await insightsHandlers().GET(new Request(`https://tell.local/api/insights${synthetic ? '?synthetic=1' : ''}`, { headers: await headers() }));
    if (response.status === 401) return 'locked';
    return response.ok ? await response.json() as InsightsView : 'down';
  } catch { return 'down'; }
}

const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ synthetic?: string; error?: string }> }) {
  const query = await searchParams;
  const synthetic = query.synthetic === '1';
  const view = await load(synthetic);

  if (view === 'locked') {
    return (
      <main className="insights">
        <h1>Carrier insights</h1>
        <form className="insights-lock" method="post" action="/api/insights/unlock">
          <label htmlFor="insights-password">Enter the password</label>
          <input id="insights-password" name="password" type="password" autoComplete="off" required />
          {query.error && <p className="insights-error" role="alert">That password did not work.</p>}
          <button className="ui-button ui-button--primary" type="submit">Open</button>
        </form>
      </main>
    );
  }
  if (view === 'down') {
    return <main className="insights"><h1>Carrier insights</h1><p className="insights-note">Insights are not available right now. Please try again soon.</p></main>;
  }

  const csvHref = `/api/insights/csv${view.synthetic ? '?synthetic=1' : ''}`;
  return (
    <main className="insights">
      <h1>Carrier insights</h1>
      <p className="insights-note">Anonymous totals by Category, Tactic and outcome. Any group with fewer than {view.minPlayers} Players is hidden.</p>

      <p className={view.synthetic ? 'insights-label insights-label--synthetic' : 'insights-label'} role="status">
        Showing: <strong>{view.label}</strong>{view.synthetic && ' — made-up Players for the demo, not real people.'}
      </p>
      <div className="insights-actions">
        <a className="ui-button" href={view.synthetic ? '/insights' : '/insights?synthetic=1'}>{view.synthetic ? 'Show real Players' : 'Show synthetic demo data'}</a>
        <a className="ui-button" href={csvHref} download>Download CSV</a>
      </div>

      <section className="insights-section" aria-labelledby="insights-summary">
        <h2 id="insights-summary">Summary</h2>
        <p className="insights-summary">{view.summary.text}</p>
        <p className="insights-meta">
          {view.summary.generatedAt ? `Written ${when(view.summary.generatedAt)}${view.summary.stale ? '. This is the latest summary; a new one could not be written just now.' : '.'}` : 'No written summary yet.'}
          {view.summary.synthetic && ' Based on synthetic demo data.'}
        </p>
      </section>

      <section className="insights-section" aria-labelledby="insights-totals">
        <h2 id="insights-totals">Totals · {view.label}</h2>
        {view.groups.length === 0 ? <p className="insights-note">No finished calls yet.</p> : (
          <div className="insights-scroll">
            <table className="insights-table">
              <caption className="ui-sr-only">Calls by Category, Tactic and outcome. {view.label}.</caption>
              <thead><tr><th scope="col">Category</th><th scope="col">Tactic</th><th scope="col">Outcome</th><th scope="col">Calls</th><th scope="col">Players</th></tr></thead>
              <tbody>
                {view.groups.map(group => (
                  <tr key={`${group.category}|${group.tactic}|${group.outcome}`}>
                    <th scope="row">{group.category}</th>
                    <td>{group.tactic}</td>
                    <td>{OUTCOME_LABEL[group.outcome] ?? group.outcome}</td>
                    {group.hidden ? <td colSpan={2} className="insights-hidden">{group.note}</td> : <><td>{group.calls}</td><td>{group.players}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
