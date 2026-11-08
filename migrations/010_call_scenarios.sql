-- Independent of the later prompt-pool migrations.
CREATE TABLE IF NOT EXISTS call_scenarios (
  id text PRIMARY KEY,
  category text NOT NULL UNIQUE,
  tactic text NOT NULL CHECK (tactic IN ('Details as proof','Urgency','Reward','Authority','Fear')),
  org text NOT NULL,
  card jsonb NOT NULL,
  secrets jsonb NOT NULL,
  versions jsonb NOT NULL,
  CHECK (jsonb_array_length(versions->'real'->'steps') = 4),
  CHECK (jsonb_array_length(versions->'scam'->'steps') = 4)
);
