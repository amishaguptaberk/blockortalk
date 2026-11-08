# Players

`createPlayerHandlers({ store, now? })` provides `GET` (current Player) and `POST`
(`signup`, `signin`, `signout`). The live route is `/api/players`.

- Signup accepts `email` and `nickname`. Existing emails sign in without changing
  the nickname. Sign-in accepts only `email`.
- Responses contain `{ player: { id, nickname } }`, or `{ player: null }`.
  Field errors use `{ errors: { email?, nickname? } }`.
- `currentPlayer(request, store, now?)` returns the internal Player, including the
  email, or `null` for a missing, unknown or expired session. Use
  `playerStore(DATABASE_URL)` for the database adapter. Do not expose the email in
  public views such as the Leaderboard.
- Session tokens last 30 days. Only their SHA-256 hashes enter the database.

Apply migration `009_players.sql` before enabling signup. This change does not
apply production migrations. Email sign-in has no verification, as agreed for
this build; see `docs/BLOKBUKS_SEASON.md`.

## Shared schema

Migration 009 creates all seven Player-side tables. PostgreSQL reserves `right`,
so SQL queries must quote that column as `"right"` in `calls` and `season_scores`.
Migration 010, owned by BS-02, creates `call_scenarios`; it must also add:

```sql
ALTER TABLE calls ADD CONSTRAINT calls_scenario_id_fkey
  FOREIGN KEY (scenario_id) REFERENCES call_scenarios(id);
```

Run the route tests with `npx vitest run tests/players.test.ts`. Set
`TEST_DATABASE_URL` to a disposable Postgres database to also run
`tests/players-store.test.ts`. That test creates and drops its own schema.
