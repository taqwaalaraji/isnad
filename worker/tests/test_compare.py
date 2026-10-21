from datetime import date
from decimal import Decimal

from isnad_worker.pipeline.compare import ClaimNumber, FigureNumber, decide, tolerance

Q3_2025 = (date(2025, 7, 1), date(2025, 9, 30))
JAN_SEP_2025 = (date(2025, 1, 1), date(2025, 9, 30))
YEAR_2025 = (date(2025, 1, 1), date(2025, 12, 31))


def claim(
    value,
    scale="one",
    decimals=0,
    unit="count",
    qualifier="exact",
    claim_type="level",
    period=Q3_2025,
    geography="UAE",
    breakdown=None,
):
    start, end = period if period else (None, None)
    return ClaimNumber(
        Decimal(str(value)),
        scale,
        decimals,
        unit,
        qualifier,
        claim_type,
        start,
        end,
        geography,
        breakdown,
    )


def figure(
    value,
    scale="one",
    decimals=0,
    unit="count",
    measure="level",
    period=Q3_2025,
    geography="UAE",
    fid="f1",
    is_current=True,
    tier=1,
    breakdown=None,
):
    mult = {"one": 1, "thousand": 10**3, "million": 10**6, "billion": 10**9}[scale]
    v = Decimal(str(value))
    base = v if unit == "%" else v * mult
    return FigureNumber(
        fid,
        v,
        base,
        scale,
        decimals,
        unit,
        measure,
        period[0],
        period[1],
        geography,
        breakdown,
        is_current,
        tier,
    )


def test_growth_rounded_matches():
    d = decide(
        claim(12, unit="%", claim_type="growth"),
        [figure(12.1, decimals=1, unit="%", measure="growth_yoy")],
    )
    assert d.verdict == "match"


def test_this_year_vs_nine_months_is_context():
    d = decide(
        claim(5, "million", period=YEAR_2025, unit="visitor"),
        [figure(5.0, "million", 1, "visitor", period=JAN_SEP_2025)],
    )
    assert d.verdict == "context"
    assert d.differing_fields == ["period"]


def test_wrong_value_same_period_differs():
    d = decide(claim(40, "billion", unit="AED"), [figure(34.2, "billion", 1, "AED")])
    assert d.verdict == "differs"
    assert d.differing_fields == ["value"]
    assert d.comparison.difference_pct == 17.0


def test_no_figures_is_none():
    assert decide(claim(5, "million"), []).verdict == "none"


def test_measure_mismatch_is_none():
    d = decide(claim(12, unit="%", claim_type="growth"), [figure(1.1, "million", 1)])
    assert d.verdict == "none"


def test_unspecified_period_uses_latest():
    figures = [
        figure(
            10.68, "million", 2, "person", period=(date(2024, 1, 1), date(2024, 12, 31)), fid="2024"
        ),
        figure(
            9.5, "million", 1, "person", period=(date(2023, 1, 1), date(2023, 12, 31)), fid="2023"
        ),
    ]
    d = decide(claim(10.7, "million", 1, "person", period=None), figures)
    assert d.verdict == "match"
    assert d.comparison.figure.id == "2024"


def test_unspecified_period_with_an_earlier_periods_number_is_context():
    figures = [
        figure(
            79.3, decimals=1, unit="%", period=(date(2025, 1, 1), date(2025, 12, 31)), fid="2025"
        ),
        figure(
            79.5, decimals=1, unit="%", period=(date(2024, 1, 1), date(2024, 12, 31)), fid="2024"
        ),
    ]
    d = decide(claim(79.5, decimals=1, unit="%", period=None), figures)
    assert (d.verdict, d.differing_fields, d.comparison.figure.id) == (
        "context",
        ["period"],
        "2024",
    )
    # A number no period of the series has is still a difference from the latest.
    assert decide(claim(85, unit="%", period=None), figures).verdict == "differs"


def test_more_than_bounds():
    assert (
        decide(claim(5, "million", qualifier="more_than"), [figure(5.1, "million", 1)]).verdict
        == "match"
    )
    assert (
        decide(claim(5, "million", qualifier="more_than"), [figure(4.9, "million", 1)]).verdict
        == "differs"
    )


def test_about_widens_tolerance():
    c = claim(5, "million", qualifier="about")
    lo, hi = tolerance(c, figure(5.12, "million", 2))
    assert lo <= Decimal(5120000) <= hi
    assert decide(c, [figure(5.12, "million", 2)]).verdict == "match"
    # "about 5 million" already covers 4.5–5.5 by rounding; 5.6 is outside.
    assert decide(c, [figure(5.6, "million", 1)]).verdict == "differs"


def test_scope_difference_is_context():
    d = decide(claim(5, "million", geography="Dubai"), [figure(5.0, "million", 1, geography="UAE")])
    assert d.verdict == "context"
    assert "scope" in d.differing_fields


def test_precise_claim_against_rounded_figure():
    # "5.04 million" is consistent with an official "5 million" (rounded to the unit).
    assert decide(claim(5.04, "million", 2), [figure(5, "million", 0)]).verdict == "match"


