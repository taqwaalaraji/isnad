"""Fixed rules that turn a claim and candidate figures into a verdict. No model involved.

The verdicts:
- match:   value within tolerance, same period, scope and unit
- context: value within tolerance, but the period, scope or unit differs
- differs: value outside tolerance for the same period and scope
- none:    no official figure for this claim
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Literal

from isnad_worker.text import SCALES, normalize

PeriodRelation = Literal["equal", "wider", "narrower", "overlap", "disjoint", "unspecified"]
ScopeRelation = Literal["same", "different"]
Verdict = Literal["match", "context", "differs", "none"]

ABOUT_TOLERANCE = Decimal("0.03")  # "نحو" / "about" widens the margin to ±3%
QUALIFIER_REACH = Decimal("0.10")  # "أكثر من" / "أقل من": within 10% of the stated number
# The dirham is pegged to the US dollar, so an outlet's conversion can be checked exactly.
AED_PER_USD = Decimal("3.6725")

CLAIM_TO_MEASURES = {
    "level": {"level"},
    "growth": {"growth_yoy", "growth_qoq", "growth"},
    "share": {"share"},
    "rank": {"rank"},
    "pp_change": {"change"},
    "ratio": {"level"},
}


@dataclass(frozen=True)
class ClaimNumber:
    value: Decimal
    scale: str
    decimals: int
    unit: str
    qualifier: str
    claim_type: str
    period_start: date | None
    period_end: date | None
    geography: str
    breakdown: str | None = None

    @property
    def base(self) -> Decimal:
        return self.value * (Decimal(1) if self.unit == "%" else SCALES.get(self.scale, Decimal(1)))


@dataclass(frozen=True)
class FigureNumber:
    id: str
    value: Decimal
    value_base: Decimal
    scale: str
    decimals: int
    unit: str
    measure: str
    period_start: date
    period_end: date
    geography: str
    breakdown: str | None = None
    is_current: bool = True
    tier: int = 1


@dataclass
class Comparison:
    figure: FigureNumber
    value_ok: bool
    period: PeriodRelation
    scope: ScopeRelation
    unit_ok: bool
    difference_pct: float | None
    tolerance: tuple[str, str]
    differing_fields: list[str] = field(default_factory=list)

    @property
    def same_frame(self) -> bool:
        """Same period (or a claim with no period), same scope, same unit."""
        return self.period in ("equal", "unspecified") and self.scope == "same" and self.unit_ok


@dataclass
class Decision:
    verdict: Verdict
    comparison: Comparison | None
    differing_fields: list[str]


def _half_unit(decimals: int, multiplier: Decimal) -> Decimal:
    return Decimal("0.5") * (Decimal(10) ** -decimals) * multiplier


def tolerance(claim: ClaimNumber, figure: FigureNumber) -> tuple[Decimal, Decimal]:
    """The range of official values consistent with how the claim (and the figure) were rounded."""
    claim_mult = Decimal(1) if claim.unit == "%" else SCALES.get(claim.scale, Decimal(1))
    figure_mult = Decimal(1) if figure.unit == "%" else SCALES.get(figure.scale, Decimal(1))
    half = max(_half_unit(claim.decimals, claim_mult), _half_unit(figure.decimals, figure_mult))
    base = claim.base
    if claim.qualifier == "about":
        half = max(half, abs(base) * ABOUT_TOLERANCE)
    lo, hi = base - half, base + half
    # "More than 5 million" means a little over 5 million: a much larger official value doesn't
    # support it (the claim is about something else, or understates it badly).
    reach = abs(base) * QUALIFIER_REACH + half
    if claim.qualifier in ("more_than", "at_least"):
        lo, hi = base - (half if claim.qualifier == "at_least" else 0), base + reach
    elif claim.qualifier in ("less_than", "up_to"):
        lo, hi = base - reach, base + (half if claim.qualifier == "up_to" else 0)
    return lo, hi


def period_relation(claim: ClaimNumber, figure: FigureNumber) -> PeriodRelation:
    if claim.period_start is None or claim.period_end is None:
        return "unspecified"
    cs, ce, fs, fe = claim.period_start, claim.period_end, figure.period_start, figure.period_end
    # Allow a few days of slack for month-end conventions.
    if abs((cs - fs).days) <= 3 and abs((ce - fe).days) <= 3:
        return "equal"
    # "By the end of 2025" (a single day) is the value the figure for 2025 reports at its end.
    if cs == ce and abs((ce - fe).days) <= 3:
        return "equal"
    if cs <= fs and ce >= fe:
        return "wider"
    if cs >= fs and ce <= fe:
        return "narrower"
    if cs <= fe and fs <= ce:
        return "overlap"
    return "disjoint"


def _unit_class(unit: str) -> str:
    u = (unit or "").strip().lower()
    if u in ("%", "percent", "pct"):
        return "%"
    if u in ("aed", "usd", "eur", "sar", "درهم", "دولار"):
        return {"درهم": "aed", "دولار": "usd"}.get(u, u)
    return "count"


def _in_claim_currency(claim: ClaimNumber, figure: FigureNumber) -> Decimal:
    """The figure's base value in the claim's currency when one is AED and the other USD."""
    pair = (_unit_class(claim.unit), _unit_class(figure.unit))
    if pair == ("usd", "aed"):
        return figure.value_base / AED_PER_USD
    if pair == ("aed", "usd"):
        return figure.value_base * AED_PER_USD
    return figure.value_base


# Sub-groups that official figures break totals into, in the ways claims and documents name them
# (claims may name them in English, documents in Arabic). Spellings are matched after
# normalization, so one form per word is enough.
BREAKDOWN_GROUPS: dict[str, tuple[str, ...]] = {
    "china": ("china", "chinese", "الصين", "الصيني", "الصينيين", "الصينيه"),
    "india": ("india", "indian", "الهند", "الهندي", "الهنود", "الهنديه"),
    "saudi": ("saudi", "saudi arabia", "السعوديه", "السعودي", "السعوديين"),
    "uk": (
        "uk",
        "united kingdom",
        "britain",
        "british",
        "المملكه المتحده",
        "بريطانيا",
        "البريطاني",
        "البريطانيين",
    ),
    "usa": (
        "usa",
        "us",
        "united states",
        "american",
        "الولايات المتحده",
        "امريكا",
        "الامريكي",
        "الامريكيين",
    ),
    "russia": ("russia", "russian", "روسيا", "الروسي", "الروس"),
    "switzerland": ("switzerland", "swiss", "سويسرا", "السويسري"),
    "iraq": ("iraq", "iraqi", "العراق", "العراقي"),
    "turkey": ("turkey", "turkiye", "turkish", "تركيا", "التركي"),
    "japan": ("japan", "japanese", "اليابان", "الياباني"),
    "germany": ("germany", "german", "المانيا", "الالماني"),
    "france": ("france", "french", "فرنسا", "الفرنسي"),
    "pakistan": ("pakistan", "pakistani", "باكستان", "الباكستاني"),
    "egypt": ("egypt", "egyptian", "مصر", "المصري", "المصريين"),
    "iran": ("iran", "iranian", "ايران", "الايراني"),
    "oman": ("oman", "omani", "عمان", "العماني"),
    "kuwait": ("kuwait", "kuwaiti", "الكويت", "الكويتي"),
    "qatar": ("qatar", "qatari", "قطر", "القطري"),
    "bahrain": ("bahrain", "bahraini", "البحرين", "البحريني"),
    "gcc": ("gcc", "gulf", "الخليج", "الخليجي", "الخليجيين", "دول مجلس التعاون"),
    "europe": ("europe", "european", "اوروبا", "الاوروبي", "الاوروبيين"),
    "citizens": (
        "citizens",
        "nationals",
        "emiratis",
        "emirati",
        "مواطنين",
        "المواطنين",
        "المواطنون",
        "المواطنات",
        "الاماراتيين",
        "الاماراتي",
    ),
    "men": ("men", "male", "males", "ذكور", "الذكور", "الرجال"),
    "women": ("women", "female", "females", "اناث", "الاناث", "النساء", "المواطنات"),
}
_NEGATIONS = {"غير", "non", "excluding", "except", "باستثناء", "عدا"}
_PUNCT = str.maketrans({c: " " for c in ".,،؛;:()[]«»\"'-/"})


def _breakdown_words(text: str | None) -> str:
    return " ".join(normalize(text or "").lower().translate(_PUNCT).split())


def _groups(words: str) -> set[str]:
    padded = f" {words} "
    return {
        key
        for key, names in BREAKDOWN_GROUPS.items()
        if any(f" {_breakdown_words(n)} " in padded for n in names)
    }


def same_breakdown(claim: str | None, figure: str | None) -> bool:
    """Do two breakdowns name the same sub-group, whatever their language or wording?
    "China" and «الصين» do; «المواطنين» and «غير المواطنين» don't; a total and a sub-group don't."""
    a, b = _breakdown_words(claim), _breakdown_words(figure)
    if a == b:
        return True
    if not a or not b:
        return False
    ta, tb = set(a.split()), set(b.split())
    if any(t in _NEGATIONS or t.startswith("non") for t in ta) != any(
        t in _NEGATIONS or t.startswith("non") for t in tb
    ):
        return False
    ga, gb = _groups(a), _groups(b)
    if ga or gb:
        return ga == gb
    shorter, longer = sorted((ta, tb), key=len)
    return shorter <= longer


def compare(claim: ClaimNumber, figure: FigureNumber) -> Comparison:
    lo, hi = tolerance(claim, figure)
    # A converted value is still a different unit (context), but its number can be checked.
    official = _in_claim_currency(claim, figure)
    value_ok = lo <= official <= hi
    period = period_relation(claim, figure)
    scope: ScopeRelation = (
        "same"
        if claim.geography == figure.geography and same_breakdown(claim.breakdown, figure.breakdown)
        else "different"
    )
    unit_ok = _unit_class(claim.unit) == _unit_class(figure.unit)
    diff_pct = None
    if official != 0:
        diff_pct = float(round((claim.base - official) / abs(official) * 100, 1))

    fields: list[str] = []
    if not value_ok:
        fields.append("value")
    if period not in ("equal", "unspecified"):
        fields.append("period")
    if scope != "same":
        fields.append("scope")
    if not unit_ok:
        fields.append("unit")
    return Comparison(
        figure, value_ok, period, scope, unit_ok, diff_pct, (str(lo), str(hi)), fields
    )


def _period_distance(claim: ClaimNumber, figure: FigureNumber) -> int:
    if claim.period_end is None:
        return 0
    return abs((claim.period_end - figure.period_end).days) + abs(
        ((claim.period_start or claim.period_end) - figure.period_start).days
    )


def _figure_half_unit(figure: FigureNumber) -> Decimal:
    multiplier = Decimal(1) if figure.unit == "%" else SCALES.get(figure.scale, Decimal(1))
    return _half_unit(figure.decimals, multiplier)


def _consistent(a: FigureNumber, b: FigureNumber) -> bool:
    """Two publications of the same value (they agree within the coarser rounding)."""
    return abs(a.value_base - b.value_base) <= max(_figure_half_unit(a), _figure_half_unit(b))


def _most_precise(chosen: Comparison, exact: list[Comparison]) -> Comparison:
    same_value = [c for c in exact if _consistent(c.figure, chosen.figure)]
    return min(same_value, key=lambda c: (_figure_half_unit(c.figure), c.figure.tier))


def decide(claim: ClaimNumber, figures: list[FigureNumber]) -> Decision:
    """Pick the most relevant figure and apply the verdict rules."""
    allowed = CLAIM_TO_MEASURES.get(claim.claim_type, {"level"})
    candidates = [f for f in figures if f.measure in allowed]
    if not candidates:
        return Decision("none", None, [])

    comparisons = [compare(claim, f) for f in candidates]
    unspecified = claim.period_start is None

    def rank(c: Comparison) -> tuple:
        # Prefer: current figures, same scope, nearest period, the most authoritative tier, latest period.
        return (
            not c.figure.is_current,
            c.scope != "same",
            _period_distance(claim, c.figure) if not unspecified else 0,
            c.figure.tier,
            -c.figure.period_end.toordinal(),
        )

    comparisons.sort(key=rank)

    # A claim without a period is read against the latest current figure for its scope.
    if unspecified:
        same_scope = [c for c in comparisons if c.scope == "same" and c.figure.is_current]
        if same_scope:
            latest = max(same_scope, key=lambda c: c.figure.period_end)
            if latest.value_ok and latest.unit_ok:
                return Decision("match", latest, [])
            # The number is the official figure for an earlier period: the claim gives no period,
            # so it most likely cites that one as if it were current. Right number, other period.
            earlier = [c for c in same_scope if c.value_ok and c.unit_ok]
            if earlier:
                best = max(earlier, key=lambda c: c.figure.period_end)
                return Decision("context", best, ["period"])
            if latest.unit_ok:
                return Decision("differs", latest, latest.differing_fields)

    exact = [c for c in comparisons if c.same_frame]
    # The same value can be published at several precisions (761 bn in a summary, 760.99 bn in
    # the annual report): a figure confirms the claim only if its most precise publication does.
    # Separate current figures that disagree (two official sources) can each confirm it.
    for c in exact:
        if c.value_ok and c.figure.is_current:
            precise = _most_precise(c, exact)
            if precise.value_ok:
                return Decision("match", precise, [])

    # The value matches a figure for another period, scope or unit, or a superseded figure:
    # right number, different context. A coarse copy of a more precise figure doesn't count.
    near = [
        c
        for c in comparisons
        if c.value_ok and not (c.same_frame and not _most_precise(c, exact).value_ok)
    ]
    if near:
        best = near[0]
        return Decision("context", best, best.differing_fields)

    if exact:
        decisive = _most_precise(exact[0], exact)
        return Decision("differs", decisive, decisive.differing_fields)

    # No official figure for the claim's own period and scope, and no figure the value matches:
    # nothing confirms or contradicts it. Report the closest figure for the editor's context.
    return Decision("none", comparisons[0], comparisons[0].differing_fields)
