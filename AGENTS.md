# Agents.md

This file provides guidance toAgents when working with code in this repository.

Tell trains people to spot phone scams by playing AI callers (some scams, some legitimate, some "hijacked") through a fictional "Challenge day". The product spec is `docs/SPEC.md`. It holds the product rules, modules, data model, and the agent and voice decisions. `PRODUCT.md` holds product and design truth for UI work. Read the relevant section of each before changing behaviour.

## Commands

The stack is Node 24 (`.nvmrc`) and Python 3.12 for `detection/`.

```bash
npm ci
npm run dev             # vinext (Next.js app router on Vite) + Cloudflare Workers plugin
npm run build
npm run typecheck       # tsc --noEmit
npm test                # node --test tests/*.test.mjs && vitest run (tests/**/*.test.ts)
npm run test:voice      # vitest run tests/voice
npx vitest run tests/voice/routes.test.ts -t "redact"   # one vitest file / test name
node --test tests/challenge.test.mjs                    # one node:test file
npm run migrate         # applies migrations/*.sql in name order with DATABASE_URL_DIRECT from .env.local
python -m unittest tests.test_detection                 # fast detection checks, no downloads
python -m detection.evaluate --detectors baseline       # downloads data into data/cache first
```

What runs where:

- **CI (`.github/workflows/ci.yml`)** runs `npm ci`, `typecheck`, `npm test` and `python -m unittest tests.test_detection` against a Postgres 17 service.
- **`detection.yml`** runs the Python detector tests against pgvector.
- **Database tests** run only when `TEST_DATABASE_URL` points at a disposable Postgres. Otherwise they are skipped. Each test creates and drops its own schema.

## Runtime and secrets

- **Deployment.** The app is deployed as a Cloudflare Worker (`tell-health`). Production is https://tell-health.blockortalk.workers.dev. Every branch gets a preview at `<branch>-tell-health.blockortalk.workers.dev`, but previews have **no Worker secrets**, so database and vendor routes fail there by design.
- **Secrets.** Server-only secrets are:
  - `DATABASE_URL`: the pooled URL, used at runtime.
  - `DATABASE_URL_DIRECT`: the direct URL, used for migrations and index loads.
  - `NVIDIA_API_KEY` and `ELEVENLABS_API_KEY`.
  - For voice: `TELL_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET` and `ELEVENLABS_PHONE_NUMBER_ID`.

  Locally they live in `.env.local`, or in `.dev.vars` for Workers dev. Never open or print these files.
- **Database client.** Database code uses `pg` and opens a client per request. There is no ORM.
- **Migrations.** Migration files are numbered and applied once each (tracked in `schema_migrations`). Pick the next free number.

## Architecture

The app follows `app/` router conventions. API routes in `app/api/*/route.ts` are thin: they export `dynamic = "force-dynamic"` and delegate to a factory in `lib/`. Each factory takes its external systems (database, LLM, voice) as injected adapters, so tests swap in fakes. This is the main testing seam. Tests call the handler factories with fakes and real `Request` objects rather than mocking internals.

- **`lib/challenge/`**: the text Challenge day (`/challenge`, `/api/challenge`, `/api/challenge/reveal`).
  - `service.ts` owns the day state in `tell_challenges`: balance, tasks, verdicts, leaks, and verify events.
  - `nemotron.ts` picks an approved line for the current script beat. If the model fails or returns an invalid choice, the call falls back to a fixed line.
  - `reveal.ts`, `detector.ts` and `debriefAdapter.ts` build the detective reveal. The detailed route streams agent phases as NDJSON.
  - A cookie (`tell_challenge`) restores the day.
  - **Rewind.** After the reveal the player gets one text replay of a call from a chosen turn (`rewind_*` actions, stored as `day.rewind`). The replay shares the reply logic and `scoring.ts` with the official day but never touches `balance`, tasks, `calls` or `events`, so the official score and the cached reveal do not change. The server refuses a second rewind.
- **`lib/debrief/`** (`.mjs`): the Debrief agent, a Nemotron tool-calling loop capped at 8 tool calls and 8 s, with a fixed-sequence fallback. The core rule is **code decides, the agent explains**:
  - money, tasks, leaks and rule statuses are computed in `tools.mjs`;
  - the model only orders the tools, writes sentences and picks the rewind point;
  - disagreements go into `mismatches`;
  - the result records which path ran (`path: "fixed"` or the model).

  The CLI is `node scripts/debrief.mjs`.
