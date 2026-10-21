"""Cheap model first, stronger model only for what code checks reject (extraction, verifier, figures)."""

from datetime import date

import pytest

from isnad_worker.ai import gateway
from isnad_worker.pipeline import catalog as catalog_mod
from isnad_worker.pipeline import extract, review
from isnad_worker.pipeline.extract import SegmentInput
from isnad_worker.pipeline.models import Extraction, VerifierResult


def segment(idx: int, text: str) -> SegmentInput:
    return SegmentInput(str(idx), idx, text, None, None, None, None, None)


def claim(idx: int, span: str, value: float, scale: str = "million", unit: str = "visitor") -> dict:
    return {
        "segment": idx,
        "span": span,
        "checkable": True,
        "not_checkable_reason": None,
        "indicator": "الزوار",
        "indicator_slug": None,
        "entity": None,
        "entity_slug": None,
        "claim_type": "level",
        "value": value,
        "scale": scale,
        "decimals": 1 if value % 1 else 0,
        "unit": unit,
        "qualifier": "exact",
        "period_text": None,
        "period_start": None,
        "period_end": None,
        "geography": "Dubai",
        "breakdown": None,
        "attribution": None,
        "speaker": None,
    }


class Script:
    """Stands in for gateway.parse: answers per (escalate) call and records what was sent."""

    def __init__(self, cheap, strong=None) -> None:
        self.cheap, self.strong = list(cheap), list(strong or [])
        self.calls: list[tuple[bool, str]] = []

    def __call__(
        self, task, *, system, messages, output, ctx=None, max_tokens=0, effort=None, escalate=False
    ):
        self.calls.append((escalate, messages[0]["content"]))
        answer = (self.strong if escalate else self.cheap).pop(0)
        if isinstance(answer, Exception):
            raise answer
        return output.model_validate(answer)


@pytest.fixture
def offline(monkeypatch):
    cat = catalog_mod.Catalog(indicators={}, entities={}, indicators_text="", entities_text="")
    monkeypatch.setattr(catalog_mod, "load", lambda: cat)
    monkeypatch.setattr(catalog_mod, "match_indicator", lambda name: None)
    monkeypatch.setattr(catalog_mod, "match_entity", lambda name: None)
    monkeypatch.setattr(extract, "_system_prompt", lambda: "system")
    monkeypatch.setattr(gateway, "can_escalate", lambda task: True)

    def install(script: Script) -> Script:
        monkeypatch.setattr(gateway, "parse", script)
        return script

    return install


def run(segments: list[SegmentInput]):
    return extract.extract(
        segments,
        recorded_at=date(2026, 1, 1),
        title="t",
        kind="article",
        speakers=None,
        ctx=gateway.CallContext(),
    )


SEGMENTS = [
    segment(0, "مساء الخير."),
    segment(1, "وفي قطاع السياحة كانت الأرقام قوية."),
    segment(2, "استقبلت دبي 18.7 مليون زائر دولي."),
    segment(3, "وبلغ عدد الغرف الفندقية 154 ألف غرفة."),
    segment(4, "شكراً لكم."),
]


def test_only_segments_with_numbers_their_context_and_the_lead_are_read():
    assert [s.idx for s in extract.select_segments(SEGMENTS)] == [0, 1, 2, 3]
    long = [segment(i, "نص بلا أرقام.") for i in range(8)] + [segment(8, "بلغ 5 ملايين.")]
    assert [s.idx for s in extract.select_segments(long)] == [0, 1, 7, 8]
    assert extract.select_segments(long[:3]) == []  # nothing to read without a number


def test_the_stronger_model_rereads_only_segments_with_a_missed_statistic(offline):
    script = offline(
        Script(
            cheap=[{"claims": [claim(2, "استقبلت دبي 18.7 مليون زائر دولي", 18.7)]}],
            strong=[
                {
                    "claims": [
                        claim(3, "بلغ عدد الغرف الفندقية 154 ألف غرفة", 154, "thousand", "room")
                    ]
                }
            ],
        )
    )
    claims = run(SEGMENTS)
    assert [c.span_text for c in claims] == [
        "استقبلت دبي 18.7 مليون زائر دولي",
        "بلغ عدد الغرف الفندقية 154 ألف غرفة",
    ]
    cheap, strong = script.calls
    assert not cheap[0] and "[1]" in cheap[1] and "[0]" in cheap[1] and "[4]" not in cheap[1]
    assert strong[0] and "[3]" in strong[1] and "[2]" not in strong[1]


