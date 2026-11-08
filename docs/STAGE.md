# Stage run (issue #16)

The three-minute stage demo, its fallbacks and the checks to finish before demo day. The
timeline and call path come from `docs/SPEC.md` ("Three-minute stage run" and "Stage call path").
Ticket names map to the app's callers: Nina = Yui, Marcus = Ren, James = Kai.

## Screens

| Screen | Device | URL |
|---|---|---|
| Player board, stage mode | Operator laptop | `/challenge?stage` |
| Live meter and Plan A/B/C switch | Projector | `/presenter#<link>` (from **Connect current day**) |
| Recorded clip | Projector | `/presenter/recorded` |
| Results slide | Projector | `/presenter/results` |
| QR to the no-signup page | Projector | Not built in this ticket. Use a slide or a printed code for `/challenge`. |

`?stage` makes the board read the saved plan once a second (`GET /api/challenge?stage_plan`, a
plain read with no row lock) and follow the presenter's switch.
Without `?stage` the board never polls, so ordinary players are unaffected.

## Before going on stage

1. On the operator laptop, open `/challenge?stage`. Play Yui and Ren as rehearsed and give both
   verdicts, so the day waits on **Next call** before Kai. The recorded clip covers these two calls.
2. In another tab, open `/presenter`, select **Connect current day**, then **Copy presenter link**,
   and open that link on the projector.
3. Check that the presenter shows **Plan A** selected. Plan A is the default for every new day.
4. Click once anywhere on the board. Browsers start audio only after a click on the page, so this
   lets Plan B start the browser call without another click.
5. Keep the verified stage phone (see below) charged, unmuted and with Do Not Disturb off.

## Timeline (target: under 3:00)

| Time | Beat | Screen |
|---|---|---|
| 0:00–0:15 | Hook: "Three calls. Two stories. Who gets your trust?" and the $1,000 day | Presenter |
| 0:15–0:45 | Yui and Ren, the 30-second rehearsal recording, labelled RECORDED, with the balance moving | `/presenter/recorded` |
| 0:45–1:45 | Kai live on the verified stage phone (Plan A), with the risk meter and code pop-up | `/presenter#…` |
| 1:45–2:20 | Detective reveal with the Debrief agent's steps, and one rewind | Board |
| 2:20–2:45 | Results slide | `/presenter/results` |
| 2:45–3:00 | QR code to the no-signup page | Slide |

## Kai fallbacks: one tap each on the presenter

| Plan | When | What the tap does |
|---|---|---|
| **A · Phone** | Default | The board stays in text and shows "Plan A · Kai is on the stage phone". The operator places the call (below). |
| **B · Browser voice** | Phone doesn't ring, drops or has no audio | Hangs up the phone first. The board starts Kai by browser voice on the laptop mic within about a second. Tap B again to retry a failed browser call. |
| **C · Text** | Browser voice fails too | The board leaves the browser call and continues the same call in text. Spoken turns already sent stay in the transcript. |

Each tap sends the tap count the presenter last saw. If an earlier tap already landed (say, after
a timeout), the server refuses the retry with 409 and the screen shows the real plan, so Plan B is
never restarted twice by accident. If the board tab reloads, its pill reads "TAP A PLAN" until the
next tap, because a reloaded page can't restart audio without a click.

The switch writes only `stagePlan` on the saved day, authorized by the presenter link, never by
the player cookie. It doesn't change the balance, tasks, verdicts or the call type. The 3-minute
call clock keeps running across switches.

**Plan A stays a manual call** (decision for #16). The app has no route that rings a phone into a
Challenge day. The operator places Kai's call from the laptop:

```bash
node --env-file=.env.local --import tsx scripts/spike-call.ts --to <stage phone, E.164> --caller fraud_team --name Alex --yes
```

The script only dials numbers in `TELL_TEAM_PHONES`. In Plan A the phone transcript doesn't feed the
board or the live meter. The meter and code pop-up show live only in Plans B and C. Rehearse the
line for Plan A accordingly, or go to Plan B if the meter must move on stage.

## Results slide

`/presenter/results` reads only `data/stage/results.json`, which `lib/stage/results.ts` validates
when the page renders. An unmeasured value shows as "Not measured yet", never as zero. When
issue #7's comparison finishes, copy its numbers from `docs/DETECTION_RESULTS.md` into that file.
No code changes. The time column is the evaluator's median seconds to score one call (compute
time), not how far into a call the scam was caught. The live meter shows that separately.

As of 2026-11-07, only the TF-IDF baseline is measured (4.9% of 859 real scam calls caught, 0.0%
false alarms on 44 hard negatives). The Nemotron rows are blank because NVIDIA returned 429s.

## Recorded clip

Record Yui and Ren during a full rehearsal (screen recording of the board, with audio, showing the
balance), trim it to about 30 seconds, and save it as `public/stage/rehearsal-yui-ren.mp4`. The page
puts a RECORDED label on the frame. Until the file exists, it says so instead of playing.

## Checks to finish (by hand)

### Carrier test calls

Call one phone on each carrier with `scripts/spike-call.ts`. Check that it rings, isn't blocked and
isn't labelled "Scam Likely" (or "Spam Risk" or "Potential Spam").

| Carrier | Phone (owner) | Date | Rang | Not blocked | No spam label | Notes / plan |
|---|---|---|---|---|---|---|
| T-Mobile | | | | | | |
| AT&T | | | | | | |
| Verizon | | | | | | |

If a carrier fails, record which one and use a stage phone on a carrier that passed. Otherwise,
the SPEC fallback is placing calls from an ElevenLabs/Twilio number.

### Stage phone, verified the day before

| Owner | Carrier | Verified on | Two-way audio | Disclosure line heard | Spam label |
|---|---|---|---|---|---|
| | | | | | |

Never use an unverified judge's phone. A judge can try the no-signup page.

### Timed rehearsals (both under 3:00)

| Run | Date | Total time | Plan used for Kai | B and C each one tap, no reload | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |

### Results slide outsider check

Show `/presenter/results` to someone outside the team and ask them to say in one sentence what
the numbers mean. Record what they said:

> 

## Code and tests

- `lib/stage/plan.ts` holds the plan IDs and the "new tap since I last looked" check (`tests/stage-plan.test.ts`).
- `PUT /api/presenter` is in `lib/challenge/presenter.ts` (`tests/presenter-routes.test.ts`).
- `risk.setPlan` is one guarded `jsonb_set` that never overwrites a game write
  (`tests/challenge-risk.test.mjs`, needs `TEST_DATABASE_URL`).
- `lib/stage/results.ts` and `data/stage/results.json` drive the slide (`tests/stage-results.test.ts`).
