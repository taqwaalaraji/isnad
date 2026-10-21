"""Scoring an evaluation run: label mapping, locating the labelled number, and the metrics.

Pure functions, so the harness's arithmetic is unit-tested apart from the pipeline.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

VERDICTS = ("match", "context", "differs", "none")

# The corpus labels (sample-data/manifest.json) → the product's verdicts.
LABELS = {
    "match": "match",
    "different_context": "context",
    "context": "context",
    "differs": "differs",
    "no_source": "none",
    "none": "none",
}


def expected_verdict(label: str) -> str:
    try:
        return LABELS[label]
    except KeyError as exc:
        raise ValueError(f"unknown corpus label: {label}") from exc


def locate(text: str, target: str) -> int | None:
    """Where the labelled number is written in the text: a whole number, never part of another."""
    pattern = re.compile(r"(?<![\d.,])" + re.escape(target) + r"(?![\d]|[.,]\d)")
    match = pattern.search(text)
    return match.start() if match else None


@dataclass
class ExtractedClaim:
    """What the pipeline produced for one number (only the fields scoring needs)."""

    segment_text: str
    span_start: int | None
    span_end: int | None
    checkable: bool
    verdict: str | None  # None when it wasn't checked


def predicted_verdict(text: str, target: str, claims: list[ExtractedClaim]) -> tuple[str, str]:
    """The pipeline's verdict for the labelled number, and how it was found.

    The labelled number is the claim whose span covers it. A number that wasn't extracted, or was
    extracted as not checkable (forecasts, opinions), counts as "none": the pipeline abstained.
    """
    for claim in claims:
        at = locate(claim.segment_text, target)
        if at is None or claim.span_start is None or claim.span_end is None:
            continue
        if claim.span_start <= at < claim.span_end:
            if not claim.checkable:
                return "none", "not_checkable"
            return (claim.verdict or "none"), "checked" if claim.verdict else "no_result"
    return "none", "not_extracted" if locate(text, target) is not None else "target_missing"


@dataclass
class Metrics:
    total: int = 0
    correct: int = 0
    confusion: dict[str, dict[str, int]] = field(default_factory=dict)
    per_verdict: dict[str, dict[str, float]] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "total": self.total,
            "correct": self.correct,
            "accuracy": round(self.correct / self.total, 4) if self.total else 0.0,
            "confusion": self.confusion,
            "by_verdict": self.per_verdict,
        }


def score(pairs: list[tuple[str, str]]) -> Metrics:
    """Accuracy, the confusion matrix (expected → predicted) and per-verdict precision/recall/F1."""
    metrics = Metrics(total=len(pairs), correct=sum(1 for e, p in pairs if e == p))
    counts = Counter(pairs)
    metrics.confusion = {e: {p: counts[(e, p)] for p in VERDICTS} for e in VERDICTS}
    for v in VERDICTS:
        tp = counts[(v, v)]
        predicted = sum(counts[(e, v)] for e in VERDICTS)
        actual = sum(counts[(v, p)] for p in VERDICTS)
        precision = tp / predicted if predicted else 0.0
        recall = tp / actual if actual else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        metrics.per_verdict[v] = {
            "support": actual,
            "predicted": predicted,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }
    return metrics


def risk_counts(pairs: list[tuple[str, str]]) -> dict[str, int]:
    """The errors that matter most to a newsroom.

    - false_reassurance: a wrong or out-of-context number shown as matching its source
    - false_alarm: a correct number flagged as differing
    - unsupported_shown: a number with no official source given a source
    """
    return {
        "false_reassurance": sum(
            1 for e, p in pairs if e in ("differs", "context") and p == "match"
        ),
        "false_alarm": sum(1 for e, p in pairs if e == "match" and p == "differs"),
        "unsupported_shown": sum(1 for e, p in pairs if e == "none" and p != "none"),
    }


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))
    return ordered[index]
