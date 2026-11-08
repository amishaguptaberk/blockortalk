"""Score only Kaggle's held-out rows; retrieve examples only from its prompt rows."""
import argparse
import json
import os
import re

from detection.corpus import Item
from detection.nvidia import NvidiaClient
from detection.result import result_from_quotes
from detection.practice_index import SOURCE


def evaluate(connection, classifier, limit=None):
    dataset = connection.execute('SELECT pool_id FROM practice_datasets WHERE source=%s ORDER BY created_at DESC LIMIT 1', (SOURCE,)).fetchone()
    if not dataset:
        raise ValueError('Import the Kaggle dataset first')
    rows = connection.execute("SELECT id,dialogue,label FROM practice_examples WHERE pool_id=%s AND split='held_out' ORDER BY id", (dataset[0],)).fetchall()
    total = len(rows)
    if limit is not None:
        rows = rows[:limit]
    results = []
    for key, text, label in rows:
        examples = connection.execute("""SELECT dialogue,label FROM practice_examples
            WHERE pool_id=%s AND split='prompt' AND source=%s
            ORDER BY ts_rank_cd(to_tsvector('english',dialogue),to_tsquery('english',%s)) DESC,id LIMIT 5""",
            (dataset[0], SOURCE, ' | '.join(re.findall(r'[A-Za-z0-9]+', text)))).fetchall()
        if len(examples) != 5:
            raise ValueError('Prompt pool is incomplete')
        # The target's ground-truth label is used below for scoring, never sent to the classifier.
        prediction = result_from_quotes(text, classifier.classify(text, [Item(t, y, 'train', SOURCE) for t, y in examples]))
        results.append({'id': key, 'expected': 'scam' if label else 'legit', 'prediction': prediction})
    return {'source': SOURCE, 'pool_id': dataset[0], 'held_out_total': total,
        'scored': len(results), 'complete': len(results) == total,
        'correct': sum(r['expected'] == r['prediction']['label'] for r in results),
        'abstained': sum(r['prediction']['label'] is None for r in results), 'results': results}


def main():
    import psycopg
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        raise ValueError('limit must be positive')
    with psycopg.connect(os.environ['DATABASE_URL'], autocommit=True, connect_timeout=10) as connection:
        report = evaluate(connection, NvidiaClient(), args.limit)
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Kaggle evaluation incomplete ({type(error).__name__}); no complete result is claimed.')
        raise SystemExit(1)
