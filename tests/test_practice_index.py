import csv
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile
import unittest
import uuid

from detection.corpus import Corpus, Item, LeakageError
from detection.practice_index import copy_train_topics, import_bothbosu, prepare_bothbosu, train_items

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'BothBosu/scam-dialogue'


def fixture():
    return Corpus([Item(f'bank account dialogue {label}-{i}', label, 'train', SOURCE)
                   for label in (0, 1) for i in range(5)],
                  [Item('held out sentinel', 1, 'synthetic_test', SOURCE)],
                  [Item('real calls sentinel', 1, 'real_calls', 'other')],
                  [Item('hard negative sentinel', 0, 'hard_negatives', 'team-written')])


class PreparationTests(unittest.TestCase):
    def test_normalized_deduplication_is_stable_and_training_only(self):
        data = fixture()
        data.train.append(Item(' BANK  account dialogue 0-0 ', 0, 'train', SOURCE))
        pool, rows, duplicates = prepare_bothbosu(data)
        self.assertEqual(len(rows), 10)
        self.assertEqual(duplicates, 1)
        self.assertTrue(all(row[3] == 'prompt' for row in rows))
        self.assertEqual((pool, rows), prepare_bothbosu(Corpus(list(reversed(data.train)), [], [], []))[:2])
        self.assertFalse(any('sentinel' in row[1] for row in rows))

    def test_conflicts_malformed_provenance_and_leakage_fail_closed(self):
        for item in [Item('x', 1, 'train', 'other'), Item('x', 1, 'synthetic_test', SOURCE),
                     Item('x', 2, 'train', SOURCE), Item(' ', 0, 'train', SOURCE),
                     Item(' BANK ACCOUNT dialogue 0-0 ', 1, 'train', SOURCE)]:
            with self.subTest(item=item), self.assertRaises(ValueError):
                data = fixture()
                data.train.append(item)
                prepare_bothbosu(data)
        data = fixture()
        data.synthetic_test.append(data.train[0])
        with self.assertRaises(LeakageError):
            import_bothbosu(None, data)  # Leakage must fail before any database operation.

    def test_topics_come_from_training_rows_and_match_the_train_type_label(self):
        items = train_items([
            {'dialogue': 'please review the practice policy', 'type': 'insurance', 'label': '0'},
            {'dialogue': 'a refund is ready', 'type': 'refund', 'label': '1'},
            {'dialogue': 'no type column', 'label': '0'},
        ])
        self.assertEqual([item.scam_type for item in items], ['insurance', 'refund', None])
        data = fixture()
        data.train.append(Item('train refund dialogue', 1, 'train', SOURCE, scam_type='refund'))
        data.synthetic_test.append(Item('unique held out refund pitch', 1, 'synthetic_test', SOURCE, scam_type='refund'))
        _, rows, _ = prepare_bothbosu(data)
        self.assertTrue(any(row[4] == 'refund' and row[1] == 'train refund dialogue' for row in rows))
        self.assertFalse(any('unique held out' in row[1] for row in rows))
        copied = copy_train_topics(fixture(), [Item('bank account dialogue 0-0', 0, 'train', SOURCE, scam_type='delivery')])
        self.assertEqual(next(item.scam_type for item in copied.train if item.text == 'bank account dialogue 0-0'), 'delivery')
        self.assertTrue(all(item.scam_type is None for item in copied.synthetic_test + copied.real_calls + copied.hard_negatives))
        for item in [Item('fresh', 0, 'train', SOURCE, scam_type='refund'),
                     Item('fresh', 1, 'train', SOURCE, scam_type='youtube'),
                     Item('held out sentinel', 1, 'synthetic_test', SOURCE, scam_type='refund')]:
            with self.subTest(item=item), self.assertRaises(ValueError):
                prepare_bothbosu(Corpus([item], [], [], [])) if item.split == 'train' else copy_train_topics(fixture(), [item])


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL required')
class ImportTests(unittest.TestCase):
    def test_public_importer_feeds_actual_scenario_retrieval_idempotently(self):
        import psycopg
        from psycopg import sql
        schema = 'practice_import_' + uuid.uuid4().hex
        with psycopg.connect(os.environ['TEST_DATABASE_URL'], autocommit=True) as conn:
            conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
            try:
                conn.execute(sql.SQL('SET search_path TO {}').format(sql.Identifier(schema)))
                conn.execute((ROOT / 'migrations/20261108_grounded_practice.sql').read_text())
                conn.execute((ROOT / 'migrations/20261109_kaggle_agent_context.sql').read_text())
                data = fixture()
                pool = import_bothbosu(conn, data)
                self.assertEqual(import_bothbosu(conn, data), pool)
                self.assertEqual(conn.execute('SELECT source,embedding_model,prompt_count,held_out_count,retrieval_method FROM practice_datasets').fetchall(), [(SOURCE, None, 10, 0, 'lexical')])
                self.assertEqual(conn.execute('SELECT count(*) FROM practice_examples').fetchone()[0], 10)
                # Node's connection accepts a URL; pass search_path through PGOPTIONS.
                result = subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e', '''
