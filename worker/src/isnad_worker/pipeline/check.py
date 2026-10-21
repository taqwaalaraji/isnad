"""The check pipeline: prepare → transcribe → extract → (per claim) evidence → compare → verify → word.

Runs as the `process_check` job. Modes:
- full:    everything from the uploaded input
- recheck: keep the transcript and claims, recompute results against today's registry
- segment: a transcript segment was corrected; re-extract and re-check that segment only
"""

from __future__ import annotations

import logging
import tempfile
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

from google.genai import errors as genai_errors

from isnad_worker import db, jobs, storage
from isnad_worker.ai import gateway
from isnad_worker.config import settings
from isnad_worker.pipeline import (
    compare,
    content,
    discovery,
    evidence,
    extract,
    media,
    review,
    transcribe,
)
from isnad_worker.pipeline.compare import ClaimNumber
from isnad_worker.text import format_number, period_label

log = logging.getLogger("isnad.check")

CLAIM_WORKERS = 4


class CheckError(jobs.PermanentError):
    """A failure the user can act on; `code` maps to a localized message in the web app."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


class Cancelled(Exception):
    """The check was archived (cancelled) while it was processing."""


@dataclass
class CheckRow:
    id: str
    newsroom_id: str
    created_by: str | None
    title: str
    input_kind: str
    input_text: str | None
    input_url: str | None
    storage_path: str | None
    original_filename: str | None
    recorded_at: date
    speakers: str | None
    dialect: str
    channel: str


# ─── progress ─────────────────────────────────────────────────────────────────


def _set_stage(check_id: str, stage: str, **progress: object) -> None:
    updated = db.execute(
        """
        update public.checks
        set stage = %s, progress = progress || %s
        where id = %s and status = 'processing'
        """,
        (stage, db.json({f"{stage}_started_at": time.time(), **progress}), check_id),
    )
    if not updated:
        raise Cancelled(check_id)


def _progress(check_id: str, **values: object) -> None:
    db.execute(
        "update public.checks set progress = progress || %s where id = %s",
        (db.json(values), check_id),
    )


# ─── preparing the input ──────────────────────────────────────────────────────


def _store_segments(check_id: str, segments: list[dict], *, replace: bool = True) -> None:
    with db.transaction() as conn:
        if replace:
            conn.execute("delete from public.claims where check_id = %s", (check_id,))
            conn.execute("delete from public.segments where check_id = %s", (check_id,))
        for i, s in enumerate(segments):
            conn.execute(
                """
                insert into public.segments (check_id, idx, start_ms, end_ms, speaker, text, words, page, low_confidence)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    check_id,
                    i,
                    s.get("start_ms"),
                    s.get("end_ms"),
                    s.get("speaker"),
                    s["text"],
                    db.json(s["words"]) if s.get("words") else None,
                    s.get("page"),
                    s.get("low_confidence", False),
                ),
            )


