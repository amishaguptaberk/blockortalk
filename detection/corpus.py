"""Load the detection splits and keep their roles from leaking into each other."""

from __future__ import annotations

import csv
import json
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = DATA / "cache"

SOURCES = {
    "train.csv": "https://huggingface.co/datasets/BothBosu/scam-dialogue/resolve/main/scam-dialogue_train.csv",
    "test.csv": "https://huggingface.co/datasets/BothBosu/scam-dialogue/resolve/main/scam-dialogue_test.csv",
    "yt.csv": "https://huggingface.co/datasets/436-4/youtube-scam-conversations/resolve/main/youtube_scam_conversations.csv",
    "ftc.csv": "https://raw.githubusercontent.com/wspr-ncsu/robocall-audio-dataset/main/metadata.csv",
}

SECRET_REQUEST = re.compile(
    r"social security|\bssn\b|password|passcode|one-time code|verification code|"
    r"\bpin\b|cvv|card number|routing number|account number",
    re.IGNORECASE,
)


class LeakageError(Exception):
    """A held-out item also appears in the training example pool."""


@dataclass(frozen=True)
class Item:
    text: str
    label: int
    split: str
    source: str
    y_pred: int | None = None
    scam_type: str | None = None


@dataclass
class Corpus:
    train: list[Item]
    synthetic_test: list[Item]
    real_calls: list[Item]
    hard_negatives: list[Item]
    removed_within_split: int = 0
    removed_from_example_pool: int = 0

    def held_out(self) -> tuple[tuple[str, list[Item]], ...]:
        return (
            ("synthetic_test", self.synthetic_test),
            ("real_calls", self.real_calls),
            ("hard_negatives", self.hard_negatives),
        )


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


def dedupe_within(corpus: Corpus) -> Corpus:
    removed = 0
    for name in ("train", "synthetic_test", "real_calls", "hard_negatives"):
        kept, dropped = _dedupe(getattr(corpus, name))
        setattr(corpus, name, kept)
        removed += dropped
    corpus.removed_within_split = removed
    return corpus


def remove_known_from_example_pool(corpus: Corpus) -> Corpus:
    """Drop dialogues BothBosu shipped in both the train and test files.

    Anything else that still overlaps fails in assert_no_leakage, which is
    what a copied test dialogue should hit.
    """
    payload = json.loads((DATA / "removed_from_example_pool.json").read_text(encoding="utf-8"))
    banned = {normalize(text) for text in payload["normalized_texts"]}
    kept = []
    removed = 0
    for item in corpus.train:
        if normalize(item.text) in banned:
            removed += 1
            continue
        kept.append(item)
    corpus.train = kept
    corpus.removed_from_example_pool = removed
    return corpus


def assert_no_leakage(corpus: Corpus) -> None:
    pool = {normalize(item.text) for item in corpus.train}
    hits: list[str] = []
    for split, items in corpus.held_out():
        for item in items:
            text = normalize(item.text)
            if text in pool:
                hits.append(f'leakage: "{text}" is in the training/example pool and in {split}')
    if hits:
        raise LeakageError("\n".join(hits))


def assert_checked_roles(corpus: Corpus) -> None:
    for item in corpus.real_calls:
        if item.label != 1:
            raise ValueError(f"real calls are all scams; {item.source} is labeled {item.label}")
    for item in corpus.hard_negatives:
        if item.label != 0:
            raise ValueError(f"hard negatives are all legitimate; {item.source} is labeled {item.label}")
    for split, items in (("train", corpus.train), ("synthetic_test", corpus.synthetic_test)):
        for item in items:
            if item.label not in (0, 1):
                raise ValueError(f"{split} label must be 0 or 1 ({item.source})")