import { createScenarioCorpus } from './lib/season/scenarios/corpus.ts';
const corpus = createScenarioCorpus(process.env.TEST_DATABASE_URL);
const results = await Promise.all(['real','scam'].map(v => corpus.examples('Bank fraud alert',v)));
console.log(JSON.stringify(results));
'''], cwd=ROOT, env={**os.environ, 'PGOPTIONS': f'-csearch_path={schema}'}, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                real, scam = json.loads(result.stdout)
                self.assertEqual(len(real), 5)
                self.assertEqual(len(scam), 5)
                self.assertTrue(all(row['label'] == 0 and row['source'] == SOURCE for row in real))
                self.assertTrue(all(row['label'] == 1 and row['source'] == SOURCE for row in scam))
                self.assertFalse(any('sentinel' in row['dialogue'] for row in real + scam))
                # Exercise the supported Python entrypoint against fixture files,
                # retaining the real loader's known-overlap removal path.
                conn.execute('DELETE FROM practice_examples WHERE source=%s', (SOURCE,))
                conn.execute('DELETE FROM practice_datasets WHERE source=%s', (SOURCE,))
                with tempfile.TemporaryDirectory() as directory:
                    directory = Path(directory)
                    archive = directory / 'kaggle.zip'
                    with ZipFile(archive, 'w') as zipped:
                        for filename, label in [('English_NonScam.txt', 0), ('English_Scam.txt', 1)]:
                            zipped.writestr(filename, '\n\n'.join(f'Kaggle example {label}-{i}' for i in range(10)))
                    banned = json.loads((ROOT / 'data/removed_from_example_pool.json').read_text())['normalized_texts'][0]
                    for filename, dialogues in [('train.csv', [(i.text, i.label) for i in data.train] + [(banned, 1)]),
                                                ('test.csv', [('held out sentinel', 1), (banned, 1)]),
                                                ('yt.csv', [('real calls sentinel', 1)])]:
                        with (directory / filename).open('w') as handle:
                            writer = csv.writer(handle)
                            writer.writerow(['dialogue', 'labels' if filename == 'yt.csv' else 'label'])
                            writer.writerows(dialogues)
                    (directory / 'ftc.csv').write_text('transcript\nFTC sentinel\n')
                    script = """
import sys
from pathlib import Path
from detection import corpus as source, practice_index
source.ensure_cached = lambda name: Path(sys.argv[1]) / name
practice_index.ARCHIVE = Path(sys.argv[1]) / 'kaggle.zip'
practice_index.main()
"""
                    environment = {**os.environ, 'DATABASE_URL_DIRECT': os.environ['TEST_DATABASE_URL'],
                                   'PGOPTIONS': f'-csearch_path={schema}'}
                    for _ in range(2):
                        command = subprocess.run([sys.executable, '-c', script, str(directory)],
                                                 cwd=ROOT, env=environment, capture_output=True, text=True)
                        self.assertEqual(command.returncode, 0, command.stderr)
                    self.assertEqual(conn.execute("SELECT prompt_count,held_out_count FROM practice_datasets WHERE source=%s", ('teeconnie/scam-and-non-scam-call-conversation-dataset',)).fetchone(), (16, 4))
                    self.assertEqual(conn.execute('SELECT count(*) FROM practice_examples WHERE source=%s', (SOURCE,)).fetchone()[0], 10)
                    cli_retrieval = subprocess.run(result.args, cwd=ROOT,
                        env={**os.environ, 'PGOPTIONS': f'-csearch_path={schema}'},
                        capture_output=True, text=True)
                    self.assertEqual(cli_retrieval.returncode, 0, cli_retrieval.stderr)
                    self.assertEqual(json.loads(cli_retrieval.stdout), [real, scam])
                    # Loader deduplication must not hide conflicting raw labels.
                    with (directory / 'train.csv').open('a') as handle:
                        csv.writer(handle).writerow([' BANK account dialogue 0-0 ', 1])
                    command = subprocess.run([sys.executable, '-c', script, str(directory)],
                                             cwd=ROOT, env=environment, capture_output=True, text=True)
                    self.assertNotEqual(command.returncode, 0)
                    self.assertIn('conflicting source labels', command.stderr)
                conn.execute("UPDATE practice_examples SET source='malformed' WHERE pool_id=%s AND id=(SELECT id FROM practice_examples WHERE pool_id=%s LIMIT 1)", (pool, pool))
                with self.assertRaises(ValueError):
                    import_bothbosu(conn, data)
                conn.execute('DELETE FROM practice_examples WHERE pool_id=%s', (pool,))
                conn.execute('UPDATE practice_datasets SET prompt_count=999 WHERE pool_id=%s', (pool,))
                with self.assertRaisesRegex(ValueError, 'metadata'):
                    import_bothbosu(conn, data)
                self.assertEqual(conn.execute('SELECT count(*) FROM practice_examples WHERE pool_id=%s', (pool,)).fetchone()[0], 0)
            finally:
                conn.execute('SET search_path TO public')
                conn.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
