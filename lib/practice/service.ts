import pg from 'pg';
import { randomInt } from 'node:crypto';
import { mentionsSecret } from '../policy/normalize.mjs';
import { safeText } from '../challenge/service.ts';
import { PRACTICE_SECRETS } from './card.ts';
import { createPracticeNvidia, PracticeError } from './nvidia.ts';
import { createPracticeCorpus } from './corpus.ts';
import type { Action, Practice, PracticeView, Theme } from './types.ts';

export function practiceView(day: Practice): PracticeView {
  const { id, theme, turns, phase, replies, startedAt } = day;
  return { id, theme, turns, phase, replies, startedAt,
    dataset: { source: day.dataset.source, prompt_count: day.dataset.prompt_count, held_out_count: day.dataset.held_out_count },
    ...(phase === 'complete' ? { result: { label: day.label, verdict: day.verdict, explanation: day.explanation,
      leaked: day.leaked, examples: day.examples, correct: day.verdict === 'unverified' ? null : day.verdict === day.label } } : {}),
  };
}

export function createPracticeService({ connectionString, nvidia = createPracticeNvidia(), now = Date.now }: {
  connectionString: string; nvidia?: ReturnType<typeof createPracticeNvidia>; now?: () => number;
}) {
  async function withClient<T>(run: (client: pg.Client) => Promise<T>) {
    if (!connectionString) throw new PracticeError('The practice database is not configured.');
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    await client.connect();
    try { return await run(client); } finally { await client.end(); }
  }
  async function update(id: string, action?: Action) {
    return withClient(async client => {
      await client.query('BEGIN');
      try {
        const row = await client.query('SELECT state FROM practice_sessions WHERE id=$1 FOR UPDATE', [id]);
        if (!row.rowCount) throw new PracticeError('Start a practice call first.', 404);
        const day = row.rows[0].state as Practice;
        if (day.phase === 'call' && now() - Date.parse(day.startedAt) >= 180000) day.phase = 'verdict';
        if (action?.type === 'reply') {
          if (day.phase !== 'call') throw new PracticeError('This call has ended.', 409);
          const raw = action.text.trim();
          if (!raw || raw.length > 1000) throw new PracticeError('Use 1 to 1,000 characters.', 400);
          for (const [key, value] of Object.entries(PRACTICE_SECRETS)) {
            if (mentionsSecret(raw, key, value) && !day.leaked.includes(key)) day.leaked.push(key);
          }
          day.turns.push({ role: 'user', text: safeText(raw) });
          day.replies += 1;
          if (/\bstop\s+drill\b/i.test(raw) || day.replies >= day.questions.length) day.phase = 'verdict';
          else day.turns.push({ role: 'assistant', text: day.questions[day.replies] });
        } else if (action?.type === 'end' && day.phase === 'call') day.phase = 'verdict';
        else if (action?.type === 'verdict') {
          if (day.phase !== 'verdict') throw new PracticeError('End the call before giving a verdict.', 409);
          if (!['scam', 'legit', 'unverified'].includes(action.verdict)) throw new PracticeError('Choose Real, Scam or Unverified.', 400);
          day.verdict = action.verdict;
          day.phase = 'complete';
        }
        await client.query('UPDATE practice_sessions SET state=$2,updated_at=now() WHERE id=$1', [id, JSON.stringify(day)]);
        await client.query('COMMIT');
        return day;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    });
  }
  return {
    get: (id: string) => update(id),
    act: (id: string, action: Action) => update(id, action),
    async start(theme: Theme): Promise<Practice> {
      if (!['finance', 'seasonal_packages'].includes(theme)) throw new PracticeError('Choose a practice theme.', 400);
      const label = randomInt(2) === 1 ? 'scam' : 'legit';
      const corpus = createPracticeCorpus(connectionString);
      const dataset = await corpus.dataset();
      const query = theme === 'finance' ? 'bank finance account transaction refund' : 'seasonal holiday package delivery parcel shopping';
      const examples = await corpus.nearest(dataset, query, label === 'scam' ? 1 : 0);
      const plan = await nvidia.plan(theme, label, examples);
      const day: Practice = { id: crypto.randomUUID(), theme, label, dataset,
        examples: examples.map(({ dialogue: _text, ...source }) => source), questions: plan.questions, explanation: plan.explanation,
        turns: [{ role: 'assistant', text: plan.questions[0] }], phase: 'call', replies: 0, startedAt: new Date(now()).toISOString(), leaked: [],
      };
      await withClient(client => client.query('INSERT INTO practice_sessions (id,state) VALUES ($1,$2)', [day.id, JSON.stringify(day)]));
      return day;
    },
  };
}
