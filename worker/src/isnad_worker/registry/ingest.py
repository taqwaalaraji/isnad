"""Reading official documents into registry figures (the `ingest_document` job).

The model proposes figures; code reads spreadsheet values from their cells, checks every quote and
number against the stored document, and only then saves them. Verified figures with a catalog
indicator can be approved automatically (seeding); everything else waits for curator review.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from datetime import date
from decimal import Decimal

from isnad_worker import db, jobs, storage
from isnad_worker.ai import gateway
from isnad_worker.pipeline import catalog as catalog_mod
from isnad_worker.pipeline.evidence import repair_quote, verify_against_document
from isnad_worker.registry import revisions, store
from isnad_worker.registry.models import ExtractedFigure, FigureExtraction
from isnad_worker.text import SCALES, normalize, normalize_unit, period_label

log = logging.getLogger("isnad.ingest")

MAX_PDF_PAGES_PER_CALL = 20
MAX_PDF_PAGES = 40
# Request bodies are limited; image-heavy page batches above this are sent as text instead.
MAX_PDF_BATCH_BYTES = 18 * 1024 * 1024
MAX_CHARS_PER_CALL = 90_000
# A batch where fewer of the cheap model's figures verify than this is reread by the stronger model.
ESCALATE_BELOW = 0.5

Verifier = Callable[[ExtractedFigure], bool]


def _system() -> str:
    return gateway.prompt("extract_figures").replace(
        "{indicators}", catalog_mod.load().indicators_text
    )


def _page_relevance(text: str, terms: list[str]) -> float:
    norm = normalize(text)
    digits = len(re.findall(r"\d", norm))
    hits = sum(1 for t in terms if t and t in norm)
    return hits * 5 + min(digits, 400) / 40


def _relevance_terms() -> list[str]:
    cat = catalog_mod.load()
    return sorted(
        {
            normalize(w)
            for i in cat.indicators.values()
            for w in [i["name_ar"], i["name_en"], *i["aliases"][:3]]
            if len(w) > 3
        }
    )


def pdf_batches(page_texts: list[str], terms: list[str] | None = None) -> list[list[int]]:
    """The pages worth reading (1-based), in document order, grouped into model calls.

    Short documents are read whole. Long ones keep their most relevant pages (indicator names,
    many digits) up to MAX_PDF_PAGES, skipping pages with no figures at all (covers, photos).
    """
    pages = list(range(1, len(page_texts) + 1))
    if len(page_texts) > MAX_PDF_PAGES_PER_CALL:
        terms = _relevance_terms() if terms is None else terms
        scores = {p: _page_relevance(page_texts[p - 1], terms) for p in pages}
        ranked = sorted((p for p in pages if scores[p] > 0), key=lambda p: -scores[p])
        pages = sorted(ranked[:MAX_PDF_PAGES])
    return [
        pages[i : i + MAX_PDF_PAGES_PER_CALL] for i in range(0, len(pages), MAX_PDF_PAGES_PER_CALL)
    ]


def _pdf_subset(data: bytes, pages: list[int]) -> bytes:
    import pymupdf

    with pymupdf.open(stream=data, filetype="pdf") as src:
        src.select([p - 1 for p in pages])
        return src.tobytes(garbage=3, deflate=True)


def _header(meta: dict) -> str:
    return (
        f"Source: {meta['source_name_en']} ({meta['source_name_ar']})\n"
        f"Document: {meta['title']}\n"
        f"Published: {meta.get('published_at') or 'unknown'}\n"
    )


def _ask(
    content: list | str, ctx: gateway.CallContext, verified: Verifier
) -> list[ExtractedFigure]:
    """Figures from one batch. When most of the cheap model's figures fail the document check
    (or its answer doesn't parse), the stronger model rereads this batch only."""

    def read(escalate: bool) -> list[ExtractedFigure]:
        return gateway.parse(
            "extract_figures",
            system=_system(),
            messages=[{"role": "user", "content": content}],
            output=FigureExtraction,
            ctx=ctx,
            max_tokens=32000,
            escalate=escalate,
        ).figures

    escalate = gateway.can_escalate("extract_figures")
    try:
        figures = read(False)
    except gateway.ModelOutputError as exc:
        if not escalate:
            raise
        log.info("figure extraction answer rejected (%s); asking the stronger model", exc)
        return read(True)
    if not escalate or not figures:
        return figures
    good = sum(1 for f in figures if verified(f))
    if good >= ESCALATE_BELOW * len(figures):
        return figures
    log.info(
        "%d of %d figures verified; rereading the batch with the stronger model", good, len(figures)
    )
    try:
        better = read(True)
    except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
        log.warning("stronger model unavailable: %s", exc)
        return figures
    return better if sum(1 for f in better if verified(f)) > good else figures


def _extract_pdf(
    data: bytes, page_texts: list[str], meta: dict, ctx: gateway.CallContext, verified: Verifier
) -> list[ExtractedFigure]:
    figures: list[ExtractedFigure] = []
    whole = len(page_texts)
    for pages in pdf_batches(page_texts):
        chunk = data if pages == list(range(1, whole + 1)) else _pdf_subset(data, pages)
        mapping = ", ".join(f"{i}→{p}" for i, p in enumerate(pages, start=1))
        if len(chunk) > MAX_PDF_BATCH_BYTES:
            # Too heavy to attach (scanned or image-rich pages): read the extracted text instead.
            text = "\n\n".join(f"[Page {p}]\n{page_texts[p - 1]}" for p in pages)
            figures.extend(_extract_text(text, meta, ctx, verified, label="Document text by page"))
            continue
        note = (
            _header(meta)
            + f"The attached PDF holds pages of a {whole}-page document. Report page numbers of the "
            f"original document using this mapping (attached page → original page): {mapping}."
        )
        figures.extend(_ask([gateway.pdf(chunk), note], ctx, verified))
    return figures


def _extract_text(
    text: str, meta: dict, ctx: gateway.CallContext, verified: Verifier, *, label: str
) -> list[ExtractedFigure]:
    figures: list[ExtractedFigure] = []
    for start in range(0, max(len(text), 1), MAX_CHARS_PER_CALL):
        chunk = text[start : start + MAX_CHARS_PER_CALL]
        if not chunk.strip():
            continue
        figures.extend(_ask(_header(meta) + f"\n{label}:\n\n{chunk}", ctx, verified))
    return figures


def _sheet(tables: list[dict], sheet: str | None) -> dict | None:
    return next((t for t in tables if t.get("kind") == "sheet" and t.get("sheet") == sheet), None)


def _cell_value(tables: list[dict], sheet: str | None, cell: str | None) -> object | None:
    table = _sheet(tables, sheet)
    return (table.get("cells") or {}).get(cell or "") if table else None


# Figures keep their published precision; anything finer is float noise from the source file.
MAX_DECIMALS = 6


def published_value(value: Decimal, decimals: int) -> tuple[Decimal, int]:
    """The value rounded to its published precision (at most MAX_DECIMALS places)."""
    places = max(0, min(decimals, MAX_DECIMALS))
    return value.quantize(Decimal(10) ** -places) if places else value.to_integral_value(), places


def cell_figure(
    tables: list[dict], location: dict, value: Decimal, decimals: int, scale: str, unit: str
) -> tuple[Decimal, int]:
    """A spreadsheet figure's value and precision as its cell publishes them (code, not model)."""
    sheet = _sheet(tables, location.get("sheet")) or {}
    raw = (sheet.get("cells") or {}).get(location.get("cell") or "")
    if not isinstance(raw, (int, float)) or isinstance(raw, bool):
        return value, decimals
    cell = Decimal(str(raw))
    shown = (sheet.get("decimals") or {}).get(location.get("cell") or "")
    # Spreadsheets often store 5000000 under a "(million)" header: express the cell at the stated scale.
    if (
        normalize_unit(unit) != "%"
        and scale != "one"
        and abs(cell / SCALES[scale] - value) < abs(cell - value)
    ):
        cell = cell / SCALES[scale]
        shown = None  # rescaled: the stated precision applies, not the cell's
    return cell, (shown if shown is not None else decimals)


def _published(fig: ExtractedFigure, version: dict) -> tuple[Decimal, int, dict]:
    """The figure's value and precision as the document publishes them, and its location."""
    value = Decimal(str(fig.value))
    decimals = fig.decimals
    location = fig.location.model_dump(exclude_none=True)
    if fig.location.kind == "cell":
        value, decimals = cell_figure(
            version["tables"], location, value, decimals, fig.scale, fig.unit
        )
    value, decimals = published_value(value, decimals)
    return value, decimals, location


def is_verified(fig: ExtractedFigure, version: dict, page_texts: list[str] | None) -> bool:
    """Is the figure really in the stored document (its cell, or its quote with the value)?"""
    value, decimals, location = _published(fig, version)
    return verify_against_document(
        quote=fig.quote,
        value=value,
        decimals=decimals,
        location=location,
        text_content=version["text_content"],
        tables=version["tables"],
        page_texts=page_texts,
    )


def _save(
    fig: ExtractedFigure,
    version: dict,
    meta: dict,
    *,
    auto_approve: bool,
    page_texts: list[str] | None,
) -> str | None:
    cat = catalog_mod.load()
    indicator_id = cat.indicator_id(fig.indicator_slug)
    value, decimals, location = _published(fig, version)
    verified = is_verified(fig, version, page_texts)
    if not verified and fig.location.kind == "text":
        # The model may copy a sentence imperfectly; the document's own sentence then stands in.
        repaired = repair_quote(fig.quote, version["text_content"], value, decimals)
        fixed = fig.model_copy(update={"quote": repaired}) if repaired else None
        if fixed and is_verified(fixed, version, page_texts):
            fig, verified = fixed, True
    try:
        period_start, period_end = (
            date.fromisoformat(fig.period_start),
            date.fromisoformat(fig.period_end),
        )
    except ValueError:
        return None
    if period_end < period_start:
        return None
    unit = normalize_unit(fig.unit)
    base = (value if unit == "%" else value * SCALES.get(fig.scale, Decimal(1))).normalize()
    status = "approved" if (auto_approve and verified and indicator_id) else "pending"
    note = None
    if fig.proposed_indicator and not indicator_id:
        p = fig.proposed_indicator
        note = f"proposed indicator: {p.name_ar} / {p.name_en} ({p.unit}, {p.topic})"
    row = db.fetch_one(
        """
        insert into public.figures
          (document_version_id, document_id, source_id, newsroom_id, indicator_id, entity_id, value, scale, decimals,
           value_base, unit, period_start, period_end, period_label, geography, breakdown, measure, status, location,
           quote, quote_verified, review_status, review_note, published_at, reviewed_at)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                case when %s = 'approved' then now() end)
        returning id
        """,
        (
            version["id"],
            version["document_id"],
            meta["source_id"],
            meta["newsroom_id"],
            indicator_id,
            meta["entity_id"],
            value,
            fig.scale,
            decimals,
            base,
            unit,
            period_start,
            period_end,
            period_label(period_start, period_end) or fig.period_label,
            fig.geography,
            fig.breakdown,
            fig.measure,
            fig.status,
            db.json(location),
            fig.quote,
            verified,
            status,
            note,
            meta.get("published_at"),
            status,
        ),
    )
    return str(row["id"]) if row and status == "approved" else (None if not row else "")


def ingest(version_id: str, *, auto_approve: bool = False) -> int:
    version = db.fetch_one("select * from public.document_versions where id = %s", (version_id,))
    if not version:
        raise jobs.PermanentError("document version not found")
    meta = db.fetch_one(
        """
        select d.id as document_id, d.title, d.kind, d.url, d.published_at, d.newsroom_id,
               s.id as source_id, s.name_ar as source_name_ar, s.name_en as source_name_en, s.entity_id
        from public.documents d join public.sources s on s.id = d.source_id
        where d.id = %s
        """,
        (version["document_id"],),
    )
    db.execute(
        "update public.document_versions set extraction_status = 'extracting', extraction_error = null where id = %s",
        (version_id,),
    )
    data = storage.download(storage.DOCUMENTS, version["storage_path"])
    kind = meta["kind"]
    if version["storage_path"].endswith(".xls"):
        kind = "xls"
    elif version["storage_path"].endswith(".csv"):
        kind = "csv"
    # Always re-read: improvements to the readers (PDF order, page cleanup) apply on re-ingest.
    store.apply_text(version_id, kind, data)
    version = db.fetch_one("select * from public.document_versions where id = %s", (version_id,))

    ctx = gateway.CallContext(newsroom_id=str(meta["newsroom_id"]) if meta["newsroom_id"] else None)
    page_texts = next(
        (t.get("pages") for t in version["tables"] if t.get("kind") == "pdf_pages"), None
    )

    def verified(fig: ExtractedFigure) -> bool:
        return is_verified(fig, version, page_texts)

    if kind == "pdf":
        figures = _extract_pdf(data, page_texts or [], meta, ctx, verified)
    elif kind in ("xlsx", "xls", "csv"):
        figures = _extract_text(
            version["text_content"] or "",
            meta,
            ctx,
            verified,
            label="Spreadsheet cells (sheet headings start with ##; each cell is REF=value)",
        )
    else:
        figures = _extract_text(
            version["text_content"] or "", meta, ctx, verified, label="Document text"
        )

    db.execute(
        "delete from public.figures where document_version_id = %s and review_status = 'pending'",
        (version_id,),
    )
    approved: list[str] = []
    saved = 0
    seen: set[tuple] = set()
    for fig in figures:
        key = (
            fig.indicator_slug,
            fig.measure,
            fig.geography,
            fig.breakdown,
            fig.period_start,
            fig.period_end,
            fig.value,
        )
        if key in seen:
            continue
        seen.add(key)
        figure_id = _save(fig, version, meta, auto_approve=auto_approve, page_texts=page_texts)
        if figure_id is None:
            continue
        saved += 1
        if figure_id:
            approved.append(figure_id)
    db.execute(
        """
        update public.document_versions set extraction_status = 'extracted', figures_count = %s where id = %s
        """,
        (saved, version_id),
    )
    db.execute(
        "update public.sources set last_fetched_at = now(), health = 'healthy', health_note = null where id = %s",
        (meta["source_id"],),
    )
    for figure_id in approved:
        revisions.link(figure_id)
    log.info("ingested %s: %d figures (%d approved)", meta["title"], saved, len(approved))
    return saved


def reverify(version_id: str, *, auto_approve: bool = False) -> tuple[int, int]:
    """Re-read a stored version's text and re-check its figures, without asking the model again.

    Used after the text reading or the evidence check improves. Figures that now verify are
    marked verified, and approved when `auto_approve` is set and they have a catalog indicator.
    Returns (figures checked, figures newly verified).
    """
    version = db.fetch_one("select * from public.document_versions where id = %s", (version_id,))
    if not version:
        raise jobs.PermanentError("document version not found")
    kind = db.fetch_one(
        "select kind from public.documents where id = %s", (version["document_id"],)
    )["kind"]
    data = storage.download(storage.DOCUMENTS, version["storage_path"])
    store.apply_text(version_id, "xls" if version["storage_path"].endswith(".xls") else kind, data)
    version = db.fetch_one("select * from public.document_versions where id = %s", (version_id,))
    page_texts = next(
        (t.get("pages") for t in version["tables"] or [] if t.get("kind") == "pdf_pages"), None
    )
    figures = db.fetch_all(
        """
        select id, quote, value, decimals, scale, unit, location, quote_verified, review_status,
               indicator_id
        from public.figures where document_version_id = %s
        """,
        (version_id,),
    )
    newly = 0
    approved: list[str] = []
    for fig in figures:
        location = fig["location"] or {}
        if location.get("kind") == "cell":
            value, decimals = published_value(
                *cell_figure(
                    version["tables"],
                    location,
                    Decimal(fig["value"]),
                    fig["decimals"],
                    fig["scale"],
                    fig["unit"],
                )
            )
            if value != Decimal(fig["value"]) or decimals != fig["decimals"]:
                base = value if fig["unit"] == "%" else value * SCALES.get(fig["scale"], Decimal(1))
                db.execute(
                    "update public.figures set value = %s, decimals = %s, value_base = %s where id = %s",
                    (value, decimals, base.normalize(), fig["id"]),
                )
                fig = {**fig, "value": value, "decimals": decimals}
        verified = verify_against_document(
            quote=fig["quote"],
            value=Decimal(fig["value"]),
            decimals=fig["decimals"],
            location=fig["location"] or {},
            text_content=version["text_content"],
            tables=version["tables"],
            page_texts=page_texts,
        )
        if verified == fig["quote_verified"]:
            continue
        approve = (
            verified
            and auto_approve
            and fig["indicator_id"] is not None
            and fig["review_status"] == "pending"
        )
        db.execute(
            """
            update public.figures
            set quote_verified = %s,
                review_status = case when %s then 'approved'::public.review_status else review_status end,
                reviewed_at = case when %s then now() else reviewed_at end
            where id = %s
            """,
            (verified, approve, approve, fig["id"]),
        )
        newly += 1 if verified else 0
        if approve:
            approved.append(str(fig["id"]))
    for figure_id in approved:
        revisions.link(figure_id)
    return len(figures), newly


@jobs.handler("ingest_document")
def ingest_document(job: jobs.Job) -> None:
    version_id = job.payload["version_id"]
    try:
        ingest(version_id, auto_approve=bool(job.payload.get("auto_approve")))
    except jobs.PermanentError as exc:
        db.execute(
            "update public.document_versions set extraction_status = 'failed', extraction_error = %s where id = %s",
            (str(exc)[:1000], version_id),
        )
        raise
    except Exception as exc:
        if job.attempts >= job.max_attempts:
            db.execute(
                "update public.document_versions set extraction_status = 'failed', extraction_error = %s where id = %s",
                (f"{type(exc).__name__}: {exc}"[:1000], version_id),
            )
        raise
