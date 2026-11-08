# Season and Leaderboard

Apply migration `011_season_leaderboard.sql` during deployment with `npm run migrate`. It seeds Season 1 at migration time, with an end 55 hours later. Repeated migrations do not restart it. Do not run the migration early if the Season must start at release time.

`GET /api/season` returns Season status (`upcoming`, `live`, `ended`), `scoringOpen`, the top 100, the signed-in Player's `ownRank`, and `claimEligible`. Responses contain no email or Player ID. `/play` can use the Season status and own rank; call writers must also respect `scoringOpen`. `seasonStatus` and `rankScores` are shared server interfaces.

The database trigger rejects score inserts, updates and deletes outside the Season window, even if a call writer misses the status check. A call that finishes after the deadline must become practice, rather than retrying a score write. The trigger does not stop a running call; the call engine owns that behavior (BS-06).

Ranks use Blokbuks descending, accuracy descending (`right / (right + wrong)`, zero when no moments exist), then earlier `reached_at`. Exact ties use Player ID for a stable order. Non-synthetic Players who joined before the deadline appear, including Players with no score row at 0 B. Late signups cannot change the final board. Score writers must set `reached_at` whenever Blokbuks change.

`POST /api/season/claim` requires the session cookie, the same origin, a final top-three rank, the profile email, and `adult: true` and `usResident: true`. Requests are stored once per Player and Season in `season_claims`. Emails are never returned. This is a stub: no email is sent and no email verification or prize fulfilment is performed.

The page refreshes scores every ten seconds, counts down every second, and requests the final board at zero. Failed requests show an error and retry. Claim requests are at `/leaderboard/claim`.

## Manual check on a disposable database

Apply migrations 009 and 011. Set the Season to start in the past and end in two minutes. Add two Players with equal Blokbuks and different accuracy; check that the more accurate Player is first. Open `/leaderboard`, watch the countdown reach zero, and check the final label. A direct score update after the deadline must fail with `Scoring is closed for this Season`. Sign in as a final top-three Player and submit a claim. Repeat it and check that there is one request. Do not shorten the production Season for this check.