def test_a_span_that_is_not_in_the_text_is_reread(offline):
    script = offline(
        Script(
            cheap=[
                {
                    "claims": [
                        claim(
                            2, "استقبلت دبي 18.7 مليون سائح", 18.7
                        ),  # paraphrased: not in the text
                        claim(3, "عدد الغرف الفندقية 154 ألف غرفة", 154, "thousand", "room"),
                    ]
                }
            ],
            strong=[{"claims": [claim(2, "استقبلت دبي 18.7 مليون زائر دولي", 18.7)]}],
        )
    )
    claims = run(SEGMENTS)
    assert len(claims) == 2 and claims[0].segment.idx == 2
    assert len(script.calls) == 2 and "[3]" not in script.calls[1][1]


def test_no_reread_when_the_cheap_answer_passes(offline):
    script = offline(
        Script(
            cheap=[
                {
                    "claims": [
                        claim(2, "استقبلت دبي 18.7 مليون زائر دولي", 18.7),
                        claim(3, "عدد الغرف الفندقية 154 ألف غرفة", 154, "thousand", "room"),
                    ]
                }
            ]
        )
    )
    assert len(run(SEGMENTS)) == 2
    assert len(script.calls) == 1


def test_an_answer_that_does_not_parse_goes_to_the_stronger_model(offline):
    script = offline(
        Script(
            cheap=[gateway.ModelOutputError("cut off")],
            strong=[{"claims": [claim(2, "استقبلت دبي 18.7 مليون زائر دولي", 18.7)]}],
        )
    )
    assert len(run(SEGMENTS[:3])) == 1
    assert [escalate for escalate, _ in script.calls] == [False, True]


def verdict(agrees: bool, confidence: str = "high") -> dict:
    return {
        "agrees": agrees,
        "issue": "none" if agrees else "period",
        "note_ar": "-",
        "note_en": "-",
        "confidence": confidence,
    }


@pytest.mark.parametrize(
    ("cheap", "asks_again"),
    [(verdict(True), False), (verdict(False), True), (verdict(True, "low"), True)],
)
def test_verifier_objections_and_doubts_are_confirmed_by_the_stronger_model(
    offline, cheap, asks_again
):
    script = offline(Script(cheap=[cheap], strong=[verdict(True)]))
    result = review.verifier(
        claim_sentence="s",
        claim_fields={},
        evidence={},
        verdict="match",
        differing_fields=[],
        ctx=gateway.CallContext(),
    )
    assert isinstance(result, VerifierResult)
    assert len(script.calls) == (2 if asks_again else 1)
    assert result.agrees


def test_extraction_schema_is_unchanged():
    # The model's answer shape is the contract with code; escalation reuses it.
    assert "claims" in Extraction.model_json_schema()["properties"]


def _ask_offline(monkeypatch, script: Script):
    from test_ask import ROWS

    from isnad_worker import ask

    monkeypatch.setattr(gateway, "can_escalate", lambda task: True)
    monkeypatch.setattr(gateway, "parse", script)
    monkeypatch.setattr(gateway, "prompt", lambda name: "system")
    monkeypatch.setattr(ask, "_candidate_ids", lambda q, n: list(ROWS))
    monkeypatch.setattr(ask, "_rows", lambda ids: list(ROWS.values()))
    monkeypatch.setattr(ask, "_figure_for_model", lambda row: {"id": row["id"]})
    monkeypatch.setattr(ask, "_evidence_card", lambda row: {"figure_id": row["id"]})
    return ask


def answer(text: str) -> dict:
    return {"answerable": True, "answer": text, "reason": "", "citations": ["f1"], "follow_ups": []}


def test_ask_fixes_a_slip_in_form_on_the_cheap_model(monkeypatch):
    script = Script(
        cheap=[answer("استقبلت دبي 19.59 مليون زائر"), answer("استقبلت دبي 19.59 مليون زائر [1]")]
    )
    ask = _ask_offline(monkeypatch, script)
    assert ask.answer("كم عدد الزوار؟", None)["answerable"]
    assert [escalate for escalate, _ in script.calls] == [False, False]


def test_ask_sends_an_unbacked_number_to_the_stronger_model(monkeypatch):
    script = Script(
        cheap=[answer("استقبلت دبي 21 مليون زائر [1]")],
        strong=[answer("استقبلت دبي 19.59 مليون زائر [1]")],
    )
    ask = _ask_offline(monkeypatch, script)
    assert ask.answer("كم عدد الزوار؟", None)["answerable"]
    assert [escalate for escalate, _ in script.calls] == [False, True]


def test_ask_gives_up_after_the_stronger_model_fails(monkeypatch):
    script = Script(
        cheap=[answer("21 مليون [1]")],
        strong=[answer("22 مليون [1]")],
    )
    ask = _ask_offline(monkeypatch, script)
    assert not ask.answer("كم عدد الزوار؟", None)["answerable"]
    assert len(script.calls) == 2
