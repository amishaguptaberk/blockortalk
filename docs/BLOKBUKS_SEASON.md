# Blokbuks Season: agreed design

Decided in the grilling session on Nov 7, 2026, for the HackUTD deadline (Sun Nov 8, 12:00 PM CT). Terms follow `GLOSSARY.md`. Decisions with lasting weight: `docs/adr/0001`, `docs/adr/0002`.

## Scope tonight

Ships working: email signup, 14 Call scenarios, Blokbuks scoring, results screen, Player analysis, Leaderboard with Season countdown, Carrier insights. Shown but stubbed: prize claims. Untouched: `/challenge`, `/try-it`, `/presenter` (the stage demo). The Challenge does not earn Blokbuks.

The paragraph above is the target scope, not proof of a production release. See the source and production status below.

## Source and production status (Nov 8, 2026)

The BS-09 change adds shared Play, Me and Leaderboard navigation, the signed-in Player's nickname and Season Blokbuks, a reusable plain B mark, and `/credits`. The shell is limited to `/play`, `/me`, `/leaderboard` and `/credits`. The Player profile page links to Play after sign-in. The restored 3D landing page links to the Player profile and Credits. `/practice` redirects to `/play`; its old generated-call screen is retired. Supporting practice modules and speech adapters remain because the Challenge and the new call engine use them.