def test_prefers_current_over_superseded():
    figures = [
        figure(5.0, "million", 1, fid="old", is_current=False),
        figure(5.1, "million", 1, fid="new"),
    ]
    d = decide(claim(5.1, "million", 1), figures)
    assert d.verdict == "match"
    assert d.comparison.figure.id == "new"


def test_disjoint_period_and_wrong_value_is_none_with_context():
    d = decide(
        claim(7, "million", period=YEAR_2025),
        [figure(5.0, "million", 1, period=(date(2024, 1, 1), date(2024, 12, 31)))],
    )
    assert d.verdict == "none"
    assert d.comparison is not None


# ── units, points in time, precision ─────────────────────────────────────────


def test_usd_conversion_is_context_not_none():
    # 49.21 bn AED reported as "13.4 bn USD" (at the 3.6725 peg): right number, different unit.
    official = figure(49.21, "billion", 2, unit="AED", period=YEAR_2025)
    d = decide(claim(13.4, "billion", 1, unit="USD", period=YEAR_2025), [official])
    assert d.verdict == "context"
    assert d.differing_fields == ["unit"]
    wrong = decide(claim(15, "billion", 0, unit="USD", period=YEAR_2025), [official])
    assert wrong.verdict == "none"


def test_end_of_year_point_matches_the_year_figure():
    end_2025 = (date(2025, 12, 31), date(2025, 12, 31))
    official = figure(5.3, "billion", 1, unit="AED", period=YEAR_2025)
    d = decide(claim(5.3, "billion", 1, unit="AED", period=end_2025), [official])
    assert d.verdict == "match"


def test_most_precise_publication_decides():
    year_2024 = (date(2024, 1, 1), date(2024, 12, 31))
    summary = figure(761, "billion", 0, unit="AED", period=year_2024, fid="summary")
    report = figure(
        760.99, "billion", 2, unit="AED", period=year_2024, fid="report", is_current=False
    )
    d = decide(claim(760.73, "billion", 2, unit="AED", period=year_2024), [summary, report])
    assert d.verdict == "differs"
    assert d.comparison.figure.id == "report"
    ok = decide(claim(761, "billion", 0, unit="AED", period=year_2024), [summary, report])
    assert ok.verdict == "match"


def test_superseded_value_is_context():
    old = figure(3789860, period=YEAR_2025, fid="old", is_current=False)
    new = figure(3847585, period=YEAR_2025, fid="new")
    d = decide(claim(3789860, period=YEAR_2025), [new, old])
    assert d.verdict == "context"
    assert d.comparison.figure.id == "old"


def test_right_number_for_another_period_is_still_context():
    h1 = figure(46, "million", 0, period=(date(2025, 1, 1), date(2025, 6, 30)), fid="h1")
    year = figure(95.2, "million", 1, period=YEAR_2025, fid="year")
    d = decide(claim(95.2, "million", 1, period=(date(2025, 1, 1), date(2025, 6, 30))), [h1, year])
    assert d.verdict == "context"
    assert d.comparison.figure.id == "year"


def test_disagreeing_official_sources_can_each_confirm():
    wam = figure(3.8, "billion", 1, unit="AED", period=YEAR_2025, fid="wam", tier=3)
    outlook = figure(3568, "million", 0, unit="AED", period=YEAR_2025, fid="moet", tier=2)
    d = decide(claim(3.8, "billion", 1, unit="AED", period=YEAR_2025), [outlook, wam])
    assert d.verdict == "match"
    assert d.comparison.figure.id == "wam"


def test_more_than_is_bounded():
    year = (date(2025, 1, 1), date(2025, 12, 31))
    official = figure(917, "billion", 0, unit="AED", period=year)
    d = decide(
        claim(682.49, "billion", 2, unit="AED", qualifier="more_than", period=year), [official]
    )
    assert d.verdict == "differs"
    close = figure(700, "billion", 0, unit="AED", period=year)
    assert (
        decide(
            claim(682.49, "billion", 2, unit="AED", qualifier="more_than", period=year), [close]
        ).verdict
        == "match"
    )
    under = figure(4.6, "million", 1, period=year)
    assert (
        decide(claim(5, "million", qualifier="less_than", period=year), [under]).verdict == "match"
    )
    assert (
        decide(
            claim(5, "million", qualifier="less_than", period=year),
            [figure(2, "million", 0, period=year)],
        ).verdict
        == "differs"
    )


def test_breakdowns_match_across_languages():
    from isnad_worker.pipeline.compare import same_breakdown

    assert same_breakdown("China", "الصين")
    assert same_breakdown("Chinese visitors", "الزوار من الصين")
    assert same_breakdown("Emiratis", "المواطنين")
    assert same_breakdown("Emirati women", "المواطنات")
    assert same_breakdown("الزوار من أوروبا", "أوروبا")
    assert not same_breakdown("المواطنين", "غير المواطنين")
    assert not same_breakdown("India", "الصين")
    assert not same_breakdown(None, "الصين")  # a total isn't a sub-group
    assert not same_breakdown("القطاع الخاص", "القطاع الخاص غير النفطي")


def test_a_trade_partner_named_in_english_matches_the_arabic_figure():
    c = claim(181, scale="billion", unit="AED", period=None, breakdown="China")
    f = figure(180.7, scale="billion", decimals=1, unit="AED", breakdown="الصين")
    assert decide(c, [f]).verdict == "match"
