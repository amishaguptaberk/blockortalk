/**
 * Carrier insights (docs/BLOKBUKS_SEASON.md, docs/adr/0002): anonymous Category × Tactic × outcome
 * totals for T-Mobile. Everything leaving this file is built from `insightTotals`, which returns
 * fresh objects with no Player id, scenario id, email, nickname or transcript, and hides any group
 * under five Players without a count. The store, analyst, clock and password are injected so tests
 * use fakes, as with the other route factories.
 */
import { insightTotals, MIN_PLAYERS, type CallRow, type InsightGroup } from '../season/analysis.ts';
import type { ShownGroup } from './analyst.ts';
import { accessToken, isAuthorized, passwordMatches, sessionCookie } from './access.ts';

export { INSIGHTS_COOKIE } from './access.ts';

/** A summary older than this is rewritten the next time the page opens. */
export const SUMMARY_MAX_AGE_MS = 15 * 60 * 1000;
export const FIXED_SUMMARY = 'A written summary is not available right now. The totals below are current.';
const NO_GROUPS_SUMMARY = `No group has reached ${MIN_PLAYERS} Players yet, so there is nothing to summarise.`;
const HIDDEN_NOTE = `Fewer than ${MIN_PLAYERS} Players`;

export type StoredSummary = { text: string; source: 'model'; generatedAt: string; synthetic: boolean };
export type Dataset = 'real' | 'synthetic';

export interface InsightsStore {
  /** Finished calls of one dataset. Never returned to a browser; only `insightTotals` output is. */
  loadCalls(include: Dataset): Promise<CallRow[]>;
  latestSummary(synthetic: boolean): Promise<StoredSummary | null>;
  saveSummary(summary: StoredSummary): Promise<void>;
}

export interface InsightsDeps {
  /** The shared password (INSIGHTS_PASSWORD in production). Empty means nothing can unlock. */
  password: string | undefined;
  store: InsightsStore;
  /** Totals in, summary text out; null on any failure. */
  analyst(groups: ShownGroup[], synthetic: boolean): Promise<string | null>;
  now?: () => number;
}

export type ViewGroup =
  | { category: string; tactic: string; outcome: string; hidden: true; note: string }
  | { category: string; tactic: string; outcome: string; hidden: false; calls: number; players: number };

export type InsightsView = {
  synthetic: boolean;
  label: 'Real Players' | 'Synthetic demo data';
  minPlayers: number;
  groups: ViewGroup[];
  summary: { text: string; generatedAt: string | null; synthetic: boolean; stale: boolean };
};

const headers = { 'Cache-Control': 'no-store' };
const labelOf = (synthetic: boolean) => (synthetic ? 'Synthetic demo data' : 'Real Players') as InsightsView['label'];
const wantsSynthetic = (request: Request) => new URL(request.url).searchParams.get('synthetic') === '1';

/** Rebuilt field by field so nothing extra can ride along. */
function toViewGroup(group: InsightGroup): ViewGroup {
  return group.hidden
    ? { category: group.category, tactic: group.tactic, outcome: group.outcome, hidden: true, note: HIDDEN_NOTE }
    : { category: group.category, tactic: group.tactic, outcome: group.outcome, hidden: false, calls: group.calls, players: group.players };
}

/** Plain CSV. A leading = + - @ would run as a formula in a spreadsheet, so it is defused. */
function cell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function insightsCsv(view: InsightsView): string {
  const rows = view.groups.map(group => [
    view.label, group.category, group.tactic, group.outcome,
    group.hidden ? '' : group.calls, group.hidden ? '' : group.players, group.hidden ? group.note : '',
  ].map(cell).join(','));
  return ['Data,Category,Tactic,Outcome,Calls,Players,Note', ...rows].join('\r\n') + '\r\n';
}

export function createInsightsHandlers(deps: InsightsDeps) {
  const now = deps.now ?? Date.now;

  async function summaryFor(groups: InsightGroup[], synthetic: boolean): Promise<InsightsView['summary']> {
    const shown = groups.flatMap((group): ShownGroup[] => group.hidden ? [] : [{
      category: group.category, tactic: group.tactic, outcome: group.outcome, calls: group.calls, players: group.players,
    }]);
    if (shown.length === 0) return { text: NO_GROUPS_SUMMARY, generatedAt: null, synthetic, stale: false };

    const stored = await deps.store.latestSummary(synthetic).catch(() => null);
    if (stored && now() - Date.parse(stored.generatedAt) <= SUMMARY_MAX_AGE_MS) {
      return { text: stored.text, generatedAt: stored.generatedAt, synthetic, stale: false };
    }
    const text = await deps.analyst(shown, synthetic).catch(() => null);
    if (text) {
      const generatedAt = new Date(now()).toISOString();
      await deps.store.saveSummary({ text, source: 'model', generatedAt, synthetic }).catch(() => undefined);
      return { text, generatedAt, synthetic, stale: false };
    }
    return stored
      ? { text: stored.text, generatedAt: stored.generatedAt, synthetic, stale: true }
      : { text: FIXED_SUMMARY, generatedAt: null, synthetic, stale: false };
  }

  async function view(synthetic: boolean): Promise<InsightsView> {
    const include: Dataset = synthetic ? 'synthetic' : 'real';
    const groups = insightTotals(await deps.store.loadCalls(include), { include });
    return { synthetic, label: labelOf(synthetic), minPlayers: MIN_PLAYERS, groups: groups.map(toViewGroup), summary: await summaryFor(groups, synthetic) };
  }

  const locked = () => Response.json({ locked: true }, { status: 401, headers });
  const unavailable = () => Response.json({ error: 'Insights are not available right now. Please try again soon.' }, { status: 503, headers });

  return {
    async GET(request: Request) {
      if (!await isAuthorized(request, deps.password)) return locked();
      try { return Response.json(await view(wantsSynthetic(request)), { headers }); } catch { return unavailable(); }
    },
    async CSV(request: Request) {
      if (!await isAuthorized(request, deps.password)) return locked();
      try {
        const data = await view(wantsSynthetic(request));
        return new Response(insightsCsv(data), { headers: {
          ...headers,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="tell-carrier-insights-${data.synthetic ? 'synthetic' : 'real'}.csv"`,
        } });
      } catch { return unavailable(); }
    },
    /** A plain form post, so the prompt works without JavaScript. Always answers with a redirect back to the page. */
    async unlock(request: Request) {
      const url = new URL(request.url);
      if (request.headers.get('origin') !== url.origin) return new Response('Use the Insights page.', { status: 403, headers });
      const raw = (await request.text()).slice(0, 2048);
      let submitted = '';
      try {
        submitted = request.headers.get('content-type')?.includes('json')
          ? String((JSON.parse(raw) as { password?: unknown }).password ?? '')
          : new URLSearchParams(raw).get('password') ?? '';
      } catch { /* treated as a wrong password */ }
      if (!await passwordMatches(submitted, deps.password)) {
        return new Response(null, { status: 303, headers: { ...headers, Location: new URL('/insights?error=1', url).toString() } });
      }
      return new Response(null, { status: 303, headers: {
        ...headers,
        Location: new URL('/insights', url).toString(),
        'Set-Cookie': sessionCookie(await accessToken(deps.password!), request),
      } });
    },
    view,
    /** Cookie check for the server-rendered page. */
    isAuthorized: (request: Request) => isAuthorized(request, deps.password),
  };
}
