# Blokbuks Season release

This procedure is pending. BS-09 source changes alone do not complete the release. Keep [issue #59](https://github.com/SamarthaB10/BlockorTalk/issues/59) open until the production checks pass.

## Before release

1. Wait for the call engine, Play screens, results and Carrier insights to be ready: [#56](https://github.com/SamarthaB10/BlockorTalk/issues/56), [#60](https://github.com/SamarthaB10/BlockorTalk/issues/60), [#61](https://github.com/SamarthaB10/BlockorTalk/issues/61), [#62](https://github.com/SamarthaB10/BlockorTalk/issues/62). Confirm `/play` works before publishing the `/practice` redirect.
2. Connect `/me` to the real Player session and completed calls. Reconcile `player_analyses` from migration 009 with the columns read by `lib/season/analysisStore.ts`. Check this against a database with the full migration history; a fresh isolated analysis table is not sufficient.
3. Check the approved release commit, CI, and the production database target. Confirm release approval before changing production. Never print secret values or open `.env.local` or `.dev.vars`.
4. Confirm the Worker has `DATABASE_URL`, `NVIDIA_API_KEY`, `ELEVENLABS_API_KEY`, and `TRY_IT_SECRET`. Carrier insights needs no secret; its password is `tmobile`. Use the existing secret store and the documented Cloudflare secret workflow. Secret names can be inspected; values must stay private. BS-09 declares the speech and insights bindings in `cloudflare.config.ts`.
5. Read the current vinext deployment instructions before running the deploy command. The repository targets the `tell-health` Cloudflare Worker. The checked-in GitHub workflows run checks; they do not apply migrations, seed records or deploy. External Cloudflare Git build settings must be checked separately; a Git merge does not prove a deployment happened.

## Database and deployment

Use the direct production database connection only after the release target and approval are confirmed. Do not run these commands against production while the integration gaps above remain.

```sh
npm run migrate
node --env-file=.env.local --import tsx scripts/seed-call-scenarios.ts
```

Check `schema_migrations` for 009, 010 and 011, plus any later required migrations. Read the seeded `call_scenarios`: one row per catalog scenario, with both Versions. Repeat the scenario seed and confirm the row count is unchanged. Re-run `npm run practice:index` so BothBosu prompt rows carry their training type; the new pool must still contain no held-out dialogues. Migration 011 seeds Season 1 once, starting at migration time with an end 55 hours later. Run it as part of the release, not hours before. Verify all three prizes. Never reset a running Season to make a check pass.

BS-12 owns the synthetic-data seed command. Use that ticket's reviewed command when available; do not invent production sample rows here. Check that synthetic rows are marked and that Carrier insights defaults to real data. Load the two practice corpora with the existing `npm run practice:index` command only if their checked prompt pools are absent. Keep held-out rows out of prompts.

After the database and secrets are ready, deploy the approved commit with the repository's `npm run deploy` workflow. Record the Worker deployment ID and commit. No deploy command has been run as part of BS-09.

## Production smoke test

Run on both a phone and a laptop at `https://tell-health.blockortalk.workers.dev`. Record the device, release commit, deployment ID and observed results. A narrow browser viewport is useful for layout checks; it does not replace a real phone check.

1. Sign up with an approved test profile. Confirm Play, Me and Leaderboard navigation shows the nickname and actual Blokbuks. Check the Credits links and both licence names.
2. Open `/practice` and confirm it redirects to the working `/play` screen. Choose two Call scenarios. Complete one by typing and one with spoken lines and a recorded reply. Check the disclosure, hidden Call type before the Verdict, and usable typing when speech fails.
3. Check each result: Call type, Scored moments, Blokbuks change and total, rank change, and Scored calls left.
4. Open `/me`. Confirm the analysis unlocks after the second completed call and uses those calls.
5. Open `/leaderboard`. Confirm the same total and own rank, nickname-only rows, countdown, and sponsor notice. Check deadline behavior in a disposable environment; do not shorten the production Season.
6. Open `/insights` without its secret and confirm access is refused. Sign in through the approved secret-entry flow. Check totals and CSV, the hidden-under-five rule, and the explicit synthetic-data toggle. No Player details may appear.
7. Open `/challenge?stage` and follow [the stage plan](STAGE.md) once. Check `/try-it`, `/presenter`, the recorded clip and results slide. Do not place a real phone call without approval for that call.

Mark each step passed, failed or blocked. A build or a fake-store test does not count as a production smoke test. Record failures before closing issue #59.