def _prepare_media(check: CheckRow, workdir: Path) -> list[dict]:
    if not check.storage_path:
        raise CheckError("file_missing")
    original = workdir / ("original" + Path(check.original_filename or "x.bin").suffix.lower())
    storage.download_to(storage.MEDIA, check.storage_path, original)
    info = media.probe(original)
    if info.duration_ms <= 0:
        raise CheckError("no_audio")
    if info.duration_ms > 2 * 60 * 60 * 1000:
        raise CheckError("too_long")
    base = check.storage_path.rsplit("/", 1)[0]
    audio = media.extract_audio(original, workdir / "audio.flac")
    if info.has_video:
        web = media.web_video(original, workdir / "web.mp4")
        poster = media.poster(
            original, workdir / "poster.jpg", min(5.0, info.duration_ms / 1000 / 4)
        )
        storage.upload_file(storage.MEDIA, f"{base}/web.mp4", web, "video/mp4")
        storage.upload_file(storage.MEDIA, f"{base}/poster.jpg", poster, "image/jpeg")
    else:
        web = media.web_audio(original, workdir / "web.m4a")
        storage.upload_file(storage.MEDIA, f"{base}/web.m4a", web, "audio/mp4")
    peaks = media.waveform(audio)
    db.execute(
        """
        insert into public.media (check_id, has_video, duration_ms, width, height, video_path, audio_path, poster_path, waveform)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (check_id) do update set
          has_video = excluded.has_video, duration_ms = excluded.duration_ms, width = excluded.width,
          height = excluded.height, video_path = excluded.video_path, audio_path = excluded.audio_path,
          poster_path = excluded.poster_path, waveform = excluded.waveform
        """,
        (
            check.id,
            info.has_video,
            info.duration_ms,
            info.width,
            info.height,
            f"{base}/web.mp4" if info.has_video else None,
            f"{base}/web.m4a" if not info.has_video else None,
            f"{base}/poster.jpg" if info.has_video else None,
            db.json(peaks),
        ),
    )
    _set_stage(check.id, "transcribing", duration_ms=info.duration_ms)
    started = time.monotonic()
    if info.has_captions:
        # The clip carries its own captions: use them instead of transcribing.
        cues = media.extract_captions(original)
        if cues:
            _progress(
                check.id,
                transcribed_ms=int((time.monotonic() - started) * 1000),
                transcript_source="captions",
            )
            return [{**c, "speaker": None, "words": None, "low_confidence": False} for c in cues]
    try:
        segments = transcribe.transcribe(
            audio,
            check_id=check.id,
            newsroom_id=check.newsroom_id,
            dialect=check.dialect,
            duration_ms=info.duration_ms,
        )
    except jobs.PermanentError as exc:
        raise CheckError("speech_unavailable", str(exc)) from exc
    except genai_errors.ClientError as exc:  # a rejected key or request; rate limits are retried
        if exc.code == 429:
            raise
        raise CheckError("speech_unavailable", str(exc)[:300]) from exc
    _progress(check.id, transcribed_ms=int((time.monotonic() - started) * 1000))
    if not segments:
        raise CheckError("no_speech")
    return [
        {
            "text": s.text,
            "start_ms": s.start_ms,
            "end_ms": s.end_ms,
            "speaker": s.speaker,
            "words": [
                {
                    "text": w.text,
                    "start_ms": w.start_ms,
                    "end_ms": w.end_ms,
                    "confidence": w.confidence,
                }
                for w in s.words
            ],
            "low_confidence": any(w.confidence is not None and w.confidence < 0.6 for w in s.words),
        }
        for s in segments
    ]


def _prepare_document(check: CheckRow, workdir: Path) -> list[dict]:
    if not check.storage_path:
        if check.input_text:
            return [{"text": p.text} for p in content.paragraphs_from_text(check.input_text)]
        raise CheckError("file_missing")
    suffix = Path(check.original_filename or check.storage_path).suffix.lower()
    path = workdir / f"document{suffix}"
    storage.download_to(storage.MEDIA, check.storage_path, path)
    if suffix == ".pdf":
        paragraphs = content.paragraphs_from_pdf(path)
    elif suffix == ".docx":
        paragraphs = content.paragraphs_from_docx(path)
    elif suffix in (".html", ".htm"):
        _, paragraphs = content.text_from_html(content.decode_html(path.read_bytes()))
    else:
        paragraphs = content.paragraphs_from_text(content.decode_html(path.read_bytes()))
    if not paragraphs:
        raise CheckError("no_text", "the document has no readable text layer")
    # Keep the text for search and for the Telegram summary.
    db.execute(
        "update public.checks set input_text = %s where id = %s",
        ("\n\n".join(p.text for p in paragraphs)[:500_000], check.id),
    )
    return [{"text": p.text, "page": p.page} for p in paragraphs]


def _prepare_link(check: CheckRow) -> list[dict]:
    url = check.input_url or ""
    host = url.lower()
    if any(
        v in host
        for v in ("youtube.com", "youtu.be", "tiktok.com", "instagram.com", "x.com/", "twitter.com")
    ):
        raise CheckError("link_video")
    try:
        dl = content.download(url)
    except jobs.PermanentError as exc:
        raise CheckError("link_failed", str(exc)) from exc
    kind = content.kind_for(dl.content_type, dl.url)
    if kind in ("html", "text"):
        title, paragraphs = content.text_from_html(content.decode_html(dl.content))
        if title and check.title.startswith("http"):
            db.execute("update public.checks set title = %s where id = %s", (title[:300], check.id))
    elif kind == "pdf":
        with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
            tmp.write(dl.content)
            tmp.flush()
            paragraphs = content.paragraphs_from_pdf(Path(tmp.name))
    elif kind == "docx":
        with tempfile.NamedTemporaryFile(suffix=".docx") as tmp:
            tmp.write(dl.content)
            tmp.flush()
            paragraphs = content.paragraphs_from_docx(Path(tmp.name))
    else:
        raise CheckError("link_unsupported")
    if not paragraphs:
        raise CheckError("no_text")
    db.execute(
        "update public.checks set input_text = %s where id = %s",
        ("\n\n".join(p.text for p in paragraphs)[:500_000], check.id),
    )
    return [{"text": p.text, "page": p.page} for p in paragraphs]


