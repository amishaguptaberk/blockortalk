-- The Kaggle corpus uses native Postgres text retrieval, without copying held-out
-- examples into the separate HF detector's vector index.
ALTER TABLE practice_datasets ALTER COLUMN embedding_model DROP NOT NULL;
ALTER TABLE practice_datasets ADD COLUMN IF NOT EXISTS retrieval_method text NOT NULL DEFAULT 'vector'
  CHECK (retrieval_method IN ('vector', 'lexical'));
CREATE INDEX IF NOT EXISTS practice_examples_text_idx ON practice_examples
  USING gin (to_tsvector('english', dialogue)) WHERE split = 'prompt';