def load_real_corpus() -> Corpus:
    train = _read_dialogue_csv(ensure_cached("train.csv"), "train", "BothBosu/scam-dialogue", "label")
    synthetic = _read_dialogue_csv(
        ensure_cached("test.csv"), "synthetic_test", "BothBosu/scam-dialogue", "label"
    )
    youtube = _read_dialogue_csv(
        ensure_cached("yt.csv"), "real_calls", "436-4/youtube-scam-conversations", "labels"
    )
    robocalls = _read_ftc(ensure_cached("ftc.csv"))
    corpus = Corpus(
        train=train,
        synthetic_test=synthetic,
        real_calls=youtube + robocalls,
        hard_negatives=load_hard_negatives(),
    )
    corpus = dedupe_within(corpus)
    corpus = remove_known_from_example_pool(corpus)
    assert_checked_roles(corpus)
    _require_hard_negative_count(corpus.hard_negatives)
    return corpus


def load_fixture(path: Path) -> Corpus:
    payload = json.loads(path.read_text(encoding="utf-8"))
    corpus = Corpus(
        train=[_item(row, "train") for row in payload["train"]],
        synthetic_test=[_item(row, "synthetic_test") for row in payload["synthetic_test"]],
        real_calls=[_item(row, "real_calls") for row in payload["real_calls"]],
        hard_negatives=[_item(row, "hard_negatives") for row in payload["hard_negatives"]],
    )
    corpus = dedupe_within(corpus)
    assert_checked_roles(corpus)
    return corpus


def load_hard_negatives() -> list[Item]:
    written = json.loads((DATA / "hard_negatives.json").read_text(encoding="utf-8"))
    items = []
    for row in written:
        text = row["text"]
        source = f"team-written:{row['id']}"
        _reject_secret_request(text, source)
        items.append(Item(text=text, label=0, split="hard_negatives", source=source))
    talkmap = json.loads((DATA / "talkmap_support_calls.json").read_text(encoding="utf-8"))
    for corpus_name, conversations in talkmap.items():
        for call_id, turns in conversations.items():
            text = " ".join(f"{role}: {utterance}" for role, utterance in turns)
            source = f"{corpus_name}:{call_id}"
            _reject_secret_request(text, source)
            items.append(Item(text=text, label=0, split="hard_negatives", source=source))
    return items


def ensure_cached(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if path.exists() and path.stat().st_size > 0:
        return path
    request = urllib.request.Request(SOURCES[name], headers={"User-Agent": "tell-detection-eval"})
    with urllib.request.urlopen(request, timeout=120) as response:
        path.write_bytes(response.read())
    return path


def _require_hard_negative_count(items: list[Item]) -> None:
    count = len(items)
    if not 30 <= count <= 50:
        raise ValueError(f"hard negatives must be 30 to 50 after dedupe, found {count}")


def _reject_secret_request(text: str, source: str) -> None:
    match = SECRET_REQUEST.search(text)
    if match:
        raise ValueError(f"{source} asks for a secret ({match.group(0)!r})")


def _item(row: dict, split: str) -> Item:
    prediction = row.get("y_pred")
    return Item(
        text=row["text"],
        label=int(row["label"]),
        split=split,
        source=row.get("source", split),
        y_pred=None if prediction is None else int(prediction),
        scam_type=row.get("scam_type"),
    )


def _dedupe(items: list[Item]) -> tuple[list[Item], int]:
    seen: set[str] = set()
    kept: list[Item] = []
    removed = 0
    for item in items:
        key = normalize(item.text)
        if not key or key in seen:
            removed += 1
            continue
        seen.add(key)
        kept.append(item)
    return kept, removed


def _read_dialogue_csv(path: Path, split: str, source: str, label_column: str) -> list[Item]:
    items = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            text = row["dialogue"]
            label = int(row[label_column])
            items.append(Item(text=text, label=label, split=split, source=source,
                              scam_type=row.get("type") if label else None))
    if not items:
        raise ValueError(f"{path} has no dialogues")
    return items


def _read_ftc(path: Path) -> list[Item]:
    items = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            text = row["transcript"]
            items.append(
                Item(text=text, label=1, split="real_calls", source="wspr-ncsu/robocall-audio-dataset")
            )
    if not items:
        raise ValueError(f"{path} has no transcripts")
    return items
