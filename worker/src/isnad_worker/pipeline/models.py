"""Structured outputs the models return. Field descriptions double as instructions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

GEOGRAPHIES = [
    "UAE",
    "Abu Dhabi",
    "Dubai",
    "Sharjah",
    "Ajman",
    "Umm Al Quwain",
    "Ras Al Khaimah",
    "Fujairah",
    "GCC",
    "World",
    "Other",
]

Geography = Literal[
    "UAE",
    "Abu Dhabi",
    "Dubai",
    "Sharjah",
    "Ajman",
    "Umm Al Quwain",
    "Ras Al Khaimah",
    "Fujairah",
    "GCC",
    "World",
    "Other",
]
Scale = Literal["one", "thousand", "million", "billion", "trillion"]
Qualifier = Literal["exact", "about", "more_than", "less_than", "at_least", "up_to"]
ClaimType = Literal["level", "growth", "share", "rank", "pp_change", "ratio"]


class ExtractedClaim(BaseModel):
    segment: int = Field(description="Index of the segment the claim is in (the [n] marker).")
    span: str = Field(
        description="The exact words from the segment, copied character for character: the number with its "
        "scale and unit and the words saying what it measures. Never paraphrase or translate."
    )
    checkable: bool = Field(
        description="True for a factual statistic that an official source could confirm. False for forecasts, "
        "targets, plans, opinions, personal anecdotes, or numbers that are only dates or identifiers."
    )
    not_checkable_reason: (
        Literal["forecast", "target", "opinion", "anecdote", "not_statistic", "unclear"] | None
    )
    indicator: str = Field(
        description="What is measured, in the content's language (e.g. 'عدد الزوار الدوليين')."
    )
    indicator_slug: str | None = Field(
        description="Catalog indicator slug if one matches, else null."
    )
    entity: str | None = Field(
        description="The official body the number is about or attributed to, if stated."
    )
    entity_slug: str | None = Field(description="Catalog entity slug if one matches, else null.")
    claim_type: ClaimType = Field(
        description="level = the quantity itself; growth = a % change of it; share = a % of a total; "
        "rank = a position; pp_change = change in percentage points; ratio = per-capita or similar."
    )
    value: float = Field(
        description="The number as stated, without its scale word (5.1 for '5.1 million')."
    )
    scale: Scale
    decimals: int = Field(
        description="Digits after the decimal point as stated (0 for '12%', 1 for '5.1')."
    )
    unit: str = Field(
        description="'%' for percentages; ISO currency (AED, USD) for money; otherwise the counted thing in "
        "English singular (visitor, person, passenger, company, room, ...)."
    )
    qualifier: Qualifier = Field(
        description="'about' for نحو/حوالي/قرابة, 'more_than' for أكثر من, etc."
    )
    period_text: str | None = Field(
        description="The period as stated ('هذا العام', 'الربع الثالث'), or null."
    )
    period_start: str | None = Field(
        description="Resolved start date YYYY-MM-DD using the recording date, or null."
    )
    period_end: str | None = Field(description="Resolved end date YYYY-MM-DD, or null.")
    geography: Geography = Field(
        description="Where the number applies. Default UAE when unstated and national."
    )
    breakdown: str | None = Field(
        description="A sub-group if the number is not the total, in the content's language "
        "(e.g. 'الزوار من الصين', 'Emirati women')."
    )
    attribution: str | None = Field(
        description="Who the content says the number comes from ('وفق مركز الإحصاء', 'according to WAM', "
        "'مصادر مطلعة'), verbatim, or null if unattributed."
    )
    speaker: str | None = Field(description="Who says it in a transcript, if known.")


class Extraction(BaseModel):
    claims: list[ExtractedClaim]


class VerifierResult(BaseModel):
    agrees: bool = Field(
        description="True if the verdict and the differing fields are right for this evidence."
    )
    issue: Literal[
        "none", "indicator", "entity", "scope", "period", "unit", "value", "measure", "other"
    ]
    note_ar: str = Field(
        description="One short sentence in Arabic for the editor, explaining any concern."
    )
    note_en: str = Field(description="The same note in English.")
    confidence: Literal["high", "medium", "low"]


class WordingResult(BaseModel):
    wording: str = Field(
        description="The corrected sentence in the content's language, with attribution."
    )


class DocumentReading(BaseModel):
    found: bool
    title: str | None = Field(description="The document's title as printed.")
    published_at: str | None = Field(description="YYYY-MM-DD if the document gives it.")
    quote: str | None = Field(
        description="Verbatim sentence or table row from the document containing the number."
    )
    value: float | None
    scale: Scale | None
    decimals: int | None
    unit: str | None
    period_start: str | None
    period_end: str | None
    period_label: str | None
    geography: Geography | None
    measure: (
        Literal["level", "growth_yoy", "growth_qoq", "growth", "share", "rank", "change"] | None
    )
    page: int | None = Field(description="The [Page n] the quote is on, for PDFs.")
    notes: str | None
