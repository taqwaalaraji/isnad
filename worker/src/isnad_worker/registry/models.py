from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from isnad_worker.pipeline.models import Geography, Scale


class FigureLocation(BaseModel):
    kind: Literal["cell", "table", "text"]
    sheet: str | None
    cell: str | None
    page: int | None
    row: str | None
    column: str | None


class ProposedIndicator(BaseModel):
    name_ar: str
    name_en: str
    unit_kind: Literal[
        "count",
        "currency",
        "percent",
        "ratio",
        "index",
        "rate",
        "duration",
        "area",
        "volume",
        "weight",
        "energy",
        "other",
    ]
    unit: str
    topic: str


class ExtractedFigure(BaseModel):
    indicator_slug: str | None
    proposed_indicator: ProposedIndicator | None
    value_as_printed: str
    value: float
    scale: Scale
    decimals: int
    unit: str
    measure: Literal["level", "growth_yoy", "growth_qoq", "growth", "share", "rank", "change"]
    period_start: str = Field(description="YYYY-MM-DD")
    period_end: str = Field(description="YYYY-MM-DD")
    period_label: str
    geography: Geography
    breakdown: str | None
    status: Literal["preliminary", "final", "revised"]
    location: FigureLocation
    quote: str


class FigureExtraction(BaseModel):
    figures: list[ExtractedFigure]
