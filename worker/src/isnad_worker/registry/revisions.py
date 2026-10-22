"""When a new figure replaces an earlier one for the same indicator, period and scope.

The registry keeps both: the old figure stops being current and the new one points at it. If the
value changed, newsrooms that used the old figure in an approved or published check are alerted,
and members following the indicator hear about new figures.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from isnad_worker import db, jobs
from isnad_worker.pipeline.review import figure_text
from isnad_worker.text import SCALES

log = logging.getLogger("isnad.revisions")


def _half_unit(figure: dict) -> Decimal:
    """Half of the last published digit, in base units (5.1 million → 50,000)."""
    multiplier = Decimal(1) if figure["unit"] == "%" else SCALES.get(figure["scale"], Decimal(1))
    return Decimal("0.5") * Decimal(10) ** -int(figure["decimals"] or 0) * multiplier


def is_revision(old: dict, new: dict) -> bool:
    """A new value only when it differs beyond the coarser of the two published precisions
    (4.1 million then 4.14 million is the same figure, published more precisely)."""
    difference = abs(Decimal(old["value_base"]) - Decimal(new["value_base"]))
    return difference > max(_half_unit(old), _half_unit(new))


def link(figure_id: str) -> None:
    figure = db.fetch_one(
        """
        select f.*, i.name_ar as indicator_name_ar, s.name_ar as source_name_ar
        from public.figures f
        left join public.indicators i on i.id = f.indicator_id
        join public.sources s on s.id = f.source_id
        where f.id = %s and f.review_status = 'approved'
        """,
        (figure_id,),
    )
    if not figure or not figure["indicator_id"]:
        return
    # A revision is the same publisher stating the frame again; another official body publishing
    # a different value for it is a parallel figure, and both stay current.
    previous = db.fetch_all(
        """
        select f.* from public.figures f
        join public.document_versions v on v.id = f.document_version_id
        join public.sources s on s.id = f.source_id
        where f.id <> %(id)s and f.review_status = 'approved' and f.is_current
          and f.indicator_id = %(indicator)s and f.measure = %(measure)s and f.geography = %(geo)s
          and f.period_start = %(start)s and f.period_end = %(end)s
          and coalesce(f.breakdown, '') = coalesce(%(breakdown)s, '')
          and (f.newsroom_id is not distinct from %(newsroom)s)
          and (s.id = %(source)s or s.entity_id = (select entity_id from public.sources where id = %(source)s))
          and v.fetched_at <= (select fetched_at from public.document_versions where id = %(version)s)
        order by v.fetched_at desc
        """,
        {
            "id": figure_id,
            "indicator": figure["indicator_id"],
            "measure": figure["measure"],
            "geo": figure["geography"],
            "start": figure["period_start"],
            "end": figure["period_end"],
            "breakdown": figure["breakdown"],
            "newsroom": figure["newsroom_id"],
            "version": figure["document_version_id"],
            "source": figure["source_id"],
        },
    )
    if not previous:
        _notify_followers(figure)
        return
    latest = previous[0]
    changed = is_revision(latest, figure)
    with db.transaction() as conn:
        conn.execute(
            "update public.figures set is_current = false where id = any(%s)",
            ([p["id"] for p in previous],),
        )
        conn.execute(
            "update public.figures set supersedes_id = %s, status = case when %s then 'revised'::public.figure_status else status end where id = %s",
            (latest["id"], changed, figure_id),
        )
    if changed:
        log.info("figure %s revises %s", figure_id, latest["id"])
        # Checks may cite any of the superseded copies (ingested and discovered), not only the newest.
        _alert_revision(figure, latest, [p["id"] for p in previous])


def recompute_current() -> int:
    """Rebuild `is_current` for approved figures: per publisher and frame, the latest fetched
    figure is current. Repairs registries linked with earlier rules (which also treated another
    publisher's figure as a revision); sends no alerts. Returns the number of current figures."""
    with db.transaction() as conn:
        conn.execute(
            """
            update public.figures f
            set supersedes_id = null,
                status = case when f.status = 'revised' then 'final'::public.figure_status else f.status end
            from public.figures o, public.sources sf, public.sources so
            where o.id = f.supersedes_id and sf.id = f.source_id and so.id = o.source_id
              and coalesce(sf.entity_id, sf.id) <> coalesce(so.entity_id, so.id)
            """
        )
        conn.execute(
            """
            with ranked as (
              select f.id,
                     row_number() over (
                       partition by coalesce(s.entity_id, s.id), f.newsroom_id, f.indicator_id,
                                    f.measure, f.geography, coalesce(f.breakdown, ''),
                                    f.period_start, f.period_end
                       order by v.fetched_at desc, f.created_at desc
                     ) as n
              from public.figures f
              join public.sources s on s.id = f.source_id
              join public.document_versions v on v.id = f.document_version_id
              where f.review_status = 'approved' and f.indicator_id is not null
            )
            update public.figures f set is_current = (ranked.n = 1)
            from ranked where ranked.id = f.id and f.is_current is distinct from (ranked.n = 1)
            """
        )
        return conn.execute("select count(*) as n from public.figures where is_current").fetchone()[
            "n"
        ]


def _alert_revision(figure: dict, old: dict, superseded: list) -> None:
    old_text = figure_text(Decimal(old["value"]), old["scale"], old["decimals"], old["unit"])
    new_text = figure_text(
        Decimal(figure["value"]), figure["scale"], figure["decimals"], figure["unit"]
    )
    affected = db.fetch_all(
        """
        select c.newsroom_id, array_agg(distinct c.id) as checks,
               array_agg(distinct x.user_id) filter (where x.user_id is not null) as users
        from public.claim_results r
        join public.checks c on c.id = r.check_id
        cross join lateral (values (c.created_by), (c.assigned_editor_id)) as x(user_id)
        where r.figure_id = any(%s) and c.status in ('approved', 'published')
        group by c.newsroom_id
        """,
        (superseded,),
    )
    # Words, not an arrow: "→" reads backwards in right-to-left text.
    title = f"{figure['indicator_name_ar']}: عُدِّل إلى {new_text} (كان {old_text})"
    for row in affected:
        payload = {
            "figure_id": str(figure["id"]),
            "previous_figure_id": str(old["id"]),
            "indicator_id": str(figure["indicator_id"]),
            "affected_checks": [str(c) for c in row["checks"]],
            "period_label": figure["period_label"],
            "source": figure["source_name_ar"],
        }
        recipients = row["users"] or [None]
        for user in recipients:
            db.execute(
                """
                insert into public.alerts (newsroom_id, user_id, kind, title, body, payload)
                values (%s, %s, 'figure_revised', %s, %s, %s)
                """,
                (row["newsroom_id"], user, title, figure["period_label"], db.json(payload)),
            )


def _notify_followers(figure: dict) -> None:
    followers = db.fetch_all(
        """
        select user_id, newsroom_id from public.follows
        where (target_type = 'indicator' and target_id = %s) or (target_type = 'entity' and target_id = %s)
        """,
        (figure["indicator_id"], figure["entity_id"]),
    )
    if not followers:
        return
    text = figure_text(
        Decimal(figure["value"]), figure["scale"], figure["decimals"], figure["unit"]
    )
    for f in followers:
        if figure["newsroom_id"] and str(figure["newsroom_id"]) != str(f["newsroom_id"]):
            continue
        db.execute(
            """
            insert into public.alerts (newsroom_id, user_id, kind, title, body, payload)
            values (%s, %s, 'new_figure', %s, %s, %s)
            """,
            (
                f["newsroom_id"],
                f["user_id"],
                f"{figure['indicator_name_ar']}: {text}",
                figure["period_label"],
                db.json(
                    {"figure_id": str(figure["id"]), "indicator_id": str(figure["indicator_id"])}
                ),
            ),
        )


@jobs.handler("figures_approved")
def figures_approved(job: jobs.Job) -> None:
    for figure_id in job.payload.get("figure_ids", []):
        link(figure_id)
