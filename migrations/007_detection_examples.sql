CREATE EXTENSION IF NOT EXISTS vector;

-- A pool identifies an exact, leakage-checked training corpus and embedding model.
-- Held-out transcripts are never inserted here.
CREATE TABLE IF NOT EXISTS detection_examples (
  pool_id text NOT NULL,
  id text NOT NULL,
  dialogue text NOT NULL,
  label integer NOT NULL CHECK (label IN (0, 1)),
  split text NOT NULL DEFAULT 'train' CHECK (split = 'train'),
  source text NOT NULL,
  embedding vector(1024) NOT NULL,
  PRIMARY KEY (pool_id, id)
);
CREATE INDEX IF NOT EXISTS detection_examples_embedding_idx
  ON detection_examples USING hnsw (embedding vector_cosine_ops);
