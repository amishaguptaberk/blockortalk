"""Confidence-aware evaluation. Abstentions remain visible and never count as correct."""

from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import statistics
import sys
import time
import threading
from pathlib import Path
from detection.metrics import classification_scores


class Checkpoint:
    def __init__(self, path, namespace):
        self.path = path
        self.namespace = namespace
        self.lock = threading.Lock()
        self.rows = {}
        if path.exists():
            content = path.read_text(encoding="utf-8")
            for line in content.splitlines():
                try:
                    entry = json.loads(line)
                    if entry["namespace"] == namespace:
                        self.rows[entry["key"]] = entry["row"]
                except (json.JSONDecodeError, KeyError):
                    # An interrupted append may leave a partial final line.
                    continue
            if content and not content.endswith("\n"):
                with path.open("a", encoding="utf-8") as output:
                    output.write("\n")

    def save(self, key, row):
        with self.lock, self.path.open("a", encoding="utf-8") as output:
            output.write(json.dumps({"namespace": self.namespace, "key": key, "row": row}) + "\n")
            output.flush()
            self.rows[key] = row


def score(corpus, detector, workers=1, clock=time.perf_counter, checkpoint=None):
    def detect(item):
        identity = hashlib.sha256(json.dumps([item.text, item.source, item.label]).encode()).hexdigest()
        key = detector.name + ":" + identity
        if checkpoint is not None and key in checkpoint.rows:
            return checkpoint.rows[key]
        started = clock()
        result = detector.detect(item.text)
        row = {"id": hashlib.sha256(item.text.encode()).hexdigest(), "source": item.source,
               "actual": item.label, "result": result, "seconds": clock() - started}
        if checkpoint is not None:
            checkpoint.save(key, row)
        return row

    groups = {}
    executor = ThreadPoolExecutor(max_workers=workers)
    try:
        for split, items in corpus.held_out():
            rows = [None] * len(items)
            futures = {executor.submit(detect, item): index for index, item in enumerate(items)}
            for completed, future in enumerate(as_completed(futures), 1):
                rows[futures[future]] = future.result()
                if completed % 50 == 0:
                    print(f"{detector.name}: {split} {completed}/{len(items)}", file=sys.stderr, flush=True)
            groups[split] = rows
    finally:
        executor.shutdown(wait=True, cancel_futures=True)
    return {"detector": detector.name, "groups": groups}


def format_comparison(corpus, report):
    groups = report["groups"]
    rows = groups["synthetic_test"]
    metrics = classification_scores([row["actual"] for row in rows],
        [{"legit": 0, "scam": 1, None: None}[row["result"]["label"]] for row in rows])
    times = [row["seconds"] for rows in groups.values() for row in rows]
    shown_matrix = metrics["confusion_matrix"]
    lines = [f"detector: {report['detector']}", f"train: {len(corpus.train)}"]
    lines.extend(f"{split}: {len(rows)}" for split, rows in groups.items())
    lines.extend([
        f"median_detection_seconds: {statistics.median(times):.4f}", "", "Synthetic test",
        f"accuracy: {metrics['accuracy']:.4f}", f"precision: {metrics['precision']:.4f}",
        f"recall: {metrics['recall']:.4f}", f"f1: {metrics['f1']:.4f}", f"confusion_matrix: {shown_matrix}",
    ])
    if len(shown_matrix[0]) == 3:
        lines.append("prediction_columns: legit, scam, uncertain (rows: legit, scam)")
    for split, heading, metric in (("real_calls", "Real calls", "detection_rate"),
                                    ("hard_negatives", "Hard negatives", "false_alarm_rate")):
        rows = groups[split]
        rate = sum(row["result"]["label"] == "scam" for row in rows) / len(rows)
        lines.extend(["", heading, f"{metric}: {rate:.4f}", f"n: {len(rows)}"])
    lines.append("")
    for split, rows in groups.items():
        unknown = sum(row["result"]["label"] is None for row in rows)
        lines.append(f"{split}_abstentions: {unknown}/{len(rows)}")
    return "\n".join(lines)


def run(corpus, args, detector_factory, clock):
    # The caller checks the FULL corpus before any limiting. A smoke run cannot
    # accidentally conceal a held-out duplicate outside its selected rows.
    if args.limit:
        from dataclasses import replace
        import random
        selection = {name: random.Random(7).sample(items, min(args.limit, len(items)))
                     for name, items in corpus.held_out()}
        corpus = replace(corpus, **selection)
        print(f"SMOKE RUN: at most {args.limit} items per scoring split; not a full evaluation.")
    if any(not items for _, items in corpus.held_out()):
        raise ValueError("each scoring split must be non-empty")
    reports = []
    def save_report(complete):
        if args.output:
            temporary = args.output.with_name(args.output.name + ".tmp")
            temporary.write_text(json.dumps({"complete": complete, "smoke_limit": args.limit,
                                             "reports": reports}, indent=2), encoding="utf-8")
            temporary.replace(args.output)

    save_report(False)
    with detector_factory(corpus, args.detectors) as detectors:
        path = args.checkpoint or (args.output.with_suffix(".jsonl") if args.output else None)
        checkpoint = None
        if path:
            code = hashlib.sha256(b"".join(p.read_bytes() for p in sorted(Path(__file__).parent.glob("*.py"))))
            identity = [code.hexdigest(),
                        [(i.text, i.label, i.source, i.scam_type) for i in corpus.train],
                        [(d.name, getattr(getattr(d, "llm", None), "model", None),
                          getattr(getattr(getattr(d, "pool", None), "embeddings", None), "model", None))
                         for d in detectors]]
            namespace = hashlib.sha256(json.dumps(identity).encode()).hexdigest()
            checkpoint = Checkpoint(path, namespace)
        for detector in detectors:
            report = score(corpus, detector, args.workers, clock, checkpoint)
            reports.append(report)
            save_report(len(reports) == len(detectors))
            print(format_comparison(corpus, report), flush=True)
    return 0
