# Public try-it

Issue: https://github.com/SamarthaB10/BlockorTalk/issues/13

The landing page is `/`. The public day is `/try-it`. It uses the Challenge board, scoring, verification, reveal and rewind. It does not need an account or phone number.

## Before deployment

1. Apply `migrations/008_try_it.sql` with the normal migration command.
2. Set `TRY_IT_SECRET` as a Worker secret: at least 32 random characters. Keep it server-only. Changing it ends active try-it sessions. Do not reuse a vendor key.
3. Optionally set `TRY_IT_DAILY_CAP` (positive integer, default 1000). It caps new days across all visitors per UTC day. The database enforces three starts per visitor in a rolling hour, including concurrent requests.
4. Run the existing voice provisioning command to update `report_beat` with the `tell_try_it` field. This field prevents storage of try-it voice events. Verify the signed post-call webhook includes `data.conversation_initiation_client_data.dynamic_variables.tell_try_it` set to `"true"`. The webhook deletes that conversation without saving its transcript. Set `TRY_IT_BROWSER_VOICE=true` only after these two checks pass. Until then, the route refuses voice tokens and the board offers text.

The stage QR image is `public/stage/try-it-qr.png`. It points to https://tell-health.blockortalk.workers.dev/try-it. The image is ready to put on the stage slide. Scan it after deployment to check the destination.

## Data

Day state is encrypted and authenticated with AES-256-GCM. The browser holds the token in memory and sends it with each action. It expires after one hour. Leaving or reloading the page clears the day. The token cannot be used by a different visitor cookie. No transcript goes into `tell_challenges` or a try-it database table.

`tell_try_it_limits` holds expiring anonymous visitor hashes and a global day counter. No IP address is stored. Expired rows are removed on the next start. Clearing browser cookies creates a new visitor.

`tell_try_it_outcomes` holds one row per completed play: a random play ID, final balance, interview state and bank state. The random ID prevents repeated reveal requests from adding counts. It is not joined to a visitor. No name, transcript or conversation ID is stored. Outcomes are counted when the reveal first opens. A later bank callback updates that same outcome row. A rewind does not change it.

The text caller can use Nemotron and falls back to approved script lines. The try-it reveal uses the same Debrief agent and retrieval detector as Challenge mode. If a model or detector is unavailable, the reveal uses the fixed Debrief tools and reports detector unavailability. It makes no claim that a model ran when it did not.

## Manual checks

Use a new browser profile on a phone. Open `/`, choose Try it, and finish the three calls and reveal in less than four minutes. Check text and browser voice separately. Start three days; the fourth must show the hour-limit message. Check the database for anonymous outcomes and rate counters only. Check that voice leaves no transcript or event row. These checks need the migration, secrets and updated voice agents above.
