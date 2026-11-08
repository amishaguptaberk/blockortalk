import PlayerSignup from '../components/PlayerSignup';
import '../landing.css';

export const metadata = { title: 'Player profile · Block or Talk' };

export default function ProfilePage() {
  return <main className="landing">
    <header className="landing-head"><a href="/dashboard">Back to dashboard</a></header>
    <h1>Player profile</h1>
    <PlayerSignup />
    <p><a href="/me">View your analysis</a></p>
  </main>;
}
