-- Shared Player-side schema for the Blokbuks Season lanes.
CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 3 AND 20),
  nickname_key text NOT NULL UNIQUE CHECK (nickname_key = lower(nickname)),
  synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE player_sessions (
  token_hash text PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX player_sessions_expiry ON player_sessions(expires_at);
CREATE TABLE seasons (
  id text PRIMARY KEY,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  prizes jsonb NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE TABLE season_scores (
  season_id text NOT NULL REFERENCES seasons(id),
  player_id uuid NOT NULL REFERENCES players(id),
  blokbuks integer NOT NULL DEFAULT 0 CHECK (blokbuks >= 0),
  "right" integer NOT NULL DEFAULT 0,
  wrong integer NOT NULL DEFAULT 0,
  reached_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, player_id)
);
CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id),
  season_id text REFERENCES seasons(id),
  -- BS-02 owns call_scenarios in migration 010 and must add this foreign key there.
  scenario_id text NOT NULL,
  version text NOT NULL CHECK (version IN ('real', 'scam')),
  scored boolean NOT NULL,
  state jsonb NOT NULL DEFAULT '{}',
  verdict text,
  moments jsonb,
  "right" integer,
  wrong integer,
  blokbuks_delta integer,
  scored_by text CHECK (scored_by IN ('agent', 'rules')),
  outcome text,
  synthetic boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX calls_player_started ON calls(player_id, started_at);
CREATE TABLE player_analyses (
  player_id uuid PRIMARY KEY REFERENCES players(id),
  calls_counted integer NOT NULL,
  body jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE insights_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  includes_synthetic boolean NOT NULL,
  body jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
