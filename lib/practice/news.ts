/**
 * SERVER-ONLY: current scams from the FTC's public consumer-alerts feed.
 * Fetched on the server, cached for a few hours, and parsed from RSS or Atom.
 * Nothing is invented: if the feed can't be read, the page says so.
 */
export const FTC_FEED_URL = "https://consumer.ftc.gov/consumer-alerts/feed";
export const FTC_ALERTS_PAGE = "https://consumer.ftc.gov/consumer-alerts";
const CACHE_MS = 3 * 60 * 60 * 1000;

export interface NewsItem {
  title: string;
  link: string;
  date?: string;
  summary: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…" };

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function plain(html: string): string {
  // Decode first (descriptions are often escaped HTML), then drop tags and squeeze spaces.
  return decode(decode(html)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : undefined;
}

function shorten(text: string, max = 240): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

/** Parses RSS 2.0 `<item>` or Atom `<entry>` feeds into news items. */
export function parseFeed(xml: string, limit = 6): NewsItem[] {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  const atom = blocks.length ? [] : [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]);
  const items: NewsItem[] = [];
  for (const block of [...blocks, ...atom]) {
    const title = plain(tag(block, "title") ?? "");
    const link = plain(tag(block, "link") ?? "") || block.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] || "";
    if (!title || !/^https:\/\//.test(link)) continue;
    const rawDate = plain(tag(block, "pubDate") ?? tag(block, "updated") ?? tag(block, "published") ?? tag(block, "dc:date") ?? "");
    const parsed = rawDate ? new Date(rawDate) : undefined;
    const summary = shorten(plain(tag(block, "description") ?? tag(block, "summary") ?? tag(block, "content") ?? ""));
    items.push({
      title,
      link,
      ...(parsed && !Number.isNaN(parsed.getTime()) ? { date: parsed.toISOString() } : {}),
      summary,
    });
    if (items.length >= limit) break;
  }
  return items;
}

let cache: { at: number; items: NewsItem[] } | undefined;

/** Latest FTC alerts, cached. Throws if the feed can't be read and nothing is cached. */
export async function ftcAlerts(fetchFn: typeof fetch = fetch, now = Date.now()): Promise<{ items: NewsItem[]; fetchedAt: string }> {
  if (cache && now - cache.at < CACHE_MS) return { items: cache.items, fetchedAt: new Date(cache.at).toISOString() };
  try {
    const res = await fetchFn(FTC_FEED_URL, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9", "User-Agent": "Tell scam-practice app (education)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`FTC feed returned ${res.status}`);
    const items = parseFeed(await res.text());
    if (!items.length) throw new Error("FTC feed had no readable items");
    cache = { at: now, items };
    return { items, fetchedAt: new Date(now).toISOString() };
  } catch (err) {
    // A stale copy is better than nothing; otherwise the page shows the error state.
    if (cache) return { items: cache.items, fetchedAt: new Date(cache.at).toISOString() };
    throw err;
  }
}

/** Test hook. */
export function clearNewsCache() { cache = undefined; }
