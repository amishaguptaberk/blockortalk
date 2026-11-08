"""Construct the same detectors for evaluation and server-side callers."""

from contextlib import contextmanager
import os
import time

from detection.baseline import TfidfBaseline
from detection.detectors import NemotronDetector
from detection.nvidia import NvidiaClient, NvidiaEmbeddings
from detection.retrieval import PgvectorPool


@contextmanager
def open_detectors(corpus, mode="all"):
    started = time.perf_counter()
    baseline = TfidfBaseline().fit(corpus.train)
    if time.perf_counter() - started >= 60:
        raise RuntimeError("baseline training took over a minute")
    if mode == "baseline":
        yield [baseline]
        return
    import psycopg
    if not os.environ.get("DATABASE_URL"):
        raise ValueError("DATABASE_URL is required")
    client = NvidiaClient()
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, connect_timeout=10) as connection:
        pool = PgvectorPool(connection, NvidiaEmbeddings(client), corpus)
        pool.require_ready()
        yield [baseline, NemotronDetector(client), NemotronDetector(client, pool)]
