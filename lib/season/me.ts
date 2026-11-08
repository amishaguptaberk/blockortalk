/**
 * /me: the Player analysis. The handler reads calls, recomputes every number in code and shows
 * the stored sentences when they cover the same number of finished calls. Nothing here calls
 * the model, so the page is instant; the model runs in the refresher after each finished call.
 */
import { playerAnalysis, type CallRow, type PlayerAnalysis, type Scenario, type Tally } from './analysis.ts';
import { fixedSentences, SECTION_IDS, type AnalystSource, type SectionId, type Sentences, type UnlockedAnalysis } from './analyst.ts';
import { recordOf, type AnalysisStore } from './refresh.ts';

export type MeSection = { id: SectionId; title: string; sentence: string; facts: string[]; link?: { href: string; label: string } };
export type MeView =
  | { state: 'locked'; finished: number; needed: number; message: string }
  | { state: 'ready'; finished: number; source: AnalystSource; sections: MeSection[] };

const TITLES: Record<SectionId, string> = { missed: 'Commonly missed', right: 'What you do right', rejected: 'Real callers you rejected', tryNext: 'Try next' };

const lockedMessage = (needed: number) => needed === 1 ? 'Play one more call to unlock your analysis' : 'Play two more calls to unlock your analysis';
const missedFact = (t: Tally) => `${t.key}: missed ${t.missed} of ${t.missed + t.right}`;
const rightFact = (t: Tally) => `${t.key}: right ${t.right} of ${t.missed + t.right}`;

/** Pure. Facts and links come only from `analysis`; `sentences` is display text. */
export function meView(analysis: PlayerAnalysis, sentences: Sentences | null, source: AnalystSource, scenarios: readonly Scenario[]): MeView {
  if (analysis.locked) return { state: 'locked', finished: analysis.finished, needed: analysis.needed, message: lockedMessage(analysis.needed) };
  if (!sentences) throw new Error('An unlocked analysis needs sentences.');
  const next = scenarios.find(s => s.id === analysis.tryNext);
  const facts: Record<SectionId, string[]> = {
    missed: [...analysis.commonlyMissed.tactics, ...analysis.commonlyMissed.categories].map(missedFact),
    right: [...analysis.doneRight.tactics, ...analysis.doneRight.categories].map(rightFact),
    rejected: [`${analysis.rejectedReal} real ${analysis.rejectedReal === 1 ? 'caller' : 'callers'} called a scam`],
    tryNext: next ? [next.category] : [],
  };
  return {
    state: 'ready',
    finished: analysis.finished,
    source,
    sections: SECTION_IDS.map((id): MeSection => ({
      id, title: TITLES[id], sentence: sentences[id], facts: facts[id],
      ...(id === 'tryNext' && next ? { link: { href: `/play/${next.id}`, label: next.category } } : {}),
    })),
  };
}

export interface MeDeps {
  /** From the session cookie (BS-02). Null when nobody is signed in. */
  getPlayerId(request: Request): Promise<string | null>;
  loadCalls(playerId: string): Promise<CallRow[]>;
  scenarios: readonly Scenario[];
  store: AnalysisStore;
}

const headers = { 'Cache-Control': 'no-store' };

export function createMeHandlers(deps: MeDeps) {
  async function view(playerId: string): Promise<MeView> {
    const analysis = playerAnalysis(await deps.loadCalls(playerId), deps.scenarios);
    if (analysis.locked) return meView(analysis, null, 'fixed', deps.scenarios);
    const stored = await deps.store.get(playerId).catch(() => null);
    if (stored && stored.finished === analysis.finished) return meView(analysis, stored.sentences, stored.source, deps.scenarios);
    // Missing or behind the latest call: show the fixed sentences now and keep them until the next refresh.
    const written = { sentences: fixedSentences(analysis as UnlockedAnalysis), source: 'fixed' as const };
    await deps.store.save(playerId, recordOf(analysis as UnlockedAnalysis, written)).catch(() => undefined);
    return meView(analysis, written.sentences, written.source, deps.scenarios);
  }
  return {
    view,
    async GET(request: Request) {
      try {
        const playerId = await deps.getPlayerId(request);
        if (!playerId) return Response.json({ error: 'Sign in to see your analysis.' }, { status: 401, headers });
        return Response.json(await view(playerId), { headers });
      } catch {
        return Response.json({ error: 'Your analysis is not available right now. Please try again soon.' }, { status: 503, headers });
      }
    },
  };
}
