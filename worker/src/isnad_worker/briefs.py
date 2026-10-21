"""Interview briefs: an entity's recent official figures and revisions, written up from the registry only."""

from __future__ import annotations

import json
import logging
import time
from decimal import Decimal

from pydantic import BaseModel, Field

from isnad_worker import db, jobs
from isnad_worker.ai import gateway
from isnad_worker.pipeline.review import figure_text

log = logging.getLogger("isnad.briefs")

SYSTEM = """You prepare an interview brief for a presenter about to interview an official from a UAE government entity.
Use only the figures provided (each has an id). Write in Arabic. Be concise and neutral.
- `summary`: 2–3 sentences on what the latest official figures show.
- `highlights`: the 4–8 most newsworthy figures, each referring to its figure id and saying in one sentence why it matters.
- `questions`: 3–5 sharp, fair questions a presenter could ask, each grounded in the figures (refer to figure ids).
  When earlier statements by the entity are provided, you may ask about the gap between a statement and the official figure.
Never introduce a number that isn't in the provided figures or statements."""

DEFAULT_OPTIONS = {"period_months": 12, "revisions": True, "statements": True, "questions": True}


class Highlight(BaseModel):
    figure_id: str
    note: str


class Question(BaseModel):
    question: str
    figure_ids: list[str]


class BriefDraft(BaseModel):
    summary: str = Field(description="Arabic, 2–3 sentences.")
    highlights: list[Highlight]
    questions: list[Question]


def _value(f: dict) -> str:
    """A figure as a presenter would say it: spreadsheet cells can carry a dozen decimals."""
    decimals = min(f["decimals"], 1 if f["unit"] == "%" else 2)
    return figure_text(Decimal(f["value"]), f["scale"], decimals, f["unit"])


def options_of(brief: dict) -> dict:
    stored = (brief.get("content") or {}).get("options") or {}
    merged = {**DEFAULT_OPTIONS, **{k: v for k, v in stored.items() if k in DEFAULT_OPTIONS}}
    months = merged["period_months"]
    merged["period_months"] = months if isinstance(months, int) and 1 <= months <= 120 else 12
    return merged


def _figures(entity_id: str, topic_id: str | None, newsroom_id: str, months: int) -> list[dict]:
    return db.fetch_all(
        """
        select f.id, f.value, f.scale, f.decimals, f.unit, f.measure, f.period_label, f.period_end, f.geography,
               f.breakdown, f.status, f.supersedes_id, f.quote, f.indicator_id, f.document_id,
               i.name_ar as indicator, d.title as document, s.name_ar as source, v.fetched_at
        from public.figures f
        join public.indicators i on i.id = f.indicator_id
        join public.documents d on d.id = f.document_id
        join public.sources s on s.id = f.source_id
        join public.document_versions v on v.id = f.document_version_id
        where f.review_status = 'approved' and f.is_current
          and (f.newsroom_id is null or f.newsroom_id = %(newsroom)s)
          and (f.entity_id = %(entity)s or s.entity_id = %(entity)s)
          and (%(topic)s::uuid is null or i.topic_id = %(topic)s)
          and f.period_end >= (current_date - make_interval(months => %(months)s))
        order by f.period_end desc, i.name_ar
        limit 40
        """,
        {"entity": entity_id, "topic": topic_id, "newsroom": newsroom_id, "months": months},
    )


def _revisions(figures: list[dict]) -> list[dict]:
    """Figures in the brief that replaced an earlier, different official value."""
    revised = [f for f in figures if f["supersedes_id"] and f["status"] == "revised"]
    if not revised:
        return []
    previous = {
        str(r["id"]): r
        for r in db.fetch_all(
            "select id, value, scale, decimals, unit from public.figures where id = any(%s)",
            ([f["supersedes_id"] for f in revised],),
        )
    }
    out = []
    for f in revised:
        old = previous.get(str(f["supersedes_id"]))
        if not old:
            continue
        out.append(
            {
                "figure_id": str(f["id"]),
                "indicator": f["indicator"],
                "period": f["period_label"],
                "value": _value(f),
                "previous_value": _value(old),
                "document_id": str(f["document_id"]),
                "revised_at": f["fetched_at"].isoformat() if f["fetched_at"] else None,
            }
        )
    return out


