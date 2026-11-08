import './credits.css';

export const metadata = { title: 'Credits · Tell' };

export default function CreditsPage() {
  return <main className="credits">
    <p className="credits-label">Credits</p>
    <h1>The sources behind the practice.</h1>
    <p className="credits-intro">Tell is an educational phone-scam practice project built for HackUTD 2026. Calls use fictional companies and details.</p>
    <section aria-labelledby="kaggle-credit">
      <h2 id="kaggle-credit">Scam and Non-Scam Call Conversation Dataset</h2>
      <p>By teeconnie on Kaggle. Used as a source of labelled examples for practice calls.</p>
      <p>Licence: <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">Creative Commons Attribution–NonCommercial–NoDerivatives 4.0 International (CC BY-NC-ND 4.0)</a>.</p>
      <a href="https://www.kaggle.com/datasets/teeconnie/scam-and-non-scam-call-conversation-dataset">View the Kaggle dataset</a>
    </section>
    <section aria-labelledby="bothbosu-credit">
      <h2 id="bothbosu-credit">Synthetic Multi-Turn Scam and Non-Scam Phone Dialogue Dataset</h2>
      <p>By BothBosu on Hugging Face, published as BothBosu/scam-dialogue. The conversations were generated with meta-llama-3-70b-instruct. Used for detection and as a source of practice examples.</p>
      <p>Licence: <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache License 2.0</a>.</p>
      <a href="https://huggingface.co/datasets/BothBosu/scam-dialogue">View the BothBosu dataset and licence</a>
    </section>
    <section aria-labelledby="scope-credit">
      <h2 id="scope-credit">Educational use</h2>
      <p>This build is for a hackathon and educational use. It is not a commercial carrier service. A commercial launch needs separate permission for the Kaggle material or a different dataset.</p>
      <p>AI-generated practice calls are simulations. They are not recordings of real callers, and they do not prove how well Tell detects real-world scams.</p>
    </section>
  </main>;
}
