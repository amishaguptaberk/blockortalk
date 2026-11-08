import { createNemotronReply } from '../../../lib/challenge/nemotron.ts';
import { safeText } from '../../../lib/challenge/service.ts';
import { isScenarioId, nextLine, openingTurns, reveal, type PracticeTurn, type Verdict } from '../../../lib/practice/script.ts';
import { planDrill, readHistory } from '../../../lib/practice/planner.ts';
import { ftcAlerts } from '../../../lib/practice/news.ts';
import { createNemotronClient } from '../../../lib/debrief/index.mjs';

export const dynamic = 'force-dynamic';

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function readTurns(value: unknown): PracticeTurn[] | undefined {
  if (!Array.isArray(value) || value.length > 40) return undefined;
  const turns: PracticeTurn[] = [];
  for (const t of value) {
    if (!t || (t.role !== 'caller' && t.role !== 'you') || typeof t.text !== 'string' || t.text.length > 1000) return undefined;
    turns.push({ role: t.role, text: t.text });
  }
  return turns;
}

/**
 * Practice calls (no money, no tasks). Stateless: the browser sends the transcript so far.
 *   { action: 'open', scenarioId }                 → opening line
 *   { action: 'reply', scenarioId, turns }         → next scripted line (text calls)
 *   { action: 'verdict', scenarioId, turns, verdict } → the reveal
 *   { action: 'plan', history }                    → the Drill Planner's next drill and its steps
 */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Use the practice page to make this request.' }, 403);
  const raw = await request.text();
  if (raw.length > 50_000) return json({ error: 'This call is too long.' }, 400);
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (body?.action === 'plan') {
    // The Drill Planner agent: the browser sends its own practice history; nothing is stored.
    const plan = await planDrill({
      history: readHistory(body.history),
      llm: createNemotronClient(process.env),
      threats: async () => (await ftcAlerts()).items,
    });
    return json({ plan });
  }
  if (!isScenarioId(body?.scenarioId)) return json({ error: 'Choose a practice scenario.' }, 400);
  const id = body.scenarioId;
  if (body.action === 'open') return json({ turns: openingTurns(id) });
  const turns = readTurns(body.turns);
  if (!turns) return json({ error: 'Invalid transcript.' }, 400);
  if (body.action === 'reply') {
    // The model only picks between approved lines; it sees redacted text, never likely real personal data.
    const redacted = turns.map(t => t.role === 'you' ? { ...t, text: safeText(t.text) } : t);
    const result = await nextLine(id, redacted, createNemotronReply());
    return json(result);
  }
  if (body.action === 'verdict') {
    const verdict = body.verdict as Verdict;
    if (!['Real', 'Scam', 'Unverified'].includes(verdict)) return json({ error: 'Choose Real, Scam or Unverified.' }, 400);
    return json(reveal(id, verdict, turns));
  }
  return json({ error: 'Choose a practice action.' }, 400);
}
