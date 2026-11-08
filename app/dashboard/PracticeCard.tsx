import type { Scenario } from '../../lib/practice/catalog';

export default function PracticeCard({ scenario, showCode, voiceMode = false }: { scenario: Scenario; showCode: boolean; voiceMode?: boolean }) {
  return <aside className="hub-fictional-card" aria-label="Your fictional practice card">
    <h3>Your fictional details</h3><p>{scenario.card}</p>
    <dl>{scenario.protect.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
    {scenario.liveCode && (showCode ? <div role="status"><strong>{scenario.liveCode.label}</strong><p>{scenario.liveCode.value}</p><small>Keep this code private.</small></div> : voiceMode ? <details><summary>View your fictional practice code</summary><p>{scenario.liveCode.value}</p><small>Keep this code private.</small></details> : null)}
  </aside>;
}
