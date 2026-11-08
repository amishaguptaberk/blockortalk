-- One stored Player analysis per Player (BS-08). player_id is plain text so this migration
-- does not depend on the players table from BS-01; counts are the code-computed numbers.
CREATE TABLE IF NOT EXISTS player_analyses (
  player_id text PRIMARY KEY,
  finished_calls integer NOT NULL CHECK (finished_calls >= 2),
  counts jsonb NOT NULL,
  sentences jsonb NOT NULL,
  try_next text,
  source text NOT NULL CHECK (source IN ('model', 'fixed')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
