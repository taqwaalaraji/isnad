"""Ask Isnad: plain-language answers from the registry only, every number cited.

The model writes the answer from approved figures we retrieve; code then checks that every cited
figure was among them and that every number in the answer is one of the cited figures (or a date
or period of theirs). An answer that fails the check is retried once, then replaced by "no evidence".
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from isnad_worker import db
from isnad_worker.ai import gateway
from isnad_worker.pipeline import evidence
from isnad_worker.pipeline.review import figure_text
from isnad_worker.text import SCALES, find_numbers, period_label

log = logging.getLogger("isnad.ask")

MAX_QUESTION = 500
MAX_CANDIDATES = 40
_MARKER = re.compile(r"\[(\d{1,2})\]")
_YEAR = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
_ARABIC = re.compile(r"[؀-ۿ]")


class AskOutput(BaseModel):
    answerable: bool = Field(
        description="False when the figures provided don't answer the question with evidence."
    )
    answer: str = Field(
        description="The answer in the question's language, citing figures with [1], [2] … in the "
        "order of `citations`. Empty when not answerable."
    )
    citations: list[str] = Field(
        description="Figure ids cited in the answer, in marker order ([1] is the first id)."
    )
    reason: str = Field(
        description="When not answerable: one short sentence on what the registry lacks. Else ''."
    )
    follow_ups: list[str] = Field(
        description="Up to three short follow-up questions the registry can answer, in the question's language."
    )


@dataclass
class Verification:
    ok: bool
    problem: str = ""
    wrong_number: bool = False  # a number the cited figures don't back (not just a slip in form)


# ─── Retrieval ────────────────────────────────────────────────────────────────


def _candidate_ids(question: str, newsroom_id: str | None) -> list[str]:
    """Approved figures whose indicator or entity the question names, newest first; the asked
    year (if any) ranks first."""
    years = [int(y) for y in _YEAR.findall(question)]
    rows = db.fetch_all(
        """
        with q as (select public.normalize_ar(%(question)s) as t)
        select f.id,
               greatest(
                 extensions.word_similarity(public.normalize_ar(i.name_ar), q.t),
                 extensions.word_similarity(lower(i.name_en), q.t),
                 coalesce((
                   select max(extensions.word_similarity(public.normalize_ar(a), q.t))
                   from unnest(i.aliases) a
                 ), 0)
               ) as indicator_score,
               greatest(
                 coalesce(extensions.word_similarity(public.normalize_ar(e.name_ar), q.t), 0),
                 coalesce(extensions.word_similarity(public.normalize_ar(coalesce(e.short_name_ar, '')), q.t), 0),
                 coalesce(extensions.word_similarity(lower(e.name_en), q.t), 0)
               ) as entity_score,
               extensions.word_similarity(q.t, public.normalize_ar(f.quote)) as quote_score,
               f.period_start, f.period_end, f.is_current
        from public.figures f
        join public.indicators i on i.id = f.indicator_id
        left join public.entities e on e.id = f.entity_id
        cross join q
        where f.review_status = 'approved'
          and (f.newsroom_id is null or f.newsroom_id = %(newsroom)s)
        """,
        {"question": question, "newsroom": newsroom_id},
    )
    scored = []
    for r in rows:
        score = float(r["indicator_score"]) * 2 + float(r["entity_score"]) + float(r["quote_score"])
        if r["indicator_score"] < 0.4 and r["quote_score"] < 0.5:
            continue
        if years and any(r["period_start"].year <= y <= r["period_end"].year for y in years):
            score += 0.75
        if r["is_current"]:
            score += 0.1
        scored.append((score, r["period_end"], str(r["id"])))
    scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
    return [figure_id for _, _, figure_id in scored[:MAX_CANDIDATES]]


def _rows(ids: list[str]) -> list[dict]:
    if not ids:
        return []
    rows = db.fetch_all(evidence.FIGURE_SELECT + " where f.id = any(%s::uuid[])", (ids,))
    order = {figure_id: i for i, figure_id in enumerate(ids)}
    return sorted(rows, key=lambda r: order[str(r["id"])])


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


def _figure_for_model(row: dict) -> dict:
    value = Decimal(row["value"])
    return {
        "id": str(row["id"]),
        "indicator": row["indicator_name_ar"] or row["indicator_name_en"],
        "indicator_en": row["indicator_name_en"],
        "value": figure_text(value, row["scale"], row["decimals"], row["unit"]),
        "value_en": figure_text(value, row["scale"], row["decimals"], row["unit"], arabic=False),
        "measure": row["measure"],
        "period": period_label(row["period_start"], row["period_end"]) or row["period_label"],
        "period_en": period_label(row["period_start"], row["period_end"], arabic=False)
        or row["period_label"],
        "geography": row["geography"],
        "breakdown": row["breakdown"],
        "status": row["status"],
        "current": row["is_current"],
        "supersedes": str(row["supersedes_id"]) if row["supersedes_id"] else None,
        "source": row["publisher_name_ar"] or row["source_name_ar"],
        "source_en": row["publisher_name_en"] or row["source_name_en"],
        "document": row["document_title"],
        "retrieved": _iso(row["fetched_at"]),
        "quote": row["quote"],
    }


# ─── Verification ─────────────────────────────────────────────────────────────


def _allowed_small_numbers(rows: list[dict]) -> set[Decimal]:
    """Dates and period parts of the cited figures (days, months, years, quarter and half
    numbers) may appear in an answer without being figure values."""
    allowed: set[Decimal] = set()
    for row in rows:
        for d in (row["period_start"], row["period_end"], row["fetched_at"], row["published_at"]):
            if d:
                allowed.update({Decimal(d.day), Decimal(d.month), Decimal(d.year)})
        start, end = row["period_start"], row["period_end"]
        allowed.add(Decimal((start.month - 1) // 3 + 1))
        allowed.add(Decimal((end.month - 1) // 3 + 1))
        allowed.add(Decimal(1 if start.month <= 6 else 2))
        if row.get("version"):
            allowed.add(Decimal(row["version"]))
    return allowed


def _matches_figure(n, row: dict) -> bool:
    figure_value = Decimal(row["value"])
    if row["unit"] == "%" or n.is_percent:
        if not (n.is_percent and row["unit"] == "%"):
            return False
        half = Decimal("0.5") * Decimal(10) ** -max(n.decimals, 0)
        return abs(n.value - figure_value) <= max(
            half, Decimal("0.5") * Decimal(10) ** -row["decimals"]
        )
    figure_base = Decimal(row["value_base"])
    n_half = Decimal("0.5") * Decimal(10) ** -n.decimals * SCALES[n.scale]
    f_half = Decimal("0.5") * Decimal(10) ** -row["decimals"] * SCALES.get(row["scale"], Decimal(1))
    return abs(n.base_value - figure_base) <= max(n_half, f_half)


def verify(answer: str, citations: list[str], rows_by_id: dict[str, dict]) -> Verification:
    """Code's check on the model's answer; nothing unverified reaches the newsroom."""
    if not citations:
        return Verification(False, "no figures were cited")
    unknown = [c for c in citations if c not in rows_by_id]
    if unknown:
        return Verification(False, f"cited ids that weren't provided: {', '.join(unknown)}")
    markers = {int(m) for m in _MARKER.findall(answer)}
    if not markers:
        return Verification(False, "the answer has no [n] citation markers")
    if any(m < 1 or m > len(citations) for m in markers):
        return Verification(False, "a [n] marker has no matching citation")
    cited = [rows_by_id[c] for c in citations]
    allowed = _allowed_small_numbers(cited)
    for n in find_numbers(_MARKER.sub(" ", answer)):
        if any(_matches_figure(n, row) for row in cited):
            continue
        if not n.is_percent and n.scale == "one" and n.decimals == 0 and n.value in allowed:
            continue
        return Verification(
            False, f"the number {n.text} isn't one of the cited figures", wrong_number=True
        )
    return Verification(True)


# ─── The answer ───────────────────────────────────────────────────────────────


def _evidence_card(row: dict) -> dict:
    value = Decimal(row["value"])
    earlier = [
        {
            "value_text": figure_text(Decimal(e["value"]), e["scale"], e["decimals"], e["unit"]),
            "value_text_en": figure_text(
                Decimal(e["value"]), e["scale"], e["decimals"], e["unit"], arabic=False
            ),
            "period_label": e["period_label"],
            "status": e["status"],
            "fetched_at": _iso(e["fetched_at"]),
            "document_title": e["document_title"],
        }
        for e in (evidence.earlier_figures(row) if row["indicator_id"] else [])
    ]
    return {
        "figure_id": str(row["id"]),
        "document_id": str(row["document_id"]),
        "document_title": row["document_title"],
        "document_url": row["document_url"],
        "version": row["version"],
        "fetched_at": _iso(row["fetched_at"]),
        "published_at": _iso(row["published_at"]),
        "source_name_ar": row["publisher_name_ar"] or row["source_name_ar"],
        "source_name_en": row["publisher_name_en"] or row["source_name_en"],
        "tier": row["tier"],
        "quote": row["quote"],
        "quote_verified": row["quote_verified"],
        "location": row["location"],
        "value": str(value),
        "value_text": figure_text(value, row["scale"], row["decimals"], row["unit"]),
        "value_text_en": figure_text(
            value, row["scale"], row["decimals"], row["unit"], arabic=False
        ),
        "period_label_ar": period_label(row["period_start"], row["period_end"])
        or row["period_label"],
        "period_label_en": period_label(row["period_start"], row["period_end"], arabic=False)
        or row["period_label"],
        "status": row["status"],
        "is_current": row["is_current"],
        "indicator_name_ar": row["indicator_name_ar"],
        "indicator_name_en": row["indicator_name_en"],
        "earlier": earlier,
    }


def _no_answer(language: str, reason: str) -> dict:
    return {
        "answerable": False,
        "answer": "",
        "language": language,
        "reason": reason,
        "citations": [],
        "follow_ups": [],
    }


def answer(question: str, newsroom_id: str | None) -> dict:
    question = " ".join(question.split())[:MAX_QUESTION]
    language = "ar" if _ARABIC.search(question) else "en"
    if len(question) < 3:
        return _no_answer(language, "")

    rows = _rows(_candidate_ids(question, newsroom_id))
    if not rows:
        return _no_answer(language, "")
    rows_by_id = {str(r["id"]): r for r in rows}
    ctx = gateway.CallContext(newsroom_id=newsroom_id)
    today = date.today().isoformat()
    content = json.dumps(
        {
            "today": today,
            "question": question,
            "figures": [_figure_for_model(r) for r in rows],
        },
        ensure_ascii=False,
        indent=1,
    )
    messages: list[dict] = [{"role": "user", "content": content}]

    can_escalate = gateway.can_escalate("ask_registry")
    escalate = False
    for attempt in range(3):
        try:
            result = gateway.parse(
                "ask_registry",
                system=gateway.prompt("ask_registry"),
                messages=messages,
                output=AskOutput,
                ctx=ctx,
                max_tokens=4000,
                escalate=escalate,
            )
        except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
            log.warning("ask failed: %s", exc)
            return _no_answer(language, "")
        if not result.answerable:
            return _no_answer(language, result.reason.strip())
        citations = list(dict.fromkeys(c.strip() for c in result.citations if c.strip()))
        check = verify(result.answer, citations, rows_by_id)
        if check.ok:
            return {
                "answerable": True,
                "answer": result.answer.strip(),
                "language": language,
                "reason": "",
                "citations": [_evidence_card(rows_by_id[c]) for c in citations],
                "follow_ups": [f.strip() for f in result.follow_ups if f.strip()][:3],
            }
        log.info("ask answer rejected (attempt %d): %s", attempt + 1, check.problem)
        if escalate or (attempt == 1 and not can_escalate):
            break
        # A slip in form is fixed by the same model once told; a number it can't back, or a
        # second slip, goes to the stronger model.
        escalate = can_escalate and (check.wrong_number or attempt == 1)
        messages = [
            *messages,
            {"role": "assistant", "content": result.model_dump_json()},
            {
                "role": "user",
                "content": f"Rejected by the evidence check: {check.problem}. Write numbers "
                "exactly as the cited figures give them, cite every figure you use, and add "
                "no numbers of your own.",
            },
        ]
    return _no_answer(language, "")
