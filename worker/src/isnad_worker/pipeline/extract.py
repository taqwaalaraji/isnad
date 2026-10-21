"""Claim extraction: the model reads the segments into structured claims; code anchors and checks them."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from isnad_worker.ai import gateway
from isnad_worker.pipeline import catalog as catalog_mod
from isnad_worker.pipeline.models import ExtractedClaim, Extraction
from isnad_worker.text import (
    SCALES,
    ParsedNumber,
    find_numbers,
    find_span,
    has_number,
    normalize,
    normalize_unit,
    parse_spoken_number,
    western_digits,
)

log = logging.getLogger("isnad.extract")

BATCH_SEGMENTS = 60


@dataclass
class SegmentInput:
    id: str
    idx: int
    text: str
    start_ms: int | None
    end_ms: int | None
    words: list[dict] | None
    speaker: str | None
    page: int | None


@dataclass
class Claim:
    """A claim ready to store: anchored to its segment, with the number re-read by code."""

    segment: SegmentInput
    span_text: str
    span_start: int
    span_end: int
    start_ms: int | None
    end_ms: int | None
    extracted: ExtractedClaim
    value: Decimal
    scale: str
    decimals: int
    indicator_id: str | None
    entity_id: str | None
    period_start: date | None
    period_end: date | None


def _clock(ms: int | None) -> str:
    if ms is None:
        return ""
    s = ms // 1000
    return f"({s // 60:02d}:{s % 60:02d}) "


def _render(segments: list[SegmentInput]) -> str:
    lines = []
    for s in segments:
        location = (
            _clock(s.start_ms) if s.start_ms is not None else (f"(p.{s.page}) " if s.page else "")
        )
        speaker = f"{s.speaker}: " if s.speaker else ""
        lines.append(f"[{s.idx}] {location}{speaker}{s.text}")
    return "\n".join(lines)


def _system_prompt() -> str:
    cat = catalog_mod.load()
    return (
        gateway.prompt("extract_claims")
        .replace("{indicators}", cat.indicators_text)
        .replace("{entities}", cat.entities_text)
    )


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


_DOTTED_THOUSANDS = re.compile(r"\d{1,3}\.\d{3}")


def _dotted_thousands(number: ParsedNumber, unit: str) -> bool:
    """Many Arabic outlets write 216.966 for 216,966. For a count with no scale word, three
    digits after the point can only be a thousands separator (there are no fractional rooms)."""
    return (
        not number.is_percent
        and number.scale == "one"
        and normalize_unit(unit) not in ("%", "AED", "USD")
        and bool(_DOTTED_THOUSANDS.fullmatch(western_digits(number.text).strip()))
    )


def _agrees(value: Decimal, base: Decimal, model_value: Decimal, model_base: Decimal) -> bool:
    """Is a number read from the span the one the model meant? The same digits (code's scale then
    wins, or 216.966 written for 216,966), or the same amount within a factor of two (a misread
    digit). A year next to a spoken amount ("اثنين تريليون ... 2026") is neither."""
    if value in (model_value, model_value / 1000):
        return True
    return model_base != 0 and Decimal("0.5") <= base / model_base <= Decimal(2)


def _reread_number(span: str, model: ExtractedClaim) -> tuple[Decimal, str, int]:
    """The number as code reads it from the span; the model's reading is only a fallback."""
    model_value = Decimal(str(model.value))
    model_mult = Decimal(1) if model.unit == "%" else SCALES.get(model.scale, Decimal(1))
    model_base = model_value * model_mult
    numbers = [
        n
        for n in find_numbers(span)
        if _agrees(n.value, n.value if n.is_percent else n.base_value, model_value, model_base)
    ]
    if numbers:
        best = min(
            numbers,
            key=lambda n: abs((n.value if n.is_percent else n.base_value) - model_base),
        )
        if _dotted_thousands(best, model.unit):
            return best.value * 1000, "one", 0
        scale = "one" if best.is_percent else best.scale
        best_base = best.value if best.is_percent else best.base_value
        rest = model_base - best_base
        if rest > 0 and any(n.base_value == rest for n in find_numbers(span) if not n.is_percent):
            # A compound number: "61 ألفاً و578" is 61,000 + 578, which code reads as two numbers.
            return model_value, model.scale, model.decimals
        return best.value, scale, best.decimals
    spoken = parse_spoken_number(span)
    if spoken and _agrees(spoken / model_mult, spoken, model_value, model_base):
        # Spoken numbers come back in base units; express them at the model's scale when it divides evenly.
        value = spoken / model_mult
        decimals = (
            max(0, -value.normalize().as_tuple().exponent) if value != value.to_integral() else 0
        )
        return (
            value.normalize() if decimals else value.to_integral(),
            model.scale if model.unit != "%" else "one",
            decimals,
        )
    return model_value, model.scale, model.decimals


