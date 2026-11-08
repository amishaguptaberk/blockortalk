-- Each private browser session owns one saved Challenge day.
-- State, turns, verdict and timestamped events commit together.
CREATE TABLE IF NOT EXISTS tell_challenges (
  id uuid PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
