import results from '../../../data/stage/results.json';
import { NOT_MEASURED, parseStageResults, resultsSlide } from '../../../lib/stage/results';
import '../presenter.css';
import '../stage.css';

export const metadata = { title: 'Tell · Results', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** The one results slide of the stage run (2:20–2:45). Every number comes from data/stage/results.json. */
export default function ResultsPage() {
  const slide = resultsSlide(parseStageResults(results));
  const value = (text: string) => <span className={text === NOT_MEASURED ? 'stage-missing' : 'stage-number'}>{text}</span>;
  return <main className="presenter stage-slide">
    <header className="presenter-header"><a href="/">TELL</a><span className="ui-pill">PRESENTER ONLY</span>
      <nav className="presenter-nav" aria-label="Stage views"><a href="/presenter">Live meter</a><a href="/presenter/recorded">Recorded clip</a></nav>
    </header>
    <p className="presenter-eyebrow">Detection on real calls</p>
    <h1>Can it tell?</h1>
    <div className="stage-pair">{slide.headline.map(row => <figure key={row.metric}>
      <figcaption>{row.metric}</figcaption>
      <div><p>{value(row.retrieval)}</p><small>Nemotron + retrieval</small></div>
      <div><p>{value(row.baseline)}</p><small>Keyword baseline</small></div>
    </figure>)}</div>
    <p className="stage-takeaway">{slide.takeaway}</p>
    <table className="stage-table">
      <thead><tr><th scope="col">Version</th><th scope="col">Synthetic F1</th><th scope="col">Real scam calls caught</th><th scope="col">False alarms on hard negatives</th><th scope="col">Time to a verdict per call (median scoring time)</th></tr></thead>
      <tbody>{slide.table.map(row => <tr key={row.detector}><th scope="row">{row.detector}</th><td>{row.syntheticF1}</td><td>{row.realCalls}</td><td>{row.falseAlarms}</td><td>{row.seconds}</td></tr>)}</tbody>
    </table>
    {!slide.complete && <p className="stage-source">Comparison incomplete: rows marked “{NOT_MEASURED}” have no finished run yet.</p>}
    <p className="stage-honesty">{slide.honesty}</p>
    <p className="stage-source">Measured {slide.measuredOn} · {slide.source}</p>
  </main>;
}
