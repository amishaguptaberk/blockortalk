import type { ResultsView } from '../../lib/season/results';

/**
 * The results screen after each call (BS-11). Presentational only: the server builds the view.
 * Order: Call type, Scored moments, right/wrong, Blokbuks and rank, Scored calls left.
 * Every right/wrong carries a text label, never colour alone.
 */
export default function CallResults({ view }: { view: ResultsView }) {
  return (
    <section className="call-results" aria-labelledby="call-results-headline">
      <p className="call-results-eyebrow">{view.heading}</p>
      <h1 id="call-results-headline" className="call-results-headline">{view.headline}</h1>

      <ol className="call-results-moments" aria-label="Scored moments">
        {view.moments.map(moment => (
          <li key={moment.n} className={`call-results-moment ${moment.right ? 'is-right' : 'is-wrong'}`}>
            <p className="call-results-moment-head">
              <span className="call-results-mark" aria-hidden="true">{moment.mark}</span>
              <strong>{moment.status}</strong>
              <span className="call-results-moment-label">{moment.label}</span>
            </p>
            {moment.words && <blockquote className="call-results-words">{moment.words}</blockquote>}
            <p className="call-results-why">{moment.why}</p>
          </li>
        ))}
      </ol>

      <div className="call-results-score" role="status">
        <p className="call-results-summary">{view.summary}</p>
        <p className="call-results-blokbuks">
          <strong>{view.blokbuks.text}</strong>
          {view.blokbuks.total !== null && <span> · Total B {view.blokbuks.total.toLocaleString('en-US')}</span>}
        </p>
        {view.rank && <p className="call-results-rank">Rank {view.rank}</p>}
        {view.scoredByRules && <p className="call-results-note">Scored by rules</p>}
      </div>

      <p className="call-results-left">{view.callsLeft}</p>

      <nav className="call-results-actions" aria-label="What next">
        <a className="call-results-link is-primary" href="/play">Play another</a>
        {view.analysisUnlocked
          ? <a className="call-results-link" href="/me">See my analysis</a>
          : <span className="call-results-locked">Play one more call to unlock your analysis</span>}
        <a className="call-results-link" href="/leaderboard">Leaderboard</a>
      </nav>
    </section>
  );
}