def _timing(segment: SegmentInput, span_start: int) -> tuple[int | None, int | None]:
    if segment.start_ms is None:
        return None, None
    words = segment.words or []
    if words:
        # Word texts joined with spaces approximate the segment text; find the word at the span's start.
        position = 0
        target = len(normalize(segment.text[:span_start]))
        for word in words:
            position += len(normalize(word.get("text", ""))) + 1
            if position > target:
                return word.get("start_ms"), word.get("end_ms")
        return words[-1].get("start_ms"), words[-1].get("end_ms")
    duration = (segment.end_ms or segment.start_ms) - segment.start_ms
    ratio = span_start / max(1, len(segment.text))
    start = segment.start_ms + int(duration * ratio)
    return start, min(segment.end_ms or start, start + 2500)


LEAD_SEGMENTS = 2


def select_segments(segments: list[SegmentInput]) -> list[SegmentInput]:
    """The segments worth reading: those with a number, the one before each (what is measured is
    often said just before the number) and the opening lines (where an article names the authority,
    the emirate and the period). The rest can't hold a claim."""
    keep: set[int] = set()
    for i, s in enumerate(segments):
        if has_number(s.text):
            keep.update((i - 1, i) if i else (i,))
    if keep:
        keep.update(range(min(LEAD_SEGMENTS, len(segments))))
    return [segments[i] for i in sorted(keep)]


def _statistics(text: str) -> list[ParsedNumber]:
    """Numbers that look like statistics (not years or small counts): every one should become a claim."""
    return [
        n
        for n in find_numbers(text)
        if n.is_percent
        or n.scale != "one"
        or n.decimals
        or (n.value >= 1000 and not (1900 <= n.value <= 2100))
    ]


def _content(
    batch: list[SegmentInput], *, recorded_at: date, title: str, kind: str, speakers: str | None
) -> str:
    return (
        f"Recording or publication date: {recorded_at.isoformat()}\n"
        f"Content type: {kind}\n"
        f"Title: {title}\n"
        + (f"Speakers: {speakers}\n" if speakers else "")
        + "\nSegments:\n"
        + _render(batch)
    )