This is not yet a complete, verified production loop. At the start of BS-09, [the call engine (#56)](https://github.com/SamarthaB10/BlockorTalk/issues/56), [Play screens (#60)](https://github.com/SamarthaB10/BlockorTalk/issues/60), [results (#61)](https://github.com/SamarthaB10/BlockorTalk/issues/61) and [Carrier insights (#62)](https://github.com/SamarthaB10/BlockorTalk/issues/62) were still open. The shared `/play` layout is ready for BS-10; BS-09 does not add a replacement game or a placeholder Play page. Do not release the redirect until `/play` works.

Two existing integration gaps also prevent the required smoke test: `lib/season/meServer.ts` returns no current Player and no completed calls, and the analysis store expects columns that migration 009 does not create. The later `CREATE TABLE IF NOT EXISTS player_analyses` does not add those columns to the existing table. Resolve these gaps before release.

Read-only production checks during BS-09 found `/play` and `/insights` at HTTP 404, `/api/season` at HTTP 503, and `/api/players` at HTTP 200. These checks do not prove which migrations or seeds are present. No production database changes, secret changes or deployment were made for BS-09. The production smoke test remains pending. Use [the release steps](BLOKBUKS_RELEASE.md) when the dependencies are ready.

Known limits remain: sign-in by email is not verified, so anyone who knows a Player's email can sign in as that Player. The prize claim is only a request stub; it does not send email, verify ownership or fulfil a prize. This build is for the hackathon and education. A commercial launch needs permission for the Kaggle material or a different dataset. `/credits` records Kaggle's CC BY-NC-ND 4.0 and BothBosu/scam-dialogue's Apache 2.0 licences.

## Players

- Signup with email and nickname (3–20 characters, unique, basic profanity blocklist). The Leaderboard shows the nickname, never the email.
- An HttpOnly random session cookie, stored in TigerData, lasts 30 days. Entering an existing email on a new device signs in without verification. **Known gap:** anyone who knows an email can sign in as that Player. Prize claims require email verification and confirming 18+ and US residence.
- All Player data lives in TigerData Postgres. Cloudflare runs the app and holds only the cookie.

## Call scenarios

Fourteen Categories, each with a real and a scam Version picked at random on every play. Brands are fictional. The last four are the BothBosu training types that had no Category yet (refund, insurance, telemarketing, wrong number). The training file has 160 rows of each type. Card text is original. Held-out, real-call and hard-negative dialogues are not scenario material.

| # | Category | Main Tactic | Training type used for examples |
|---|---|---|---|
| 1 | Bank fraud alert | Details as proof | |
| 2 | Delivery or customs fee | Urgency | delivery, real Version only |
| 3 | Holiday gift card or travel deal | Reward | reward, scam Version only |
| 4 | Business invoice or CEO wire | Authority | |
| 5 | Phishing link texted mid-call | Urgency | |
| 6 | Tech support | Fear | support, scam Version only |
| 7 | Government (IRS or SSN) | Authority | ssn, scam Version only |
| 8 | Prize or sweepstakes | Reward | reward, scam Version only |
| 9 | Crypto or investment | Reward | |
| 10 | Phone carrier port-out | Details as proof | |
| 11 | Refund or billing error | Reward | refund, scam Version only |
| 12 | Insurance policy check | Fear | insurance, real Version only |
| 13 | Subscription or sales call | Reward | telemarketing, real Version only |
| 14 | Wrong number | Details as proof | wrong, real Version only |

Tactics are a first pass; adjust per script.

- Every Version has four caller steps: who and why, a credible detail, pressure (the Tactic), and the ask. A scam's ask is a fixed, approved request for a fictional secret; a real caller's ask is a safe next step.
- Nemotron writes steps 1–3 on each play from 5 prompt-split examples retrieved from both corpora (Kaggle and BothBosu) by Category keywords and the Version's Call type. When the table names a training type, rows of that type lead the five, and only for the Version whose label matches the type. A scam type never leads the real Version. If a Category has fewer than 5 examples of that Call type, fill with the nearest prompt examples of the same Call type from any Category. Held-out rows are excluded by the query.
- Stored in a TigerData `call_scenarios` table: Category, Tactic, fictional org, card facts, fake secrets and step outlines.
- Play reuses the `/practice` path: ElevenLabs reads the caller's lines and the Player types or records replies. A call ends after 4 replies, 3 minutes, End call, or "stop drill".
- The Call type never reaches the browser before the Verdict.
- No dataset citations on Player screens. Attribution lives on a Credits page. The Kaggle licence is CC BY-NC-ND 4.0: fine for this educational hackathon, but a real T-Mobile launch needs the author's permission or another dataset.

## Scoring

The Scorekeeper labels each reply with a Move (Probe, Protect, Verify, Disconnect, Leak, Comply) and quotes the words behind it. Code awards Blokbuks; keyword rules take over if the model fails ("scored by rules").

| What happens | Blokbuks |
|---|---:|
| Correct Verdict | +100 |
| Wrong Verdict (including calling a real caller a scam) | −50 |
| Unverified, then checked through your own app | +100 |
| Protected a secret | +25 |
| Verified through your own app | +25 |
| Leaked a secret | −100 |

- Scored moments are the replies to steps 2–4, plus the Verdict. Each is right or wrong.
- Players start at 0, and the total never drops below 0.
- Five Scored calls per day; calls beyond that are practice and worth 0 B.
- Leaderboard ties are broken by accuracy, then by who reached the score first.

## Results screen

1. The Call type ("This was a scam call").
2. Each Scored moment with ✓/✗, the Player's words and one plain sentence of why.
3. "4 right · 1 wrong".
4. Blokbuks change, new total and rank change.
5. Scored calls left today.

## Player analysis (`/me`)

First shown after 2 calls and rewritten after every call; practice calls count too. Sections: Commonly missed (top 2 by Tactic and Category, with counts), What you do right, Real callers you rejected, Try next (one Call scenario aimed at the weakest spot). Code computes the counts; the Player analyst writes the sentences.

## Season and Leaderboard

Season 1 starts when deployed and ends 55 hours later. The start, end and prizes live in a `seasons` table: 1st an iPhone 18, 2nd a week of free data, 3rd a $50 gift card. Prizes are shown as "provided by sponsor · rules apply". When the Season ends, scoring stops, the Leaderboard freezes, and the top 3 see a claim stub.

## Carrier insights (`/insights`)

- Totals only, by Category × Tactic × outcome. Groups under 5 Players are hidden. No emails, nicknames, transcripts or per-Player rows.
- Locked by the password `tmobile`, typed once and then kept in a cookie. CSV export.
- The Insights analyst reads totals only, and rewrites its summary on open when the current one is more than 15 minutes old.
- A seed script adds rows marked `synthetic = true`, behind a clearly labelled "Synthetic demo data" toggle that defaults to real.

## Pages

`/` (landing and signup), `/play` (10 cards, Blokbuks, Scored calls left, countdown), `/play/[id]` (call and results), `/me`, `/leaderboard`, `/insights`, Credits. The old generated-call flow on `/practice` folds into `/play`.

## Look

Blokbuks appear as a bold "B" in the app's typeface, white on the dark theme: **B 250**. No coin art and no colour coding. Not childish, never fear-mongering, readable for older adults (`PRODUCT.md`).

## Build order

Branch `feature/blokbuks-season`, cut from `main`:

1. Database tables and signup
2. Call scenarios and the call engine
3. Scorekeeper and the Blokbuks table
4. Results screen
5. Player analysis
6. Leaderboard and Season
7. Carrier insights and synthetic data

Tests come first where a mistake costs money or privacy: the Blokbuks table, the 5-a-day cap, the hide-under-5 rule, and the Call type staying out of the browser.
