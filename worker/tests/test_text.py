from decimal import Decimal

import pytest

from isnad_worker.text import (
    contains_verbatim,
    find_numbers,
    find_span,
    format_number,
    normalize,
    normalize_for_match,
    parse_spoken_number,
)


def test_normalize_matches_sql_rules():
    assert (
        normalize("إجمالي الزوّار ١٢٫٥٪ و١٬٢٣٤ في الـــربع") == "اجمالي الزوار 12.5% و1,234 في الربع"
    )
    assert normalize("مؤسَّسة ى") == "مؤسسه ي"
    assert normalize("Total Visitors") == "total visitors"


def test_verbatim_tolerates_typography():
    doc = "بلغ إجمالي عدد الزوار الدوليين «5.0 مليون» زائر خلال الفترة من يناير إلى سبتمبر"
    assert contains_verbatim(doc, 'بلغ اجمالي عدد الزوار الدوليين "5.0 مليون"')
    assert contains_verbatim(doc, "٥٫٠ مليون")
    assert not contains_verbatim(doc, "5.1 مليون")
    assert not contains_verbatim(doc, "")


def test_find_span_maps_back_to_original_offsets():
    text = "وقال الوزير: استقبلنا خمسة ملايين زائرٍ هذا العام."
    start, end = find_span(text, "استقبلنا خمسة ملايين زائر")
    assert text[start:end].startswith("استقبلنا")
    assert find_span(text, "غير موجود") is None


@pytest.mark.parametrize(
    "text, value, scale, decimals, percent",
    [
        ("ارتفع بنسبة ١٢٪ في الربع الثالث", "12", "one", 0, True),
        ("واستقبلنا 5 ملايين زائر", "5", "million", 0, False),
        ("بلغت ٣٤٫٢ مليار درهم", "34.2", "billion", 1, False),
        ("نحو 41 ألف شركة", "41", "thousand", 0, False),
        ("متوسط 12,400 درهم", "12400", "one", 0, False),
        ("نمو 2.8 بالمئة", "2.8", "one", 1, True),
        ("1.7M visitors", "1.7", "million", 1, False),
        ("بنسبة 12 في المئة", "12", "one", 0, True),
    ],
)
def test_find_numbers(text, value, scale, decimals, percent):
    found = find_numbers(text)[0]
    assert found.value == Decimal(value)
    assert found.scale == scale
    assert found.decimals == decimals
    assert found.is_percent is percent
    assert found.text in text


def test_find_numbers_base_value():
    assert find_numbers("5.1 مليون")[0].base_value == Decimal(5100000)


def test_find_numbers_decimal_comma():
    assert find_numbers("5,1 مليون")[0].value == Decimal("5.1")


@pytest.mark.parametrize(
    "phrase, expected",
    [
        ("خمسة ملايين", "5000000"),
        ("اثنا عشر بالمئة", "12"),
        ("ثلاثة عشر", "13"),
        ("مئة وعشرين", "120"),
        ("ثلاثمائة", "300"),
        ("عشرة آلاف", "10000"),
        ("ثلاثة ملايين وخمسمائة ألف", "3500000"),
        ("خمسة فاصلة واحد مليون", "5100000"),
        ("مليونين", "2000000"),
        ("زائر", None),
    ],
)
def test_parse_spoken_number(phrase, expected):
    result = parse_spoken_number(phrase)
    assert result == (Decimal(expected) if expected else None)


def test_format_number():
    assert format_number(Decimal(12400)) == "12,400"
    assert format_number(Decimal("5.0"), 1) == "5.0"


def test_normalize_for_match_collapses_space():
    assert normalize_for_match("  بلغ   النمو\n12٪ ") == "بلغ النمو 12%"


def test_parse_srt_cues():
    from isnad_worker.pipeline.media import parse_srt

    srt = (
        "1\n00:00:01,000 --> 00:00:04,500\n<i>استقبلت دبي 19.59 مليون زائر</i>\n\n"
        "2\n00:00:05,000 --> 00:00:08,250\nخلال عام 2025\nبنمو 5%\n"
    )
    cues = parse_srt(srt)
    assert cues == [
        {"start_ms": 1000, "end_ms": 4500, "text": "استقبلت دبي 19.59 مليون زائر"},
        {"start_ms": 5000, "end_ms": 8250, "text": "خلال عام 2025 بنمو 5%"},
    ]


def test_period_labels_and_units():
    from datetime import date

    from isnad_worker.text import normalize_unit, period_label

    assert period_label(date(2025, 1, 1), date(2025, 12, 31)) == "2025"
    assert period_label(date(2025, 1, 1), date(2025, 6, 30)) == "النصف الأول 2025"
    assert period_label(date(2025, 7, 1), date(2025, 9, 30), arabic=False) == "Q3 2025"
    assert period_label(date(2025, 1, 1), date(2025, 8, 31), arabic=False) == "January–August 2025"
    assert normalize_unit("percent") == "%"
    assert normalize_unit("passengers (guests)") == "passenger"
    assert normalize_unit("Dirhams") == "AED"


def test_dotted_thousands_for_counts():
    from isnad_worker.pipeline.extract import _dotted_thousands
    from isnad_worker.text import find_numbers

    rooms = find_numbers("ارتفع عدد الغرف إلى 216.966 غرفة")[0]
    assert _dotted_thousands(rooms, "room")
    assert not _dotted_thousands(rooms, "%")
    money = find_numbers("بلغت 216.966 مليار درهم")[0]
    assert not _dotted_thousands(money, "AED")
    share = find_numbers("بنسبة 2.125")[0]
    assert _dotted_thousands(share, "room") and not _dotted_thousands(share, "AED")