def _anchor(
    items: list[ExtractedClaim], batch: list[SegmentInput], cat: catalog_mod.Catalog
) -> tuple[list[Claim], set[int]]:
    """Claims whose span is really in the content; and the segments where a span wasn't."""
    by_idx = {s.idx: s for s in batch}
    claims: list[Claim] = []
    unanchored: set[int] = set()
    for item in items:
        segment = by_idx.get(item.segment)
        located = find_span(segment.text, item.span) if segment else None
        if located is None:
            # The span must exist verbatim; try the other segments in the batch before dropping it.
            for other in batch:
                located = find_span(other.text, item.span)
                if located:
                    segment = other
                    break
        if located is None or segment is None:
            log.info("claim span isn't in the content: %r", item.span)
            if item.segment in by_idx:
                unanchored.add(item.segment)
            continue
        span_start, span_end = located
        span_text = segment.text[span_start:span_end]
        value, scale, decimals = _reread_number(span_text, item)
        start_ms, end_ms = _timing(segment, span_start)
        indicator_id = cat.indicator_id(item.indicator_slug) or catalog_mod.match_indicator(
            item.indicator
        )
        entity_id = cat.entity_id(item.entity_slug) or catalog_mod.match_entity(item.entity)
        period_start, period_end = _parse_date(item.period_start), _parse_date(item.period_end)
        if period_start and period_end and period_end < period_start:
            period_start, period_end = period_end, period_start
        if bool(period_start) != bool(period_end):
            period_start = period_end = None
        claims.append(
            Claim(
                segment=segment,
                span_text=span_text,
                span_start=span_start,
                span_end=span_end,
                start_ms=start_ms,
                end_ms=end_ms,
                extracted=item,
                value=value,
                scale=scale,
                decimals=decimals,
                indicator_id=indicator_id,
                entity_id=entity_id,
                period_start=period_start,
                period_end=period_end,
            )
        )
    return claims, unanchored


def _missed(batch: list[SegmentInput], claims: list[Claim]) -> set[int]:
    """Segments with a statistic-looking number that no claim covers."""
    covered: dict[int, list[tuple[int, int]]] = {}
    for c in claims:
        covered.setdefault(c.segment.idx, []).append((c.span_start, c.span_end))
    return {
        s.idx
        for s in batch
        for n in _statistics(s.text)
        if not any(a < n.end and n.start < b for a, b in covered.get(s.idx, []))
    }


def _ask(content: str, system: str, ctx: gateway.CallContext, *, escalate: bool) -> Extraction:
    return gateway.parse(
        "extract_claims",
        system=system,
        messages=[{"role": "user", "content": content}],
        output=Extraction,
        ctx=ctx,
        max_tokens=16000,
        escalate=escalate,
    )


def extract(
    segments: list[SegmentInput],
    *,
    recorded_at: date,
    title: str,
    kind: str,
    speakers: str | None,
    ctx: gateway.CallContext,
) -> list[Claim]:
    """Claims in the segments. The cheap model reads every segment with a number; the stronger
    one rereads only the segments where code finds a problem (a span that isn't in the text, a
    statistic left out, or an answer that didn't parse)."""
    system = _system_prompt()
    cat = catalog_mod.load()
    meta = {"recorded_at": recorded_at, "title": title, "kind": kind, "speakers": speakers}
    escalate = gateway.can_escalate("extract_claims")
    selected = select_segments(segments)
    claims: list[Claim] = []

    for start in range(0, len(selected), BATCH_SEGMENTS):
        batch = selected[start : start + BATCH_SEGMENTS]
        try:
            result = _ask(_content(batch, **meta), system, ctx, escalate=False)
        except gateway.ModelOutputError as exc:
            if not escalate:
                raise
            log.info("extraction answer rejected (%s); asking the stronger model", exc)
            found, _ = _anchor(
                _ask(_content(batch, **meta), system, ctx, escalate=True).claims, batch, cat
            )
            claims += found
            continue
        found, unanchored = _anchor(result.claims, batch, cat)
        suspect = unanchored | _missed(batch, found)
        if suspect and escalate:
            reread = [s for s in batch if s.idx in suspect]
            log.info("rereading %d of %d segments with the stronger model", len(reread), len(batch))
            try:
                better, _ = _anchor(
                    _ask(_content(reread, **meta), system, ctx, escalate=True).claims, reread, cat
                )
            except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
                log.warning("stronger model unavailable for the reread: %s", exc)
                better = []
            # The reread replaces the cheap claims of the segments it found claims in.
            replaced = {c.segment.idx for c in better}
            found = [c for c in found if c.segment.idx not in replaced] + better
        claims += found

    # Stable order: by position in the content.
    claims.sort(key=lambda c: (c.segment.idx, c.span_start))
    return claims
