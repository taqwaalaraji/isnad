"""Registry lookup and the code-level evidence check (the non-negotiable layer).

A figure counts as evidence only if its quote (or table cell) is found in our stored copy of the
official document. Anything that fails this check is not shown as evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from isnad_worker import db
from isnad_worker.pipeline.compare import FigureNumber
from isnad_worker.text import (
    contains_in_pdf_page,
    contains_verbatim,
    find_numbers,
    normalize,
    normalize_for_match,
)


@dataclass
class Candidate:
    number: FigureNumber
    row: dict  # figure joined with document, version and source details


FIGURE_SELECT = """
    select f.id, f.indicator_id, f.entity_id, f.value, f.value_base, f.scale, f.decimals, f.unit, f.measure,
           f.period_start, f.period_end, f.period_label, f.geography, f.breakdown, f.status, f.location,
           f.quote, f.quote_verified, f.is_current, f.supersedes_id, f.published_at, f.review_status,
           f.document_version_id, f.document_id, f.source_id,
           s.tier, s.name_ar as source_name_ar, s.name_en as source_name_en, s.slug as source_slug,
           d.title as document_title, d.url as document_url, d.kind as document_kind,
           v.fetched_at, v.version, v.storage_path,
           i.name_ar as indicator_name_ar, i.name_en as indicator_name_en, i.unit as indicator_unit,
           e.name_ar as entity_name_ar, e.name_en as entity_name_en,
           pe.name_ar as publisher_name_ar, pe.name_en as publisher_name_en
    from public.figures f
    join public.sources s on s.id = f.source_id
    left join public.entities pe on pe.id = s.entity_id
    join public.documents d on d.id = f.document_id
    join public.document_versions v on v.id = f.document_version_id
    left join public.indicators i on i.id = f.indicator_id
    left join public.entities e on e.id = f.entity_id
