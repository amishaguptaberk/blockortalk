"""Embed only the leakage-checked training split; safe to resume after interruption."""

import os
import sys
from pathlib import Path

from detection.corpus import load_real_corpus
from detection.nvidia import NvidiaClient, NvidiaEmbeddings
from detection.retrieval import PgvectorPool


def main():
    import psycopg
    if not os.environ.get("DATABASE_URL_DIRECT"):
        print("DATABASE_URL_DIRECT is required", file=sys.stderr)
        return 1
    corpus = load_real_corpus()
    client = NvidiaClient()
    # Apply only this lane's additive migration. The shared migration runner can also apply it.
    with psycopg.connect(os.environ["DATABASE_URL_DIRECT"], autocommit=True, connect_timeout=10) as connection:
        pool = PgvectorPool(connection, NvidiaEmbeddings(client), corpus)
        connection.execute((Path(__file__).parents[1] / "migrations/007_detection_examples.sql").read_text())
        pool.index()
        print(f"indexed_train: {len(pool.items)}\npool_id: {pool.pool_id}\nembedding_model: {pool.embeddings.model}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # Database exceptions may contain credentials; print only a safe diagnostic.
        print(f"Indexing failed ({type(error).__name__}); check credentials, migration and endpoint access.", file=sys.stderr)
        raise SystemExit(1)
