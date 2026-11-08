-- Keep the published evaluation split separate from examples eligible for prompts.
CREATE TABLE IF NOT EXISTS practice_examples (
  pool_id text NOT NULL,
  id text NOT NULL,
  dialogue text NOT NULL,
  label integer NOT NULL CHECK (label IN (0, 1)),
  topic text,
  split text NOT NULL CHECK (split IN ('prompt', 'held_out')),
  source text NOT NULL,
  content_hash text NOT NULL,
  PRIMARY KEY (pool_id, id),
  UNIQUE (pool_id, content_hash)
);
CREATE INDEX IF NOT EXISTS practice_examples_split_idx ON practice_examples (pool_id, split, label);
CREATE TABLE IF NOT EXISTS practice_datasets (
  pool_id text PRIMARY KEY,
  source text NOT NULL,
  embedding_model text NOT NULL,
  prompt_count integer NOT NULL,
  held_out_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS practice_sessions (
  id uuid PRIMARY KEY,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
