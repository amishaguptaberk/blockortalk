import { headers } from 'next/headers';
import CallResults from '../../CallResults';
import { resultsHandlers } from '../../../../lib/season/resultsServer';
import type { ResultsView } from '../../../../lib/season/results';
import '../../results.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your results · Tell' };

type Loaded = { view: ResultsView } | { message: string };

async function load(callId: string): Promise<Loaded> {
  try {
    const response = await resultsHandlers().GET(new Request(`https://tell.local/api/play/results/${encodeURIComponent(callId)}`, { headers: await headers() }), callId);
    if (response.ok) return { view: (await response.json() as { results: ResultsView }).results };
    const { error } = await response.json() as { error?: string };
    return { message: error ?? 'Your results are not available right now. Please try again.' };
  } catch {
    return { message: 'Your results are not available right now. Please try again.' };
  }
}

export default async function ResultsPage({ params }: { params: Promise<{ callId: string }> }) {
  const loaded = await load((await params).callId);
  return (
    <main className="call-results-page">
      {'view' in loaded
        ? <CallResults view={loaded.view} />
        : <section className="call-results"><p className="call-results-note" role="status">{loaded.message}</p><a className="call-results-link" href="/play">Back to calls</a></section>}
    </main>
  );
}
