# Carrier insights (`/insights`)

Anonymous totals for T-Mobile by Category × Tactic × outcome (fell for, caught, false alarm, trusted real). Rules come from `docs/adr/0002`; the numbers come from `insightTotals` in `lib/season/analysis.ts`.

- **Access.** The password is `tmobile` (`INSIGHTS_PASSWORD` in `access.ts`); no Worker secret is needed. The page shows only a password prompt until it is typed; then an HttpOnly, SameSite=Strict cookie (`tell_insights`, 7 days) holds an HMAC of the password, never the password. The password is in the public repo, so it only keeps out casual visitors; the page shows anonymous totals only.
- **Privacy.** A group with fewer than 5 distinct Players is returned as `hidden` with no counts and shown as "Fewer than 5 Players". Groups are rebuilt field by field, so no Player id, scenario id, email, nickname or transcript reaches the JSON, the page or the CSV.
- **Synthetic demo data.** The toggle (`?synthetic=1`) is off by default and shows synthetic rows *only*, never mixed with real ones. Every view, summary and CSV row is labelled "Synthetic demo data".
- **Summary.** The Insights analyst (`analyst.ts`) is given the visible totals only. Every number in its text must be one of those totals. It is stored in `insights_summaries` with its time and synthetic flag, and rewritten on open when older than 15 minutes. If the model fails, the last stored summary is shown (marked as not just written), or a fixed sentence.
- **CSV.** `/api/insights/csv` is built from the same view as the page, so it is exactly the totals on screen.

## Synthetic data

```bash
npm run insights:seed     # ~200 synthetic Players and their calls, all synthetic = true; safe to repeat
npm run insights:unseed   # removes every synthetic row (and synthetic summaries), nothing else
```

Both use `DATABASE_URL_DIRECT`. Synthetic Players use `@synthetic.invalid` addresses. The Leaderboard and the Player analysis already ignore synthetic rows.

## Manual check

1. Open `/insights` without the password: only the prompt. Type a wrong password: "That password did not work."
2. Type `tmobile`: totals for real Players, most groups hidden until five Players share a group.
3. Choose "Show synthetic demo data": full totals under a "Synthetic demo data" label, and the CSV rows say the same.
