# Debrief agent (ticket 4)

Given a persona card and a call transcript, the agent works in logged steps and returns a `DebriefResult` (types in [`index.d.mts`](index.d.mts)). The result holds:
- the four rules, each kept / broken / not tested, with its turn
- the Probe / Protect / Verify / Disconnect moves
- the red flags
- each decision with one plain sentence
- the rewind point
- the step log

The detective reveal (ticket 9) renders this result directly.

## Run it

```sh
node scripts/debrief.mjs --transcript data/transcripts/james-slip.json         # one call, readable report
node scripts/debrief.mjs --transcript my-call.json --persona data/personas/james.json --json
node scripts/debrief.mjs --all                 # every sample, checked against its `expected` block
node scripts/debrief.mjs --all --fixed         # no Nemotron
node --test tests/*.test.mjs
```

The CLI reads `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NEMOTRON_AGENT_MODEL` and `NEMOTRON_AGENT_FALLBACK_MODEL` from the environment or `.env.local`. Without a key it runs the fixed path. Set `NEMOTRON_AGENT_THINKING=on` to let the model reason before answering. It is off by default because reasoning roughly triples the run time.

## How it works

- **Code decides, the agent explains** (SPEC: Agent and voice decisions). The tools in [`tools.mjs`](tools.mjs) compute leaks (normalized: spoken digits, dates, addresses), money, tasks and rule statuses. Nemotron chooses which tools to call and in what order, writes one sentence per decision and picks the rewind point. If it disagrees with code, code's answer is shown and the disagreement is listed in `mismatches`.
- **Tools:** `read_transcript`, `find_secret_requests`, `check_leaks`, `get_verify_events`, `run_detector`, `map_moves_to_rules`, `choose_rewind_point`, then `submit_debrief`. If the model skips a tool, code still runs it and logs it with `by: "fixed"`.
- **Limits:** 8 tool calls and 8 s. On an error or a timeout, the same tools run in a fixed order with template sentences, and `path: "fixed"` plus `fallback_reason` record which path ran.
- **Detector:** the Challenge reveal supplies retrieval results from `lib/challenge/detector.ts`, using ticket 7's train-only pgvector index. Unavailable retrieval is labelled and returns no flags. The standalone CLI keeps its keyword stand-in. Code's pressure checks still decide rule scores.
- **Rewind:** the single costliest decision, ranked by money, then task, then rules broken. On a clean call it falls back to the moment with the most pressure, with `cost_you: false`. `pickDayRewind` picks the costliest across the three calls.
- **ElevenLabs:** `transcriptFromElevenLabs` converts a post-call webhook transcript. It's provisional until ticket 2 captures a real payload.

## Rule judgments

| Rule | Tested when | Broken when | Kept at |
|---|---|---|---|
| 1 | the caller asks for a fake secret, or one leaks | the player says a fake secret (unless the caller said it first) | first refusal or hang-up after the request |
| 2 | urgency, fear, secrecy or an odd payment request appears | a leak after the first pressure moment | first refusal or hang-up after it |
| 3 | the caller cites details they know, then asks for a secret | a leak after the details were cited | first refusal or hang-up after the request |
| 4 | a leak, a verify action, a hang-up, or a task left open | a leak before any verify action; or the call ended without checking and the task stayed open | the first verify action (portal, bank app, call-back) |
