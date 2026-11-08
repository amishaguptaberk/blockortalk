# Presenter risk meter (issue #10)

Start a Challenge day at `/challenge`. In another tab in the same browser, open
`/presenter` and select **Connect current day**. Use **Copy presenter link** to
open that view on the projector or a second device. Keep playing in the original
Challenge tab. Starting another day needs a new presenter link.

The presenter shows the claimed caller, a 0–100 risk readout, supported tactic
labels and the current call's first correct detection turn and elapsed seconds.
The red Detector cat thinks while scoring and briefly uses the standard talk pose
when the risk rises. The sprite stays at 170×145; reduced motion uses a still frame.

The player API omits the risk history and the presenter capability. The presenter
uses a separate, random capability in the link's fragment (not in URL query logs),
then sends it in the authorization header. A player cookie alone cannot read
`GET /api/presenter`. The presenter returns only its display fields, not transcripts,
fake secrets or ground-truth call types. Treat its share link as private.

## Scoring and storage

Each accepted text or browser-voice turn queues a transcript prefix in the saved
day's private `risk` field. The queue stores turn metadata; it reads the existing
redacted transcript when scoring. No migration or new secret is required.

Routes schedule scoring through `after()` from `next/server`, which vinext keeps
alive using the Worker's request lifecycle. Inference happens after the player
response and outside the day transaction. Persisted leases prevent concurrent
requests from scoring the same prefix twice. An interrupted lease expires after
30 seconds; a later request can resume it. Presenter polling also resumes work.
Two workers drain available prefixes, with at most two in flight per day. Current
call work has priority over archived calls, so an earlier call's backlog does not
serialize the next caller. There is no fixed three-prefix batch cutoff.

Voice messages are uploaded as cumulative snapshots while the call continues.
The service accepts each new message once, scores original fictional secrets
before redaction, and retains the existing final-save path. A late snapshot for
a previous call is rejected. A final save cannot double-count a live upload.
Reconnecting establishes a new voice-session cursor while retaining prior turns;
messages from the previous connection are rejected instead of losing new replies.

Risk is `100 × confidence` for a scam prediction and `100 × (1 − confidence)` for
a legitimate prediction, rounded to an integer. Below 60% confidence there is no
risk number or tactic label. An error also has no new number. The screen labels a
retained previous score as such and shows pending, catching-up, unavailable or
rate-limited status. It never presents an unavailable prediction as zero risk.

First correct detection uses the earliest confidently correct label for each
scripted caller (Yui: legitimate; Ren and Kai: scam). The detector does not receive
those ground-truth labels. Turn numbers include the fixed disclosure turn, matching
the stored transcript and reveal. Elapsed seconds run from call start to that turn,
not to completion of the vendor request.

## NVIDIA capacity and validation

The production detector is unchanged: five train-only pgvector examples followed
by `nvidia/nemotron-3.5-super-vl-120b-a12b`. A 429 preserves `Retry-After` seconds or
date, with an increasing fallback cooldown. Cooldown is persisted per day; polling
cannot bypass it. A prefix gets at most three attempts. This does not coordinate
other days, the Python evaluator, other apps, or teammates sharing NVIDIA capacity.

The three-second update target still depends on NVIDIA latency/capacity and
database latency. The meter polls every 500 ms after the previous response.
Automated tests with a faked detector verify history, first correct detection,
leases, 429 cooldown, live voice ingestion, and isolation from player responses.
They do not prove the three-second target against the hosted endpoint.

Before closing #10, run a day on two devices in both text and browser voice,
confirm the actual update times, and check projector legibility. Confirm risk stays
low for Yui and rises on Ren and Kai. Introduce a slow detector and check that chat
continues while the presenter catches up. Inspect every player response and screen
for risk fields or tactics. Live NVIDIA validation remains required if 429s persist.

Run the service tests against an isolated Postgres schema with `TEST_DATABASE_URL`
set: `node --test tests/challenge-risk.test.mjs`. Run route and vendor-boundary tests
with `npx vitest run tests/presenter-routes.test.ts tests/reveal-detector.test.ts`.

## Acceptance status

The November 7, 2026 live smoke check returned a correct scam prediction in
3.37 seconds, before presenter polling. That does not meet the three-second
end-to-end target. Hosted latency/capacity and the two-device/projector checks
remain acceptance gates; #10 must stay open until they pass.

The implementation review found and corrected four code issues: reconnects losing
voice turns, serial prefix scoring, a fixed batch cutoff leaving backlog, and a
mascot shown between calls. The standards review corrected width animation and
internal-call test assertions, and consolidated voice serialization and call identity.

## Stage switch (issue #16)

The presenter also has the one-tap Plan A/B/C switch for the live Kai call and links to the
recorded clip and the results slide. See [the stage runbook](STAGE.md).
