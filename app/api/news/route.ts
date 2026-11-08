import { FTC_ALERTS_PAGE, ftcAlerts } from '../../../lib/practice/news.ts';

export const dynamic = 'force-dynamic';

/** Latest FTC consumer alerts for the scam-news section. */
export async function GET() {
  try {
    const { items, fetchedAt } = await ftcAlerts();
    return Response.json({ items, fetchedAt, source: FTC_ALERTS_PAGE }, { headers: { 'Cache-Control': 'public, max-age=600' } });
  } catch (err) {
    console.error('FTC alerts unavailable', err instanceof Error ? err.message : 'unknown');
    return Response.json({ items: [], error: 'unavailable', source: FTC_ALERTS_PAGE }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