def _prepare(check: CheckRow) -> None:
    _set_stage(check.id, "preparing")
    with tempfile.TemporaryDirectory(prefix="isnad-") as tmp:
        workdir = Path(tmp)
        if check.input_kind in ("video", "audio"):
            segments = _prepare_media(check, workdir)
        elif check.input_kind == "document":
            segments = _prepare_document(check, workdir)
        elif check.input_kind == "link":
            segments = _prepare_link(check)
        else:
            segments = [
                {"text": p.text} for p in content.paragraphs_from_text(check.input_text or "")
            ]
    if not segments:
        raise CheckError("no_text")
    _store_segments(check.id, segments)


# ─── claims ───────────────────────────────────────────────────────────────────


def _segment_inputs(check_id: str, only: str | None = None) -> list[extract.SegmentInput]:
    rows = db.fetch_all(
        "select id, idx, text, start_ms, end_ms, words, speaker, page from public.segments where check_id = %s"
        + (" and id = %s" if only else "")
        + " order by idx",
        (check_id, only) if only else (check_id,),
    )
    return [
        extract.SegmentInput(
            str(r["id"]),
            r["idx"],
            r["text"],
            r["start_ms"],
            r["end_ms"],
            r["words"],
            r["speaker"],
            r["page"],
        )
        for r in rows
    ]