- **`lib/insights/`**: Carrier insights at `/insights` (docs/adr/0002). Totals only, from `insightTotals`; see `lib/insights/README.md`. `npm run insights:seed` / `insights:unseed` add or remove the synthetic demo rows.
- **`lib/policy/`**: the four rules and the normalized leak check. `normalize.mjs` turns spoken digits, dates and addresses into canonical forms, so "eight three oh two" matches 8302. Challenge, debrief and practice all share it.
- **`lib/practice/`**: practice mode. `catalog.ts` is browser-safe and deliberately has **no call types**. Call types live server-side in `script.ts` and are revealed only after a verdict.
- **`lib/voice/`**: the ElevenLabs Agents integration.
  - **Agents.** There are four fixed Challenge agents (Yui, Ren, Kai, and Aki as the Corvanta callback) with IDs in `config/voice-agents.json`. They are provisioned idempotently by `npm run voice:provision` from `personas.ts` and `agentConfig.ts`.
  - **Dynamic variables.** Fake secrets reach the agents as dynamic variables, never as per-call prompt overrides.
  - **Routes.** `routes.ts` assembles the `/api/voice/*` handlers:
    - `session` issues a browser WebRTC token;
    - `post-call` is the HMAC-verified webhook. It redacts real card numbers (Luhn) and SSNs, stores the transcript idempotently, then deletes the conversation from ElevenLabs;
    - `beat` receives the agents' mid-call `report_beat` tool, authenticated by the `X-Tell-Tool-Secret` header;
    - `events` is a cursor feed of those events for the UI.
  - **Wiring.** `server.ts` wires the real adapters from env, and `adapter.ts` holds `ElevenLabsVoiceAdapter` and `FakeVoiceAdapter`.
  - **Browser split.** Browser code may import only `callers.ts` and `browserCall.ts`, **never `personas.ts`**, because the prompts reveal which callers are legitimate. `tests/voice/browserBundle.test.ts` bundles the browser code and fails if a prompt leaks into it.
  - **Scripts.** `scripts/import-sip-line.ts` and `scripts/spike-call.ts` handle the Photon SIP-trunk line. The spike script only dials numbers in `TELL_TEAM_PHONES` and needs `--yes`.
- **`detection/`** (Python): the TF-IDF baseline, the Nemotron zero-shot detector, and Nemotron + retrieval over a train-only pgvector index (`migrations/007_detection_examples.sql`). See `docs/DETECTION.md`. The TypeScript reveal reads the same index through `lib/challenge/detector.ts`. If the index or key is unavailable, the reveal shows an explicit unavailable result, never invented flags.

## Product invariants enforced in code and tests

- **Never give away the call type.** A call's type (real, scam, hijacked) must never reach the browser or a caller's lines before the reveal. To keep it hidden:
  - every type shares one opening-line template;
  - voices are assigned regardless of type;
  - the label is always "AI practice caller".
- **Disclosure line and caps.** Every voice call opens with the fixed disclosure line in `lib/voice/disclosure.ts`. Drills end after 12 player replies or 3 minutes.
- **Fictional data only.** Brands (Corvanta Bank, Bluebonnet Labs, and so on) and scenario secrets are fictional. Real-looking personal data is redacted before storage. Fake scenario secrets must survive redaction, because the leak check depends on them.
- **Money comes from code.** Money posts only from code-scored actions after a verdict. A verdict alone never moves money.

## How to build: the amisha-skills plugin

The amisha-skills plugin defines the skills and agent types below. Use them for all implementation work in this repo, every session.

- **Implementation follows `/implement`** (amisha-skills `implement`):
  1. Use the **`tdd`** skill at seams the user has agreed to, and confirm the seams before writing any test.
  2. Red before green: write the failing test, watch it fail, then write the code.
  3. Run typecheck and single test files as you go, and the full suite once at the end.
  4. Review with **`code-review`**.
  5. Commit to the current branch.
- **Agent types** (`amisha-skills:<name>`):
  - `scout` finds the files, patterns, seams and check commands before work starts.
  - `researcher` answers one unverified question about a library or API.
  - `builder` implements or repairs one ticket test-first, within its owned paths.
  - `reviewer` gives an independent read-only verdict on a diff against its acceptance criteria. Use it after every green build, and send its findings back through tdd.
- Tickets from `to-tickets` run with `/run-tickets`. Bugs use `diagnosing-bugs`.
- `/implement` and `/run-tickets` only run when the user types them. Without that, follow their steps as written here.
- If the plugin isn't installed, follow the same workflow by hand.

## Before starting

- Fetch `origin/main` and check the open issues and PRs first. Other lanes own parts of the UI, the reveal and voice, so don't repeat their work.