def _statements(entity_id: str, newsroom_id: str, months: int) -> list[dict]:
    """What the entity's people said before, as this newsroom checked it."""
    rows = db.fetch_all(
        """
        select cl.id as claim_id, c.id as check_id, c.title as check_title, cl.span_text, cl.speaker,
               c.recorded_at, r.verdict
        from public.claims cl
        join public.checks c on c.id = cl.check_id
        left join public.claim_results r on r.claim_id = cl.id
        where c.newsroom_id = %(newsroom)s and cl.entity_id = %(entity)s and cl.checkable
          and c.status not in ('archived', 'failed')
          and c.recorded_at >= (current_date - make_interval(months => %(months)s))
        order by c.recorded_at desc, cl.idx
        limit 8
        """,
        {"entity": entity_id, "newsroom": newsroom_id, "months": months},
    )
    return [
        {
            "claim_id": str(r["claim_id"]),
            "check_id": str(r["check_id"]),
            "check_title": r["check_title"],
            "span": r["span_text"],
            "speaker": r["speaker"],
            "date": r["recorded_at"].isoformat() if r["recorded_at"] else None,
            "verdict": r["verdict"],
        }
        for r in rows
    ]


@jobs.handler("generate_brief")
def generate_brief(job: jobs.Job) -> None:
    brief = db.fetch_one("select * from public.briefs where id = %s", (job.payload["brief_id"],))
    if not brief:
        return
    options = options_of(brief)
    entity_id, newsroom_id = str(brief["entity_id"]), str(brief["newsroom_id"])
    figures = _figures(
        entity_id,
        str(brief["topic_id"]) if brief["topic_id"] else None,
        newsroom_id,
        options["period_months"],
    )
    entity = db.fetch_one(
        "select name_ar, name_en from public.entities where id = %s", (brief["entity_id"],)
    )
    items = [
        {
            "id": str(f["id"]),
            "indicator": f["indicator"],
            "indicator_id": str(f["indicator_id"]),
            "value": _value(f),
            "measure": f["measure"],
            "period": f["period_label"],
            "geography": f["geography"],
            "breakdown": f["breakdown"],
            "status": f["status"],
            "revised": bool(f["supersedes_id"]),
            "source": f["source"],
            "document": f["document"],
            "document_id": str(f["document_id"]),
            "fetched_at": f["fetched_at"].isoformat() if f["fetched_at"] else None,
        }
        for f in figures
    ]
    statements = (
        _statements(entity_id, newsroom_id, options["period_months"])
        if options["statements"]
        else []
    )
    content: dict = {
        "options": options,
        "generated_at": time.time(),
        "generated_from": len(items),
        "figures": items,
        "revisions": _revisions(figures) if options["revisions"] else [],
        "statements": statements,
    }
    if items:
        model_figures = [
            {k: v for k, v in i.items() if k not in ("document_id", "indicator_id", "fetched_at")}
            for i in items
        ]
        try:
            draft = gateway.parse(
                "generate_brief",
                system=SYSTEM,
                messages=[
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "entity": entity,
                                "guest": brief["guest_name"],
                                "figures": model_figures,
                                "earlier_statements": [
                                    {"said": s["span"], "verdict": s["verdict"], "date": s["date"]}
                                    for s in statements
                                ],
                            },
                            ensure_ascii=False,
                        ),
                    }
                ],
                output=BriefDraft,
                ctx=gateway.CallContext(newsroom_id=newsroom_id),
                max_tokens=6000,
            )
            known = {i["id"] for i in items}
            content |= {
                "summary": draft.summary,
                "highlights": [h.model_dump() for h in draft.highlights if h.figure_id in known],
                "questions": [
                    {**q.model_dump(), "figure_ids": [i for i in q.figure_ids if i in known]}
                    for q in draft.questions
                ]
                if options["questions"]
                else [],
            }
        except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
            log.warning("brief draft failed: %s", exc)
    db.execute(
        "update public.briefs set status = 'ready', content = %s, error = null where id = %s",
        (db.json(content), brief["id"]),
    )
