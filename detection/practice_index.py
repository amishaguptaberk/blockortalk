"""Publish checked Kaggle and BothBosu practice pools without evaluation leakage."""
import csv
import hashlib
import json
import os
import re
from dataclasses import replace
from pathlib import Path
from zipfile import ZipFile

from detection import corpus as source_corpus
from detection.corpus import Corpus, Item, assert_no_leakage, load_real_corpus, normalize

SOURCE = 'teeconnie/scam-and-non-scam-call-conversation-dataset'
SEED = 'tell-kaggle-80-20-v1'
# BothBosu's published training types. The label is the only Version that type may ground.
TRAIN_TOPICS = {
    'ssn': 1, 'refund': 1, 'support': 1, 'reward': 1,
    'delivery': 0, 'insurance': 0, 'telemarketing': 0, 'wrong': 0,
}
ROOT = Path(__file__).parents[1]
ARCHIVE = ROOT / 'data/cache/kaggle-scam-calls.zip'


def corpus():
    records = {}
    duplicates = 0
    with ZipFile(ARCHIVE) as archive:
        for filename, label in [('English_NonScam.txt', 0), ('English_Scam.txt', 1)]:
            text = archive.read(filename).decode('utf-8-sig').replace('\r\n', '\n')
            for entry in re.split(r'\n\s*\n', text):
                dialogue = re.sub(r'^\d+\.\s*', '', entry.strip())
                if not dialogue:
                    continue
                digest = hashlib.sha256(' '.join(dialogue.lower().split()).encode()).hexdigest()
                if digest in records:
                    if records[digest][1] != label:
                        raise ValueError('One conversation has conflicting source labels')
                    duplicates += 1
                    continue
                records[digest] = (dialogue, label)
    rows = []
    for label in (0, 1):
        members = sorted((key for key, (_, value) in records.items() if value == label),
                         key=lambda key: hashlib.sha256((SEED + key).encode()).hexdigest())
        if len(members) < 10:
            raise ValueError('Too few conversations for a checked 80/20 split')
        held_out = set(members[:round(len(members) * 0.2)])
        for key in members:
            dialogue, value = records[key]
            rows.append((key, dialogue, value, 'held_out' if key in held_out else 'prompt', None))
    pool_id = hashlib.sha256(json.dumps([SOURCE, SEED, sorted((key, label, split)
        for key, _, label, split, _topic in rows)]).encode()).hexdigest()
    return pool_id, rows, duplicates


BOTHBOSU_SOURCE = 'BothBosu/scam-dialogue'
BOTHBOSU_SEED = 'tell-bothbosu-train-prompt-v1'


def checked_topic(item: Item) -> str | None:
    topic = item.scam_type
    if topic is None:
        return None
    if TRAIN_TOPICS.get(topic) != item.label:
        raise ValueError('BothBosu training topic must match a checked train type for its label')
    return topic


def train_items(rows):
    """Build training items from the training file only. Callers must not pass evaluation rows."""
    items = []
    for row in rows:
        label = int(row['label'])
        topic = (row.get('type') or '').strip() or None
        items.append(Item(row['dialogue'], label, 'train', BOTHBOSU_SOURCE, scam_type=topic))
    return items


def copy_train_topics(data: Corpus, raw: list[Item]) -> Corpus:
    """Attach training-file types onto training rows. Evaluation rows are rejected, not copied."""
    topics = {}
    for item in raw:
        if item.split != 'train' or item.source != BOTHBOSU_SOURCE:
            raise ValueError('Scenario topics can be taken only from BothBosu training rows')
        text = normalize(item.text)
        topic = checked_topic(item)
        if text in topics and topics[text] != topic:
            raise ValueError('One conversation has conflicting source labels')
        topics[text] = topic
    data.train = [replace(item, scam_type=topics.get(normalize(item.text))) for item in data.train]
    return data


def prepare_bothbosu(data: Corpus):
    """Validate the checked training role and produce deterministic prompt rows.

    Evaluation roles are only consulted to reject overlap, never to build examples.
    Canonical text makes duplicate choice independent of input ordering.
    """
    assert_no_leakage(data)
    records = {}
    duplicates = 0
    for item in data.train:
        if (item.source != BOTHBOSU_SOURCE or item.split != 'train'
                or type(item.label) is not int or item.label not in (0, 1)
                or not isinstance(item.text, str) or not normalize(item.text)):
            raise ValueError('BothBosu examples require checked nonempty training dialogue and label 0 or 1')
        text = normalize(item.text)
        key = hashlib.sha256(text.encode()).hexdigest()
        topic = checked_topic(item)
        if key in records:
            if records[key][1] != item.label or records[key][2] != topic:
                raise ValueError('One conversation has conflicting source labels')
            duplicates += 1
        records[key] = (text, item.label, topic)
    if not records:
        raise ValueError('The BothBosu training pool is empty')
    rows = [(key, text, label, 'prompt', topic) for key, (text, label, topic) in sorted(records.items())]
    # Topic is part of the pool id so an untyped import is not reused as a typed one.
    pool_id = hashlib.sha256(json.dumps([BOTHBOSU_SOURCE, BOTHBOSU_SEED,
        [(key, label, split, topic) for key, _, label, split, topic in rows]]).encode()).hexdigest()
    return pool_id, rows, duplicates


