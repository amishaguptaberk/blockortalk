import json
import subprocess
import sys
import unittest
from pathlib import Path

from detection.corpus import SECRET_REQUEST, load_hard_negatives, normalize

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"

METRICS_REPORT = """\
detector: tfidf-logistic-regression
train: 2
synthetic_test: 4
real_calls: 4
hard_negatives: 4

Synthetic test
accuracy: 0.7500
precision: 0.6667
recall: 1.0000
f1: 0.8000
confusion_matrix: [[1, 1], [0, 2]]

Real calls
detection_rate: 0.7500
n: 4

Hard negatives
false_alarm_rate: 0.2500
n: 4
"""


class DetectionEvaluationTests(unittest.TestCase):
    def test_metrics_match_the_known_confusion_matrix(self):
        result = self.evaluate("metrics.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, METRICS_REPORT)

    def test_overlapping_item_fails_and_names_the_duplicate(self):
        result = self.evaluate("leakage.json")
        self.assertEqual(result.returncode, 1)
        self.assertIn(
            'leakage: "alpha unique dialogue about a gift card" is in the training/example pool and in synthetic_test',
            result.stderr,
        )
        self.assertNotIn("Synthetic test", result.stdout)

    def test_clean_fixture_passes_the_leakage_check(self):
        result = self.evaluate("metrics.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("leakage:", result.stderr)

    def test_baseline_separates_an_obvious_fixture(self):
        result = self.evaluate("trainable.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("accuracy: 1.0000", result.stdout)
        self.assertIn("detection_rate: 1.0000", result.stdout)
        self.assertIn("false_alarm_rate: 0.0000", result.stdout)
        trained = next(
            line for line in result.stdout.splitlines() if line.startswith("trained_in_seconds:")
        )
        self.assertLess(float(trained.split(": ")[1]), 60)

    def test_hard_negatives_are_in_range_and_ask_for_no_secret(self):
        items = load_hard_negatives()
        self.assertGreaterEqual(len(items), 30)
        self.assertLessEqual(len(items), 50)
        self.assertEqual(len({normalize(item.text) for item in items}), len(items))
        for item in items:
            self.assertIsNone(SECRET_REQUEST.search(item.text), item.source)
            self.assertEqual(item.label, 0)

    def evaluate(self, fixture_name: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "-m", "detection.evaluate", "--fixture", str(FIXTURES / fixture_name)],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )


class HardNegativeFileTests(unittest.TestCase):
    def test_written_dialogues_and_talkmap_calls_are_both_present(self):
        written = json.loads((ROOT / "data" / "hard_negatives.json").read_text(encoding="utf-8"))
        talkmap = json.loads((ROOT / "data" / "talkmap_support_calls.json").read_text(encoding="utf-8"))
        talkmap_count = sum(len(calls) for calls in talkmap.values())
        self.assertGreaterEqual(len(written), 30)
        self.assertEqual(talkmap_count, 10)
        self.assertLessEqual(len(written) + talkmap_count, 50)


if __name__ == "__main__":
    unittest.main()
