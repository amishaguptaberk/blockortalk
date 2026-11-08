"""Train-only, corpus-versioned pgvector retrieval. No held-out text is persisted."""

import hashlib
import json
import math
import threading

from detection.corpus import Item, LeakageError, assert_no_leakage, normalize


def item_id(item):
    return hashlib.sha256(json.dumps([normalize(item.text), item.label, item.source],
                                    ensure_ascii=False).encode()).hexdigest()


def vector_literal(vector):
    if (len(vector) != 1024 or not all(isinstance(x, (int, float)) and math.isfinite(x)
                                     for x in vector) or not any(vector)):
        raise ValueError("embedding must have 1024 finite values and nonzero magnitude")
    return "[" + ",".join(str(float(x)) for x in vector) + "]"


class PgvectorPool:
    def __init__(self, connection, embeddings, corpus):
        assert_no_leakage(corpus)
        if len(corpus.train) < 5 or any(i.split != "train" for i in corpus.train):
            raise ValueError("retrieval requires at least five train-split examples")
        self.connection = connection
        self.lock = threading.Lock()
        self.embeddings = embeddings
        self.items = {item_id(i): i for i in corpus.train}
        self.pool_id = hashlib.sha256(json.dumps(
            [embeddings.model, sorted(self.items)], separators=(",", ":")
        ).encode()).hexdigest()

    def index(self):
        existing = {row[0] for row in self.connection.execute(
            "SELECT id FROM detection_examples WHERE pool_id = %s", (self.pool_id,))}
        missing = [(key, item) for key, item in self.items.items() if key not in existing]
        for key, item in missing:
            # The hosted endpoint accepts one input per request. Commit each
            # success so a later failure never discards earlier paid-for work.
            vectors = self.embeddings.embed([item.text], "passage")
            if len(vectors) != 1:
                raise ValueError("embedding response length does not match input")
            with self.connection.transaction():
                self.connection.execute(
                    """INSERT INTO detection_examples
                    (pool_id, id, dialogue, label, split, source, embedding)
                    VALUES (%s, %s, %s, %s, 'train', %s, %s::vector)
                    ON CONFLICT (pool_id, id) DO NOTHING""",
                    (self.pool_id, key, item.text, item.label, item.source, vector_literal(vectors[0])),
                )
        self.require_ready()

    def require_ready(self):
        rows = self.connection.execute(
            "SELECT id, dialogue, label, split, source FROM detection_examples WHERE pool_id = %s",
            (self.pool_id,),
        ).fetchall()
        if len(rows) != len(self.items):
            raise ValueError("training pool is incomplete; run python -m detection.index")
        for row in rows:
            self._checked_item(row)

    def _checked_item(self, row):
        key, text, label, split, source = row
        item = self.items.get(key)
        if item is None or (text, label, split, source) != (item.text, item.label, "train", item.source):
            raise LeakageError(f"retrieved item is outside the checked train pool: {text!r}")
        return item

    def nearest(self, text):
        vector = vector_literal(self.embeddings.embed([text], "query")[0])
        # Exact cosine search avoids approximate-index filtering dropping neighbors
        # when multiple corpus versions share the table. The HNSW index is available
        # for consumers that choose approximate retrieval on larger pools.
        with self.lock, self.connection.transaction():
            self.connection.execute("SET LOCAL enable_indexscan = off")
            rows = self.connection.execute(
                """SELECT id, dialogue, label, split, source FROM detection_examples
                WHERE pool_id = %s AND split = 'train'
                ORDER BY embedding <=> %s::vector, id LIMIT 5""",
                (self.pool_id, vector),
            ).fetchall()
        if len(rows) != 5:
            raise ValueError("retrieval requires five indexed train examples")
        return [self._checked_item(row) for row in rows]
