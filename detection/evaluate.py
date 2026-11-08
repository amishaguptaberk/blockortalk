"""Score a detector on the synthetic test, real calls, and hard negatives.

One command from a checkout that already has the Python packages:

    python -m detection.evaluate
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from detection.baseline import TfidfBaseline
from detection.corpus import LeakageError, assert_no_leakage, load_fixture, load_real_corpus
from detection.metrics import classification_scores, positive_rate
from detection.nvidia import NvidiaError


def legacy_fixture_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate the TF-IDF detection baseline.")
    parser.add_argument(
        "--fixture",
        type=Path,
        help="Score a small JSON corpus instead of the real datasets. Items may include y_pred.",
    )
    args = parser.parse_args(argv)
    try:
        if args.fixture:
            corpus = load_fixture(args.fixture)
            trained_in = None
            detector_name = "tfidf-logistic-regression"
        else:
            corpus = load_real_corpus()
            trained_in = None
            detector_name = "tfidf-logistic-regression"
        assert_no_leakage(corpus)
        predictions = _predictions(corpus)
        if predictions is None:
            started = time.perf_counter()
            model = TfidfBaseline().fit(corpus.train)
            trained_in = time.perf_counter() - started
            detector_name = model.name
            if trained_in >= 60:
                raise RuntimeError(f"baseline training took {trained_in:.1f}s, which is over a minute")
            predictions = {
                "synthetic_test": model.predict(corpus.synthetic_test),
                "real_calls": model.predict(corpus.real_calls),
                "hard_negatives": model.predict(corpus.hard_negatives),
            }
        report = format_report(corpus, detector_name, predictions, trained_in, show_prep=args.fixture is None)
    except LeakageError as error:
        print(error, file=sys.stderr)
        return 1
    print(report)
    return 0


def format_report(corpus, detector_name, predictions, trained_in, show_prep: bool) -> str:
    synthetic = classification_scores(
        [item.label for item in corpus.synthetic_test], predictions["synthetic_test"]
    )
    detection = positive_rate(predictions["real_calls"])
    false_alarms = positive_rate(predictions["hard_negatives"])
    matrix = synthetic["confusion_matrix"]
    lines = [
        f"detector: {detector_name}",
        f"train: {len(corpus.train)}",
        f"synthetic_test: {len(corpus.synthetic_test)}",
        f"real_calls: {len(corpus.real_calls)}",
        f"hard_negatives: {len(corpus.hard_negatives)}",
    ]
    if show_prep:
        lines.append(f"removed_within_split: {corpus.removed_within_split}")
        lines.append(f"removed_from_example_pool: {corpus.removed_from_example_pool}")
    if trained_in is not None:
        lines.append(f"trained_in_seconds: {trained_in:.2f}")
    lines.extend(
        [
            "",
            "Synthetic test",
            f"accuracy: {synthetic['accuracy']:.4f}",
            f"precision: {synthetic['precision']:.4f}",
            f"recall: {synthetic['recall']:.4f}",
            f"f1: {synthetic['f1']:.4f}",
            f"confusion_matrix: {matrix}",
            "",
            "Real calls",
            f"detection_rate: {detection:.4f}",
            f"n: {len(corpus.real_calls)}",
            "",
            "Hard negatives",
            f"false_alarm_rate: {false_alarms:.4f}",
            f"n: {len(corpus.hard_negatives)}",
        ]
    )
    return "\n".join(lines)


def _predictions(corpus):
    groups = {
        "synthetic_test": corpus.synthetic_test,
        "real_calls": corpus.real_calls,
        "hard_negatives": corpus.hard_negatives,
    }
    supplied = [item.y_pred is not None for items in groups.values() for item in items]
    if not any(supplied):
        return None
    if not all(supplied):
        raise ValueError("either every held-out item has y_pred, or none do")
    return {name: [item.y_pred for item in items] for name, items in groups.items()}


def main(argv=None, *, detector_factory=None, clock=time.perf_counter):
    parser = argparse.ArgumentParser(description="Compare baseline, zero-shot and retrieval detectors.")
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--detectors", choices=("all", "baseline"))
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--limit", type=int, help="Smoke run: maximum scored items per split (seed 7)")
    parser.add_argument("--output", type=Path, help="Save structured results, timings and abstentions as JSON")
    parser.add_argument("--checkpoint", type=Path, help="Resume completed items from this JSONL file")
    args = parser.parse_args(argv)
    if args.workers < 1 or (args.limit is not None and args.limit < 1):
        parser.error("workers and limit must be positive")
    # Keep issue 3's canned-prediction fixture CLI stable. Live runs now default to all three.
    if args.fixture and args.detectors is None and not args.limit and not args.output and not args.checkpoint:
        return legacy_fixture_main(["--fixture", str(args.fixture)])
    args.detectors = args.detectors or "all"
    try:
        corpus = load_fixture(args.fixture) if args.fixture else load_real_corpus()
        assert_no_leakage(corpus)
        from detection.comparison import run
        from detection.runtime import open_detectors
        return run(corpus, args, detector_factory or open_detectors, clock)
    except LeakageError as error:
        print(error, file=sys.stderr)
        return 1
    except NvidiaError as error:
        print(error, file=sys.stderr)
        return 1
    except Exception as error:
        # Do not print database/vendor exception bodies, which can contain credentials.
        print(f"Evaluation failed ({type(error).__name__}); check pool indexing, environment and endpoints.",
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