def _publish(conn, source, pool_id, rows):
    prompt_count = sum(row[3] == 'prompt' for row in rows)
    held_out_count = len(rows) - prompt_count
    expected = {(key, dialogue, label, topic, split, source, key)
                for key, dialogue, label, split, topic in rows}
    with conn.transaction():
        conn.execute('CREATE TEMP TABLE practice_import (LIKE practice_examples INCLUDING DEFAULTS) ON COMMIT DROP')
        with conn.cursor().copy('COPY practice_import (pool_id,id,dialogue,label,topic,split,source,content_hash) FROM STDIN') as copy:
            for key, dialogue, label, split, topic in rows:
                copy.write_row((pool_id, key, dialogue, label, topic, split, source, key))
        conn.execute('INSERT INTO practice_examples SELECT * FROM practice_import ON CONFLICT (pool_id,id) DO NOTHING')
        stored = conn.execute('SELECT id,dialogue,label,topic,split,source,content_hash FROM practice_examples WHERE pool_id=%s', (pool_id,)).fetchall()
        if set(stored) != expected:
            raise ValueError('Stored data differs from the checked practice pool')
        conn.execute("""INSERT INTO practice_datasets
            (pool_id,source,embedding_model,prompt_count,held_out_count,retrieval_method)
            VALUES (%s,%s,NULL,%s,%s,'lexical') ON CONFLICT (pool_id) DO NOTHING""",
            (pool_id, source, prompt_count, held_out_count))
        metadata = conn.execute('SELECT source,embedding_model,prompt_count,held_out_count,retrieval_method FROM practice_datasets WHERE pool_id=%s', (pool_id,)).fetchone()
        if metadata != (source, None, prompt_count, held_out_count, 'lexical'):
            raise ValueError('Stored practice metadata differs from the checked pool')
    return pool_id


def import_bothbosu(conn, data: Corpus):
    """Publish only validated BothBosu train rows; validate before any writes."""
    pool_id, rows, _ = prepare_bothbosu(data)
    return _publish(conn, BOTHBOSU_SOURCE, pool_id, rows)


def load_bothbosu():
    # Reject conflicting raw training labels before dedupe can hide them.
    # Types are read from the training file only. The held-out files are loaded
    # afterwards so prepare_bothbosu can reject overlap; their text is not copied.
    with source_corpus.ensure_cached('train.csv').open(newline='', encoding='utf-8-sig') as handle:
        raw = train_items(csv.DictReader(handle))
    prepare_bothbosu(Corpus(raw, [], [], []))
    return copy_train_topics(load_real_corpus(), raw)


def main():
    import psycopg
    pool_id, rows, duplicates = corpus()
    prompt_count = sum(row[3] == 'prompt' for row in rows)
    held_out_count = len(rows) - prompt_count
    # The real loader removes the repository's documented train/test overlaps.
    # It does not assert leakage itself, so preparation explicitly checks it.
    both_pool, both_rows, both_duplicates = prepare_bothbosu(load_bothbosu())
    with psycopg.connect(os.environ['DATABASE_URL_DIRECT'], autocommit=True, connect_timeout=10) as conn:
        conn.execute((ROOT / 'migrations/20261108_grounded_practice.sql').read_text())
        conn.execute((ROOT / 'migrations/20261109_kaggle_agent_context.sql').read_text())
        _publish(conn, SOURCE, pool_id, rows)
        _publish(conn, BOTHBOSU_SOURCE, both_pool, both_rows)
    print(json.dumps({'source': BOTHBOSU_SOURCE, 'pool_id': both_pool,
        'prompt': len(both_rows), 'held_out': 0, 'duplicates_removed': both_duplicates,
        'overlap': 0, 'retrieval': 'Postgres full-text'}))
    print(json.dumps({'source': SOURCE, 'pool_id': pool_id, 'prompt': prompt_count,
        'held_out': held_out_count, 'duplicates_removed': duplicates, 'overlap': 0, 'retrieval': 'Postgres full-text'}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Practice import failed ({type(error).__name__}); check the archive and database configuration.')
        raise SystemExit(1)
