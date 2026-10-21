import pytest

from isnad_worker.eval import scoring
from isnad_worker.eval.harness import summarize
from isnad_worker.eval.scoring import ExtractedClaim


def test_labels_map_to_product_verdicts():
    assert scoring.expected_verdict("different_context") == "context"
    assert scoring.expected_verdict("no_source") == "none"
    assert scoring.expected_verdict("match") == "match"
    with pytest.raises(ValueError):
        scoring.expected_verdict("maybe")


def test_locate_whole_numbers_only():
    text = "استقبلت دبي 19.59 مليون زائر، بنمو 5% مقارنة بـ 2024"
    assert scoring.locate(text, "5%") == text.index("5%")
    assert scoring.locate(text, "19.59") == text.index("19.59")
    # "5" alone must not match inside 19.59 or as the start of 5%... except as a whole number
    assert scoring.locate("بلغ 19.59 مليون", "5") is None
    assert scoring.locate("بلغ 3.789.860 نسمة", "3.789.860") == 4


def _claim(text, target, *, verdict="match", checkable=True, extend=0):
    start = text.index(target)
    return ExtractedClaim(text, start - extend, start + len(target) + 8, checkable, verdict)


def test_predicted_verdict_uses_the_claim_covering_the_target():
    text = "بلغت الصادرات 813.8 مليار درهم بنمو 45.5%"
    claims = [
        _claim(text, "813.8", verdict="match", extend=5),
        _claim(text, "45.5%", verdict="differs"),
    ]
    assert scoring.predicted_verdict(text, "813.8", claims) == ("match", "checked")
    assert scoring.predicted_verdict(text, "45.5%", claims) == ("differs", "checked")


def test_abstentions_count_as_none():
    text = "يتوقع المطار استقبال 70 مليون مسافر"
    assert scoring.predicted_verdict(text, "70", []) == ("none", "not_extracted")
    forecast = [_claim(text, "70", checkable=False, verdict=None)]
    assert scoring.predicted_verdict(text, "70", forecast) == ("none", "not_checkable")
    assert scoring.predicted_verdict(text, "99", []) == ("none", "target_missing")


def test_score_and_risks():
    pairs = [
        ("match", "match"),
        ("match", "differs"),
        ("differs", "match"),
        ("context", "context"),
        ("none", "none"),
        ("none", "match"),
    ]
    metrics = scoring.score(pairs).as_dict()
    assert metrics["total"] == 6
    assert metrics["correct"] == 3
    assert metrics["accuracy"] == 0.5
    assert metrics["confusion"]["differs"]["match"] == 1
    match = metrics["by_verdict"]["match"]
    assert match["support"] == 2
    assert match["predicted"] == 3
    assert match["precision"] == pytest.approx(1 / 3, abs=1e-4)
    assert match["recall"] == 0.5
    assert scoring.risk_counts(pairs) == {
        "false_reassurance": 1,
        "false_alarm": 1,
        "unsupported_shown": 1,
    }


def test_summarize_rates():
    base = {
        "evidence_verified": True,
        "discovered": False,
        "right_document": True,
        "how": "checked",
        "error": None,
        "cost_usd": 0.1,
        "seconds": 10.0,
    }
    results = [
        {**base, "expected": "match", "predicted": "match"},
        {**base, "expected": "differs", "predicted": "differs", "evidence_verified": False},
        {
            **base,
            "expected": "none",
            "predicted": "none",
            "right_document": None,
            "how": "not_checkable",
        },
    ]
    metrics = summarize(results)
    assert metrics["accuracy"] == 1.0
    assert metrics["evidence_verified_rate"] == 0.5
    assert metrics["right_document_rate"] == 1.0
    assert metrics["abstention_reasons"]["not_checkable"] == 1
    assert metrics["cost_usd"] == pytest.approx(0.3)
    assert scoring.percentile([1, 2, 3, 4, 5], 0.9) == 5
