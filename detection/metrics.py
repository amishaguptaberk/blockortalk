"""Binary detection metrics. Scam is the positive class."""

from __future__ import annotations


def confusion_counts(y_true: list[int], y_pred: list[int]) -> tuple[int, int, int, int]:
    if len(y_true) != len(y_pred) or not y_true:
        raise ValueError("predictions and labels must be the same non-empty length")
    tn = fp = fn = tp = 0
    for actual, predicted in zip(y_true, y_pred):
        if actual not in (0, 1) or predicted not in (0, 1):
            raise ValueError(f"labels must be 0 or 1, got {actual} and {predicted}")
        if actual == 0 and predicted == 0:
            tn += 1
        elif actual == 0 and predicted == 1:
            fp += 1
        elif actual == 1 and predicted == 0:
            fn += 1
        else:
            tp += 1
    return tn, fp, fn, tp


def classification_scores(y_true: list[int], y_pred: list[int | None]) -> dict[str, float | list[list[int]]]:
    if len(y_true) != len(y_pred) or not y_true or any(y not in (0, 1) for y in y_true):
        raise ValueError("predictions and binary labels must be the same non-empty length")
    decided = [(actual, predicted) for actual, predicted in zip(y_true, y_pred) if predicted is not None]
    tn, fp, fn, tp = (confusion_counts([a for a, _ in decided], [p for _, p in decided])
                      if decided else (0, 0, 0, 0))
    unknown_legit = sum(a == 0 and p is None for a, p in zip(y_true, y_pred))
    unknown_scam = sum(a == 1 and p is None for a, p in zip(y_true, y_pred))
    total = len(y_true)
    accuracy = (tn + tp) / total
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn + unknown_scam) if (tp + fn + unknown_scam) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    return {
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "confusion_matrix": ([[tn, fp, unknown_legit], [fn, tp, unknown_scam]]
                             if unknown_legit + unknown_scam else [[tn, fp], [fn, tp]]),
    }


def positive_rate(y_pred: list[int]) -> float:
    if not y_pred:
        raise ValueError("cannot score an empty split")
    if any(label not in (0, 1) for label in y_pred):
        raise ValueError("predictions must be 0 or 1")
    return sum(label == 1 for label in y_pred) / len(y_pred)