"""


def _number(row: dict) -> FigureNumber:
    return FigureNumber(
        id=str(row["id"]),
        value=Decimal(row["value"]),
        value_base=Decimal(row["value_base"]),
        scale=row["scale"],
        decimals=row["decimals"],
        unit=row["unit"],
        measure=row["measure"],
        period_start=row["period_start"],
        period_end=row["period_end"],
        geography=row["geography"],
        breakdown=row["breakdown"],
        is_current=row["is_current"],
        tier=row["tier"],
    )


def candidates(
    indicator_id: str | None, newsroom_id: str, *, include_ids: list[str] | None = None
) -> list[Candidate]:
    """Approved figures for an indicator (shared registry plus the newsroom's private sources)."""
    if not indicator_id and not include_ids:
        return []
    rows = db.fetch_all(
        FIGURE_SELECT
        + """
        where (
            (f.indicator_id = %(indicator)s and f.review_status = 'approved')
            or f.id = any(%(include)s::uuid[])
        )
          and (f.newsroom_id is null or f.newsroom_id = %(newsroom)s)
        order by f.period_end desc, s.tier
        limit 200
        """,
        {"indicator": indicator_id, "newsroom": newsroom_id, "include": include_ids or []},
    )
    return [Candidate(_number(r), r) for r in rows]


def figure_row(figure_id: str) -> dict | None:
    return db.fetch_one(FIGURE_SELECT + " where f.id = %s", (figure_id,))


def earlier_figures(row: dict) -> list[dict]:
    """Superseded figures for the same indicator, period and scope: the revision history."""
    return db.fetch_all(
        """
        select f.id, f.value, f.scale, f.decimals, f.unit, f.period_label, f.status, v.fetched_at,
               d.title as document_title
        from public.figures f
        join public.document_versions v on v.id = f.document_version_id
        join public.documents d on d.id = f.document_id
        where f.indicator_id = %s and f.geography = %s and f.measure = %s
          and f.period_start = %s and f.period_end = %s
          and coalesce(f.breakdown, '') = coalesce(%s, '')
          and f.id <> %s and f.review_status = 'approved'
        order by v.fetched_at desc
        limit 5
        """,
        (
            row["indicator_id"],
            row["geography"],
            row["measure"],
            row["period_start"],
            row["period_end"],
            row["breakdown"],
            row["id"],
        ),
    )


def _value_texts(value: Decimal, decimals: int) -> set[str]:
    """Ways the figure's number may be printed (12400, 12,400, 12.4)."""
    fixed = f"{value:.{decimals}f}"
    texts = {fixed, f"{value:,.{decimals}f}"}
    if decimals == 0:
        texts.add(str(int(value)))
    return {normalize_for_match(t) for t in texts}


def cell_matches(raw: object, value: Decimal, decimals: int) -> bool:
    """A spreadsheet cell holds the value, either at its stated scale or in base units."""
    try:
        cell = Decimal(str(raw))
    except ArithmeticError:
        return normalize_for_match(str(raw)) in _value_texts(value, decimals)
    half = Decimal("0.5") * Decimal(10) ** -decimals
    return any(
        abs(cell - value * m) <= half * m
        for m in (Decimal(1), Decimal(10) ** 3, Decimal(10) ** 6, Decimal(10) ** 9)
    )


_SENTENCE = re.compile(r"(?<=[.!?؟])\s+|\n+")
# Share of the model's quote words a document sentence must contain to stand in for it.
REPAIR_OVERLAP = 0.7


def repair_quote(quote: str, text: str | None, value: Decimal, decimals: int) -> str | None:
    """The document's own sentence for a quote the model copied imperfectly (a skipped word, a
    letter changed): one that holds the value and most of the quote's words. Taken from our copy,
    it is verbatim by construction; the overlap keeps an unrelated sentence with the same number out."""
    if not quote or not text:
        return None
    words = set(normalize(quote).split())
    if len(words) < 4:
        return None
    half = Decimal("0.5") * Decimal(10) ** -decimals
    best, best_overlap = None, REPAIR_OVERLAP
    for sentence in _SENTENCE.split(text):
        sentence = sentence.strip()
        if not any(abs(n.value - value) <= half for n in find_numbers(sentence)):
            continue
        overlap = len(words & set(normalize(sentence).split())) / len(words)
        if overlap >= best_overlap:
            best, best_overlap = sentence, overlap
    return best


def verify_against_document(
    *,
    quote: str,
    value: Decimal,
    decimals: int,
    location: dict,
    text_content: str | None,
    tables: list | None,
    page_texts: list[str] | None = None,
) -> bool:
    """Does the stored document really contain this figure?

    - Excel/CSV cells: the referenced cell holds the value.
    - Text: the quote appears verbatim and contains the value.
    - PDF tables: the value (and the row label, when given) appear on the referenced page.
    """
    kind = location.get("kind", "text")
    if kind == "cell" and tables:
        sheet, cell = location.get("sheet"), location.get("cell")
        for table in tables:
            if table.get("sheet") == sheet:
                raw = (table.get("cells") or {}).get(cell)
                if raw is None:
                    return False
                return cell_matches(raw, value, decimals)
        return False

    if not text_content:
        return False
    pages = _pages_near(page_texts, location.get("page"))
    if kind == "table":
        haystack = pages[0] if location.get("page") and pages else text_content
        norm = normalize_for_match(haystack)
        if not any(v in norm for v in _value_texts(value, decimals)):
            return False
        row_label = location.get("row")
        return (
            not row_label
            or normalize_for_match(row_label) in norm
            or contains_verbatim(text_content, row_label)
            # Table labels are short; the value on the same page carries most of the evidence.
            or any(contains_in_pdf_page(p, row_label, min_length=2) for p in pages)
        )

    found = contains_verbatim(text_content, quote) or any(
        contains_in_pdf_page(p, quote) for p in pages
    )
    if not found:
        return False
    return any(
        abs(n.value - value) <= Decimal("0.5") * Decimal(10) ** -decimals
        for n in find_numbers(quote)
    )


def _pages_near(page_texts: list[str] | None, page: int | None) -> list[str]:
    """The referenced PDF page first, then its neighbours (quotes can run over a page break)."""
    if not page_texts:
        return []
    if not page or not 0 < page <= len(page_texts):
        return list(page_texts)
    order = [page, page - 1, page + 1]
    return [page_texts[p - 1] for p in order if 0 < p <= len(page_texts)]


def check_evidence(row: dict) -> bool:
    """Re-run the evidence check for a registry figure against its stored document version."""
    version = db.fetch_one(
        "select text_content, tables from public.document_versions where id = %s",
        (row["document_version_id"],),
    )
    if not version:
        return False
    location = row.get("location") or {}
    page_texts = next(
        (t.get("pages") for t in version["tables"] or [] if t.get("kind") == "pdf_pages"), None
    )
    return verify_against_document(
        quote=row["quote"],
        value=Decimal(row["value"]),
        decimals=row["decimals"],
        location=location,
        text_content=version["text_content"],
        tables=version["tables"],
        page_texts=page_texts,
    )


def is_recent(period_end: date, today: date | None = None) -> bool:
    today = today or date.today()
    return (today - period_end).days < 400