def _extract(check: CheckRow, ctx: gateway.CallContext, *, segment_id: str | None = None) -> None:
    _set_stage(check.id, "extracting")
    segments = _segment_inputs(check.id, segment_id)
    claims = extract.extract(
        segments,
        recorded_at=check.recorded_at,
        title=check.title,
        kind={"video": "video transcript", "audio": "audio transcript"}.get(
            check.input_kind, "article or statement"
        ),
        speakers=check.speakers,
        ctx=ctx,
    )
    with db.transaction() as conn:
        if segment_id:
            conn.execute(
                "delete from public.claims where check_id = %s and segment_id = %s",
                (check.id, segment_id),
            )
            next_idx = conn.execute(
                "select coalesce(max(idx) + 1, 0) as n from public.claims where check_id = %s",
                (check.id,),
            ).fetchone()["n"]
        else:
            conn.execute("delete from public.claims where check_id = %s", (check.id,))
            next_idx = 0
        for offset, c in enumerate(claims):
            x = c.extracted
            unit = x.unit
            mult = Decimal(1) if unit == "%" else compare.SCALES.get(c.scale, Decimal(1))
            conn.execute(
                """
                insert into public.claims
                  (check_id, idx, segment_id, span_text, span_start, span_end, start_ms, end_ms, speaker,
                   entity_text, entity_id, indicator_text, indicator_id, value, scale, unit, value_base, decimals,
                   qualifier, period_text, period_start, period_end, geography, breakdown, claim_type, attribution,
                   checkable, uncheckable_reason)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    check.id,
                    next_idx + offset,
                    c.segment.id,
                    c.span_text,
                    c.span_start,
                    c.span_end,
                    c.start_ms,
                    c.end_ms,
                    x.speaker or c.segment.speaker,
                    x.entity,
                    c.entity_id,
                    x.indicator,
                    c.indicator_id,
                    c.value,
                    c.scale,
                    unit,
                    c.value * mult,
                    c.decimals,
                    x.qualifier,
                    x.period_text,
                    c.period_start,
                    c.period_end,
                    x.geography,
                    x.breakdown,
                    x.claim_type,
                    x.attribution,
                    x.checkable,
                    x.not_checkable_reason,
                ),
            )
        # Keep claim order by position after a segment edit.
        conn.execute(
            """
            with ordered as (
              select c.id, row_number() over (order by s.idx, c.span_start) - 1 as n
              from public.claims c left join public.segments s on s.id = c.segment_id
              where c.check_id = %s
            )
            update public.claims c set idx = -1 - ordered.n from ordered where c.id = ordered.id
            """,
            (check.id,),
        )
        conn.execute("update public.claims set idx = -1 - idx where check_id = %s", (check.id,))


def _claim_rows(
    check_id: str, segment_id: str | None = None, claim_id: str | None = None
) -> list[dict]:
    query = """
        select c.*, s.text as segment_text, i.topic_id
        from public.claims c
        left join public.segments s on s.id = c.segment_id
        left join public.indicators i on i.id = c.indicator_id
        where c.check_id = %s and c.checkable
    """
    params: list = [check_id]
    if segment_id:
        query += " and c.segment_id = %s"
        params.append(segment_id)
    if claim_id:
        query += " and c.id = %s"
        params.append(claim_id)
    return db.fetch_all(query + " order by c.idx", params)


def _is_processing(check_id: str) -> bool:
    row = db.fetch_one("select status from public.checks where id = %s", (check_id,))
    return bool(row) and row["status"] == "processing"


def _evidence_json(row: dict) -> dict:
    value = Decimal(row["value"])
    return {
        "figure_id": str(row["id"]),
        "document_version_id": str(row["document_version_id"]),
        "document": {
            "id": str(row["document_id"]),
            "title": row["document_title"],
            "url": row["document_url"],
            "kind": row["document_kind"],
            "version": row["version"],
            "fetched_at": row["fetched_at"].isoformat() if row["fetched_at"] else None,
        },
        "source_name_ar": row["source_name_ar"],
        "source_name_en": row["source_name_en"],
        "source_slug": row["source_slug"],
        # The publishing body, for attribution ("according to ..."); the source is one of its outlets.
        "publisher_name_ar": row["publisher_name_ar"] or row["source_name_ar"],
        "publisher_name_en": row["publisher_name_en"] or row["source_name_en"],
        "tier": row["tier"],
        "quote": row["quote"],
        "location": row["location"],
        "value": str(value),
        "value_text": review.figure_text(value, row["scale"], row["decimals"], row["unit"]),
        "value_text_en": review.figure_text(
            value, row["scale"], row["decimals"], row["unit"], arabic=False
        ),
        "scale": row["scale"],
        "decimals": row["decimals"],
        "unit": row["unit"],
        "measure": row["measure"],
        "period_label": row["period_label"],
        "period_label_ar": period_label(row["period_start"], row["period_end"])
        or row["period_label"],
        "period_label_en": period_label(row["period_start"], row["period_end"], arabic=False)
        or row["period_label"],
        "period_start": row["period_start"].isoformat(),
        "period_end": row["period_end"].isoformat(),
        "geography": row["geography"],
        "breakdown": row["breakdown"],
        "status": row["status"],
        "indicator_name_ar": row["indicator_name_ar"],
        "indicator_name_en": row["indicator_name_en"],
        "entity_name_ar": row["entity_name_ar"],
        "entity_name_en": row["entity_name_en"],
        "review_status": row["review_status"],
    }


def _check_claim(
    claim: dict,
    check: CheckRow,
    ctx: gateway.CallContext,
    *,
    may_discover: Callable[[], bool] = lambda: True,
) -> None:
    number = ClaimNumber(
        value=Decimal(claim["value"]) if claim["value"] is not None else Decimal(0),
        scale=claim["scale"],
        decimals=claim["decimals"],
        unit=claim["unit"] or "",
        qualifier=claim["qualifier"],
        claim_type=claim["claim_type"],
        period_start=claim["period_start"],
        period_end=claim["period_end"],
        geography=claim["geography"] or "UAE",
        breakdown=claim["breakdown"],
    )
    candidates = (
        evidence.candidates(claim["indicator_id"], check.newsroom_id)
        if claim["value"] is not None
        else []
    )
    decision = compare.decide(number, [c.number for c in candidates])
    discovered = False
    searched: list[str] = []
    search_state = None  # for numbers without a registry match: "done" or "skipped" (over budget)
    wants_search = (
        decision.verdict == "none" and claim["value"] is not None and settings.discovery_enabled
    )
    if wants_search and not may_discover():
        search_state = "skipped"
    elif wants_search:
        search_state = "done"
        searched = discovery.allowed_domains(
            topic_id=claim["topic_id"],
            entity_id=claim["entity_id"],
            geography=claim["geography"],
            newsroom_id=check.newsroom_id,
        )
        figure_id = None
        try:
            figure_id = discovery.discover(
                {
                    **claim,
                    "period_start": str(claim["period_start"] or ""),
                    "period_end": str(claim["period_end"] or ""),
                },
                newsroom_id=check.newsroom_id,
                ctx=ctx,
            )
        except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
            log.info("discovery failed for claim %s: %s", claim["id"], exc)
        if figure_id:
            candidates = evidence.candidates(
                claim["indicator_id"], check.newsroom_id, include_ids=[figure_id]
            )
            decision = compare.decide(number, [c.number for c in candidates])
            discovered = (
                any(str(c.row["id"]) == figure_id for c in candidates)
                and decision.comparison is not None
                and decision.comparison.figure.id == figure_id
            )

    verdict = decision.verdict
    differing = decision.differing_fields
    figure_row = None
    evidence_json = None
    verified = False
    if decision.comparison is not None:
        figure_row = next(
            c.row for c in candidates if str(c.row["id"]) == decision.comparison.figure.id
        )
        verified = evidence.check_evidence(figure_row)
        if verified:
            evidence_json = _evidence_json(figure_row)
            evidence_json["closest"] = verdict == "none"
        else:
            log.warning(
                "evidence for figure %s failed the verbatim check; dropped", figure_row["id"]
            )
            verdict, differing, figure_row = "none", [], None

    claim_value_text = review.figure_text(number.value, number.scale, number.decimals, number.unit)
    verifier_json = None
    needs_review = False
    wording = None
    if verdict in ("match", "context", "differs") and evidence_json:
        result = review.verifier(
            claim_sentence=claim["segment_text"] or claim["span_text"],
            claim_fields={
                "span": claim["span_text"],
                "indicator": claim["indicator_text"],
                "value": claim_value_text,
                "claim_type": claim["claim_type"],
                "qualifier": claim["qualifier"],
                "period": claim["period_text"],
                "period_resolved": [str(claim["period_start"]), str(claim["period_end"])]
                if claim["period_start"]
                else None,
                "geography": claim["geography"],
                "breakdown": claim["breakdown"],
            },
            evidence={
                k: evidence_json[k]
                for k in (
                    "indicator_name_ar",
                    "indicator_name_en",
                    "entity_name_en",
                    "value_text",
                    "measure",
                    "period_label",
                    "geography",
                    "breakdown",
                    "quote",
                    "source_name_en",
                )
            }
            | {"document": evidence_json["document"]["title"]},
            verdict=verdict,
            differing_fields=differing,
            ctx=ctx,
        )
        if result:
            verifier_json = result.model_dump()
            needs_review = (not result.agrees) or result.confidence == "low"
        template = review.template_wording(
            arabic=True,
            indicator=evidence_json["indicator_name_ar"] or claim["indicator_text"] or "",
            value_text=evidence_json["value_text"],
            period=evidence_json["period_label_ar"],
            geography=evidence_json["geography"],
            source=evidence_json["publisher_name_ar"],
            claim_type=claim["claim_type"],
        )
        wording = (
            review.polished_wording(
                sentence=review.sentence_around(
                    claim["segment_text"] or claim["span_text"],
                    claim["span_start"],
                    claim["span_end"],
                ),
                span=claim["span_text"],
                template=template,
                evidence_value=Decimal(evidence_json["value"]),
                decimals=evidence_json["decimals"],
                period_label=evidence_json["period_label_ar"],
                source_name=evidence_json["publisher_name_ar"],
                differing_fields=differing,
                ctx=ctx,
            )
            if verdict != "match"
            else template
        )

    chain_status = (
        "connected"
        if (verdict != "none" and verified and evidence_json and evidence_json["tier"] in (1, 2))
        else "broken"
    )
    chain = review.chain_nodes(
        verdict=verdict,
        evidence=evidence_json if verdict != "none" else None,
        attribution=claim["attribution"],
        claim_label=claim["speaker"] or check.title,
        claim_value_text=claim_value_text,
        claim_period=claim["period_text"],
        differing_fields=differing,
    )
    earlier = []
    if figure_row is not None and verdict != "none":
        earlier = [
            {
                "value_text": review.figure_text(
                    Decimal(e["value"]), e["scale"], e["decimals"], e["unit"]
                ),
                "period_label": e["period_label"],
                "status": e["status"],
                "fetched_at": e["fetched_at"].isoformat() if e["fetched_at"] else None,
                "document_title": e["document_title"],
            }
            for e in evidence.earlier_figures(figure_row)
        ]
    if verdict == "none" and not searched:
        searched = discovery.allowed_domains(
            topic_id=claim["topic_id"],
            entity_id=claim["entity_id"],
            geography=claim["geography"],
            newsroom_id=check.newsroom_id,
        )[:8]
    comparison: dict = {"search": search_state} if verdict == "none" and search_state else {}
    if decision.comparison is not None:
        comparison |= {
            "period_relation": decision.comparison.period,
            "scope_relation": decision.comparison.scope,
            "unit_ok": decision.comparison.unit_ok,
            "difference_pct": decision.comparison.difference_pct,
            "tolerance": decision.comparison.tolerance,
        }

    db.execute(
        """
        insert into public.claim_results
          (claim_id, check_id, verdict, differing_fields, chain_status, figure_id, document_version_id, evidence,
           evidence_verified, comparison, verifier, needs_review, suggested_wording, searched_sources, chain,
           earlier_figures, discovered)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (claim_id) do update set
          verdict = excluded.verdict, differing_fields = excluded.differing_fields, chain_status = excluded.chain_status,
          figure_id = excluded.figure_id, document_version_id = excluded.document_version_id, evidence = excluded.evidence,
          evidence_verified = excluded.evidence_verified, comparison = excluded.comparison, verifier = excluded.verifier,
          needs_review = excluded.needs_review, suggested_wording = excluded.suggested_wording,
          searched_sources = excluded.searched_sources, chain = excluded.chain,
          earlier_figures = excluded.earlier_figures, discovered = excluded.discovered
        """,
        (
            claim["id"],
            check.id,
            verdict,
            differing,
            chain_status,
            figure_row["id"] if figure_row else None,
            figure_row["document_version_id"] if figure_row else None,
            db.json(evidence_json) if evidence_json else None,
            verified,
            db.json(comparison),
            db.json(verifier_json) if verifier_json else None,
            needs_review,
            wording,
            db.json(searched),
            db.json(chain),
            db.json(earlier),
            discovered,
        ),
    )


def _check_claims(
    check: CheckRow, ctx: gateway.CallContext, *, segment_id: str | None = None
) -> None:
    # Numbers mapped to a known indicator first: they're the likeliest to have an official source.
    claims = sorted(
        _claim_rows(check.id, segment_id), key=lambda c: (c["indicator_id"] is None, c["idx"])
    )
    total = db.fetch_one(
        "select count(*) as n from public.claims where check_id = %s and checkable", (check.id,)
    )["n"]
    _set_stage(check.id, "checking", claims_total=total, claims_checked=total - len(claims))
    done = total - len(claims)
    errors: list[Exception] = []

    budget = [settings.discovery_per_check]
    budget_lock = threading.Lock()

    def may_discover() -> bool:
        with budget_lock:
            if budget[0] <= 0:
                return False
            budget[0] -= 1
            return True

    def run(claim: dict) -> None:
        nonlocal done
        if not _is_processing(check.id):
            return  # cancelled: don't spend on the remaining numbers
        try:
            _check_claim(claim, check, ctx, may_discover=may_discover)
        except Exception as exc:  # one bad claim shouldn't sink the whole check
            log.exception("claim %s failed", claim["id"])
            errors.append(exc)
        done += 1
        _progress(check.id, claims_checked=done)

    with ThreadPoolExecutor(max_workers=CLAIM_WORKERS) as pool:
        list(pool.map(run, claims))
    if errors and len(errors) == len(claims):
        raise errors[0]


# ─── finishing ────────────────────────────────────────────────────────────────


def _finish(check: CheckRow) -> None:
    with db.transaction() as conn:
        finished = conn.execute(
            """
            update public.checks
            set stage = 'done', status = 'awaiting_review', registry_checked_at = now(), error = null,
                progress = progress || %s
            where id = %s and status = 'processing'
            """,
            (db.json({"finished_at": time.time()}), check.id),
        ).rowcount
        if not finished:
            raise Cancelled(check.id)
        # Newsroom policy: numbers the automatic verifier objects to go to an editor.
        conn.execute(
            """
            with escalated as (
              update public.claims cl set review_state = 'escalated'
              from public.claim_results r, public.checks c, public.newsrooms n
              where r.claim_id = cl.id and c.id = cl.check_id and n.id = c.newsroom_id
                and cl.check_id = %s and cl.review_state = 'pending' and r.needs_review
                and n.escalate_on_verifier_objection
              returning cl.id
            )
            insert into public.decisions (check_id, claim_id, action, note)
            select %s, id, 'escalate', 'verifier_objection' from escalated
            """,
            (check.id, check.id),
        )
        conn.execute("select public.refresh_check_counts(%s)", (check.id,))
        if check.created_by:
            conn.execute(
                """
                insert into public.alerts (newsroom_id, user_id, kind, title, payload)
                values (%s, %s, 'check_ready', %s, %s)
                """,
                (check.newsroom_id, check.created_by, check.title, db.json({"check_id": check.id})),
            )
    if check.channel == "telegram":
        jobs.enqueue("telegram_check_done", {"check_id": check.id}, priority=5)


def _fail(check_id: str, message: str) -> None:
    failed = db.execute(
        "update public.checks set status = 'failed', error = %s where id = %s and status = 'processing'",
        (message[:1000], check_id),
    )
    if not failed:
        return
    row = db.fetch_one("select channel from public.checks where id = %s", (check_id,))
    if row and row["channel"] == "telegram":
        jobs.enqueue("telegram_check_done", {"check_id": check_id}, priority=5)


def load(check_id: str) -> CheckRow | None:
    row = db.fetch_one(
        """
        select id, newsroom_id, created_by, title, input_kind, input_text, input_url, storage_path, original_filename,
               recorded_at, speakers, dialect, channel, status
        from public.checks where id = %s
        """,
        (check_id,),
    )
    if not row or row["status"] == "archived":
        return None
    row.pop("status")
    return CheckRow(
        **{
            k: (str(v) if k in ("id", "newsroom_id", "created_by") and v else v)
            for k, v in row.items()
        }
    )


@jobs.handler("process_check")
def process_check(job: jobs.Job) -> None:
    check_id = job.payload["check_id"]
    mode = job.payload.get("mode", "full")
    check = load(check_id)
    if check is None:
        return
    ctx = gateway.CallContext(newsroom_id=check.newsroom_id, check_id=check.id)
    try:
        if mode == "claim":
            # A reviewer asked to search official sources for one number; the check stays in review.
            for claim in _claim_rows(check.id, claim_id=job.payload["claim_id"]):
                _check_claim(claim, check, ctx)
            db.execute("select public.refresh_check_counts(%s)", (check.id,))
            return
        if mode == "segment":
            segment_id = job.payload["segment_id"]
            _extract(check, ctx, segment_id=segment_id)
            _check_claims(check, ctx, segment_id=segment_id)
        elif mode == "recheck":
            db.execute("delete from public.claim_results where check_id = %s", (check.id,))
            db.execute(
                "update public.claims set review_state = 'pending' where check_id = %s", (check.id,)
            )
            _check_claims(check, ctx)
        else:
            _prepare(check)
            _extract(check, ctx)
            _check_claims(check, ctx)
        _finish(check)
    except Cancelled:
        log.info("check %s was cancelled", check.id)
    except CheckError as exc:
        _fail(check.id, str(exc))  # "code" or "code: detail"
        log.warning("check %s failed: %s", check.id, exc)
    except Exception as exc:
        if job.attempts >= job.max_attempts:
            _fail(check.id, f"internal: {type(exc).__name__}")
        raise


def segment_text(check_id: str) -> str:
    return "\n".join(
        r["text"]
        for r in db.fetch_all(
            "select text from public.segments where check_id = %s order by idx", (check_id,)
        )
    )


def format_claim_value(claim: dict) -> str:
    return (
        review.figure_text(
            Decimal(claim["value"]), claim["scale"], claim["decimals"], claim["unit"] or ""
        )
        if claim["value"] is not None
        else format_number(0)
    )
