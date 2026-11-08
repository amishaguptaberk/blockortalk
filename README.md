# Tell

*Every scam has a tell.*

Tell trains people to spot phone scams by calling their real phone with AI callers. Some are scams, some are legitimate, and some are "hijacked" callers who know your details but still want your code. You decide if each call is real before you give anything away. Built at HackUTD 2026 for the T-Mobile Safe Signal and NVIDIA Nemotron tracks.

- Spec: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/img/architecture.png](docs/img/architecture.png)
- Personas: [docs/img/persona-matrix.png](docs/img/persona-matrix.png)
- Screens: [docs/img/persona-screens.png](docs/img/persona-screens.png)

Stack: Next.js · NVIDIA Nemotron · ElevenLabs Agents · Photon Spectrum Voice · TigerData

Presenter risk meter: start a Challenge day, open `/presenter` in another tab,
and select **Connect current day**. Copy that screen's link to a second device.
See [the presenter guide](docs/PRESENTER.md) for privacy, scoring, and the remaining
live latency and stage checks for issue #10.

## Run locally

Install Node.js 24 and run `npm install`. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `DATABASE_URL_DIRECT`, `NVIDIA_API_KEY`, and `ELEVENLABS_API_KEY`. Use the pooled database URL for the app and the direct URL for migrations. Keep this file private.

Run `npm run migrate` to apply the migrations using `DATABASE_URL_DIRECT` from `.env.local`. Run `npm run dev` and open the local URL shown in the terminal. The health page reports whether the database is reachable and whether the two vendor keys are present; it does not check whether the vendor keys are valid.

Run `npm test` for the health checks and `npm run typecheck` for the type check. The detection baseline is separate: install Python 3.12, run `pip install -r requirements.txt`, then run `python -m detection.evaluate --detectors baseline`. That command downloads the dialogue files into `data/cache` on first use, trains the TF-IDF baseline, and prints synthetic-test metrics, the real-call detection rate, and the hard-negative false-alarm rate. The hard negatives shipped in `data/` are team-written fraud-alert and delivery calls plus ten talkmap support calls. `python -m unittest tests.test_detection` runs the metric and leakage checks without those downloads. For the zero-shot and production retrieval detectors, train-only embedding setup, and the full three-way comparison, see [the detection guide](docs/DETECTION.md). For Cloudflare, set the three runtime variables `DATABASE_URL`, `NVIDIA_API_KEY`, and `ELEVENLABS_API_KEY` as Worker secrets. Run migrations separately with the direct URL.

## Challenge day in text (issues #5 and #6)

Open `/challenge`. Play Yui, Ren, then Kai. End each call and give a verdict,
then select Next call. Real books Yui's interview; Unverified plus the candidate
portal also books it. Sharing Ren's fictional gift-card code costs $350.
Kai's code appears after the third reply. Sharing it costs $650 and fails the
bank task. Spaces, punctuation and spoken digits count as sharing a code.
Money posts after the verdict. A verdict alone never moves money.

After Kai's call, open Corvanta Bank and select Call Corvanta. Finish the short
text chat with Aki to resolve the bank task. A callback cannot undo a code leak.
The result shows the balance, both tasks and all three verdicts. A perfect day
ends at $1,000 with the interview booked and the bank alert resolved.

Run `npm run migrate` before playing. For local Workers development, copy the
private `.env.local` file to the ignored `.dev.vars` file, restrict it to the
owner (`chmod 600 .dev.vars`), then restart `npm run dev`. Workers reads its local
secrets from `.dev.vars`. Migration 002 adds `tell_challenges`.
The database stores the day, each call result and timestamped Verify events together.
A private browser cookie restores the current day after reload for 24 hours.
Play again starts a new day and keeps the previous record. This Challenge page
stores transcripts; it is not the anonymous try-it route, which has a different
storage policy.

The callers use approved text beats. Yui follows the recruiter script: confirm Alex, confirm Tuesday
at 10 AM, point to the candidate portal, then close. Nemotron selects from approved
lines for the current beat. The gift-card code is 4729 in this text day, as required by issue #6; voice defaults are separate. This keeps secret requests and call-type disclosures
out of its replies. The default model is `nvidia/nemotron-3.5-bolt-e4b`;
set the optional server variable `NVIDIA_MODEL` to change it. The Nano model named
in the original spec returned HTTP 410 during this task. If the model fails or
returns an invalid choice, the call uses a fixed line and labels the script path.
No call is placed and ElevenLabs is not used by this page.

For the drill-service tests, set `TEST_DATABASE_URL` to a disposable Postgres
connection and run `node --test tests/challenge.test.mjs`. Each test makes and
removes its own schema; the account must have permission to create schemas.
Without this variable, database tests are skipped. CI starts Postgres and runs
these tests. Use `npm test` for the complete suite and `npm run typecheck` for types.

Manual checks: play each verdict path, check the portal, type `stop drill`, send
12 replies, wait three minutes, and reload during the call and after the verdict.
The board must keep its balance, tasks and verdict. The portal must show Tuesday
at 10 AM and say Bluebonnet never charges for equipment.

## Dataset-based practice

The Season flow uses `/play`; `/practice` redirects there. The old generated-call screen has been retired. The Play screens and final production check are tracked in [the Season release steps](docs/BLOKBUKS_RELEASE.md). Run `npm run practice:index` to import both supported corpora into Tiger DB. Kaggle keeps its checked 80/20 split (635 prompt examples and 159 held-out examples after duplicate removal). BothBosu publishes only its checked training dialogues as prompt examples, after normalized deduplication, known-overlap removal and a leakage check against all evaluation groups; synthetic test, real-call and hard-negative rows are never imported. Each source has a repeatable lexical pool, and rerunning the command checks stored rows and metadata before registering it. Install `requirements.txt` and set `PYTHON` if needed; the command downloads and caches source files on first use. `npm run voice:connect-data` adds its protected retrieval tool to the existing agents after the Worker route and tool secrets are configured. See [the setup, split and data-use notes](docs/GROUNDED_PRACTICE.md).

## Detective reveal (issue #9)

After the third verdict, `/challenge` shows Yui, Ren and Kai's identities and
saved money and task effects first. The agent report then adds decision turns,
code-leak marks, tactic-tagged detector quotes, daily rule statuses and ordered
agent steps. The green cat follows the server's tool and report-writing events.
The panel states whether Nemotron or the fixed sequence completed each report.
An older saved call can lack a leak's turn; the report says so and keeps its saved
money and task effects.

The Worker uses the train-only pgvector index from issue #7 for retrieval. Load it
as described in [docs/DETECTION.md](docs/DETECTION.md). If several index versions
exist, set `DETECTION_POOL_ID` on the server to the selected pool ID. With one
pool, selection is automatic. `NEMOTRON_DETECTOR_MODEL` and `NVIDIA_BASE_URL` are
optional server overrides. Missing keys, an unavailable index, rate limits or a
seven-second detector deadline produce an explicit unavailable result, with no
invented retrieval flags. The code-based rules and money still appear.

The basic report is available at `/api/challenge/reveal?mode=basic`; it makes no
vendor calls. The detailed route streams actual agent phase changes when the
client requests `application/x-ndjson`. Both routes require the saved-day cookie
and reject access before the third verdict. Results are cached by day outcome;
a later portal check or bank callback causes a new report.
