import RecordedClip from './RecordedClip';
import '../presenter.css';
import '../stage.css';

export const metadata = { title: 'Tell · Recorded', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** Yui and Ren from rehearsal (0:15–0:45 of the stage run), always labelled as a recording. */
export default function RecordedPage() {
  return <main className="presenter stage-slide">
    <header className="presenter-header"><a href="/">TELL</a><span className="ui-pill">PRESENTER ONLY</span>
      <nav className="presenter-nav" aria-label="Stage views"><a href="/presenter">Live meter</a><a href="/presenter/results">Results slide</a></nav>
    </header>
    <RecordedClip />
  </main>;
}
