from decimal import Decimal

from isnad_worker.pipeline.extract import _reread_number
from isnad_worker.pipeline.models import ExtractedClaim


def reading(
    value: float, scale: str = "one", unit: str = "AED", decimals: int = 0
) -> ExtractedClaim:
    return ExtractedClaim(
        segment=0,
        span="",
        checkable=True,
        not_checkable_reason=None,
        indicator="",
        indicator_slug=None,
        entity=None,
        entity_slug=None,
        claim_type="level",
        value=value,
        scale=scale,
        decimals=decimals,
        unit=unit,
        qualifier="exact",
        period_text=None,
        period_start=None,
        period_end=None,
        geography="UAE",
        breakdown=None,
        attribution=None,
        speaker=None,
    )


def test_code_reads_the_digits_of_the_claimed_number():
    assert _reread_number(
        "استقبلت دبي 19.59 مليون زائر خلال 2025", reading(19.6, "million", "visitor")
    ) == (
        Decimal("19.59"),
        "million",
        2,
    )


def test_code_corrects_the_models_scale_when_the_digits_agree():
    assert _reread_number("بلغت 34.2 مليار درهم", reading(34.2, "million")) == (
        Decimal("34.2"),
        "billion",
        1,
    )


def test_a_year_never_replaces_a_spoken_amount():
    # Transcripts often say the amount in words and the year in digits.
    value, scale, _ = _reread_number(
        "لحوالي اثنين تريليون درهم بالنصف الاول من 2026", reading(2, "trillion")
    )
    assert (value, scale) == (Decimal(2), "trillion")


def test_dotted_thousands_still_read_as_a_count():
    assert _reread_number("217.889 مبايعة", reading(217889, unit="transaction")) == (
        Decimal(217889),
        "one",
        0,
    )


def test_a_spoken_number_is_used_when_it_agrees():
    value, scale, _ = _reread_number("خمسة ملايين زائر", reading(5, "million", "visitor"))
    assert (value, scale) == (Decimal(5), "million")


def test_the_models_extra_digits_win_when_codes_reading_allows_them():
    assert _reread_number("61 ألفاً و578 معاملة", reading(61578, unit="transaction")) == (
        Decimal(61578),
        "one",
        0,
    )


def test_digits_the_model_adds_are_ignored():
    assert _reread_number("بلغ 5.1 مليون زائر", reading(5.14, "million", "visitor")) == (
        Decimal("5.1"),
        "million",
        1,
    )
