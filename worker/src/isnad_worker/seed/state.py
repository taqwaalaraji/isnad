"""The rest of the demo state, so a fresh database looks like the one the demo was recorded on: newsroom
settings, user preferences, source health, alerts, the activity log, model usage and cost, briefs,
evaluation runs, follows and invitations.

    python -m isnad_worker.seed state-export      write seed_data/demo_state.json.gz from the database
    python -m isnad_worker.seed state             restore it (idempotent; part of `make seed-demo`)

Restore after the demo accounts, the registry and the checks: rows reference users by email, newsrooms,
sources, entities and topics by slug, and checks, documents and figures by their kept ids. Rows whose
references are missing keep a null reference, or are skipped when the reference is required.
"""

from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path

from isnad_worker import db
from isnad_worker.seed.catalog import SEED_DATA
from isnad_worker.seed.registry_snapshot import _plain

log = logging.getLogger("isnad.seed")

DATA = SEED_DATA / "demo_state.json.gz"

NEWSROOM_SETTINGS = [
    "name", "kind", "require_approval_for_differs", "escalate_on_verifier_objection", "default_visibility",
    "media_retention_days", "brand_isnad_note", "telegram_enabled", "monthly_check_limit", "status", "internal",
]  # fmt: skip
SOURCE_STATE = ["status", "health", "health_note", "last_fetched_at", "verified_at"]
JSON_COLUMNS = {
    "payload",
    "details",
    "content",
    "settings",
    "metrics",
    "results",
    "notification_prefs",
}


def _rows(query: str, params: tuple = ()) -> list[dict]:
    return [{k: _plain(v) for k, v in r.items()} for r in db.fetch_all(query, params)]


def export() -> Path:
    state = {
        "newsrooms": _rows(
            f"select slug, {', '.join(NEWSROOM_SETTINGS)} from public.newsrooms order by slug"
        ),
        "profiles": _rows(
            """
            select p.email, p.locale, p.notification_prefs, n.slug as last_newsroom
            from public.profiles p left join public.newsrooms n on n.id = p.last_newsroom_id order by p.email
            """
        ),
        "sources": _rows(
            f"select slug, {', '.join(SOURCE_STATE)} from public.sources where newsroom_id is null order by slug"
        ),
        "alerts": _rows(
            """
            select a.id, n.slug as newsroom, p.email as user_email, a.kind, a.title, a.body, a.payload, a.read_at,
                   a.dismissed_at, a.delivered_telegram_at, a.delivered_email_at, a.created_at
            from public.alerts a left join public.newsrooms n on n.id = a.newsroom_id
            left join public.profiles p on p.id = a.user_id order by a.created_at
            """
        ),
        "activity_log": _rows(
            """
            select a.id, n.slug as newsroom, p.email as user_email, a.action, a.target_type, a.target_id,
                   a.details, a.created_at
            from public.activity_log a left join public.newsrooms n on n.id = a.newsroom_id
            left join public.profiles p on p.id = a.user_id order by a.id
            """
        ),
        "usage_events": _rows(
            """
            select u.id, n.slug as newsroom, u.check_id, u.task, u.provider, u.model, u.input_tokens,
                   u.output_tokens, u.cache_read_tokens, u.audio_seconds, u.cost_usd, u.duration_ms,
                   u.search_queries, u.created_at
            from public.usage_events u left join public.newsrooms n on n.id = u.newsroom_id order by u.id
            """
        ),
        "briefs": _rows(
            """
            select b.id, n.slug as newsroom, p.email as user_email, e.slug as entity_slug, t.slug as topic_slug,
                   b.title, b.interview_date, b.guest_name, b.status, b.content, b.error, b.created_at, b.updated_at
            from public.briefs b left join public.newsrooms n on n.id = b.newsroom_id
            left join public.profiles p on p.id = b.created_by
            left join public.entities e on e.id = b.entity_id
            left join public.topics t on t.id = b.topic_id order by b.created_at
            """
        ),
        "eval_runs": _rows(
            """
            select r.id, r.status, r.dataset, r.settings, r.metrics, r.results, r.error, p.email as user_email,
                   r.created_at, r.finished_at
            from public.eval_runs r left join public.profiles p on p.id = r.started_by order by r.created_at
            """
        ),
        "follows": _rows(
            """
            select p.email as user_email, n.slug as newsroom, f.target_type, f.target_id, f.created_at
            from public.follows f join public.profiles p on p.id = f.user_id
            join public.newsrooms n on n.id = f.newsroom_id
            """
        ),
        "invitations": _rows(
            """
            select i.id, n.slug as newsroom, i.email, i.full_name, i.role, d.name as desk, p.email as invited_by,
                   i.token_hash, i.expires_at, i.accepted_at, i.revoked_at, i.created_at
            from public.invitations i join public.newsrooms n on n.id = i.newsroom_id
            left join public.desks d on d.id = i.desk_id
            left join public.profiles p on p.id = i.invited_by
            """
        ),
    }
    with gzip.open(DATA, "wt", encoding="utf-8") as out:
        json.dump(state, out, ensure_ascii=False, separators=(",", ":"))
    log.info("demo state: %s → %s", ", ".join(f"{len(v)} {k}" for k, v in state.items()), DATA.name)
    return DATA


def _value(column: str, value: object) -> object:
    return db.json(value) if column in JSON_COLUMNS and value is not None else value


def _insert(conn, table: str, row: dict, identity: bool = False) -> None:
    columns = list(row)
    conn.execute(
        f"insert into public.{table} ({', '.join(columns)}) "
        f"{'overriding system value ' if identity else ''}"
        f"values ({', '.join(['%s'] * len(columns))}) on conflict do nothing",
        [_value(c, row[c]) for c in columns],
    )


def restore() -> None:
    if not DATA.exists():
        log.info("no demo state; skipped")
        return
    with gzip.open(DATA, "rt", encoding="utf-8") as src:
        state = json.load(src)

    def ids(query: str) -> dict[str, str]:
        return {r["key"]: str(r["id"]) for r in db.fetch_all(query)}

    users = ids("select email as key, id from public.profiles")
    entities = ids("select slug as key, id from public.entities")
    topics = ids("select slug as key, id from public.topics")
    checks = set(ids("select id::text as key, id from public.checks"))

    with db.transaction() as conn:
        for n in state["newsrooms"]:
            settings = {c: n[c] for c in NEWSROOM_SETTINGS}
            conn.execute(
                f"""
                insert into public.newsrooms (slug, {", ".join(settings)}) values (%s, {", ".join(["%s"] * len(settings))})
                on conflict (slug) do update set {", ".join(f"{c} = excluded.{c}" for c in settings)}
                """,
                [n["slug"], *settings.values()],
            )
        newsrooms = {
            r["slug"]: str(r["id"])
            for r in conn.execute("select slug, id from public.newsrooms").fetchall()
        }
        for p in state["profiles"]:
            conn.execute(
                "update public.profiles set locale = %s, notification_prefs = %s, last_newsroom_id = %s where email = %s",
                (
                    p["locale"],
                    _value("notification_prefs", p["notification_prefs"]),
                    newsrooms.get(p["last_newsroom"] or ""),
                    p["email"],
                ),
            )
        for s in state["sources"]:
            conn.execute(
                f"update public.sources set {', '.join(f'{c} = %s' for c in SOURCE_STATE)} where slug = %s and newsroom_id is null",
                [*(s[c] for c in SOURCE_STATE), s["slug"]],
            )

        def refs(row: dict, required: tuple[str, ...] = ()) -> dict | None:
            """Replace slug/email references with ids; None when a required one is missing."""
            out = dict(row)
            for key, table, column in (
                ("newsroom", newsrooms, "newsroom_id"),
                ("user_email", users, None),
                ("entity_slug", entities, "entity_id"),
                ("topic_slug", topics, "topic_id"),
            ):
                if key in out:
                    value = table.get(out.pop(key) or "")
                    if key in required and value is None:
                        return None
                    if column:
                        out[column] = value
                    else:
                        out["_user"] = value
            if "check_id" in out and out["check_id"] not in checks:
                out["check_id"] = None
            return out

        counts = {}
        for a in state["alerts"]:
            row = refs(a, ("newsroom", "user_email"))
            if row:
                row["user_id"] = row.pop("_user")
                _insert(conn, "alerts", row)
                counts["alerts"] = counts.get("alerts", 0) + 1
        for a in state["activity_log"]:
            row = refs(a)
            if row:
                row["user_id"] = row.pop("_user", None)
                _insert(conn, "activity_log", row, identity=True)
                counts["activity_log"] = counts.get("activity_log", 0) + 1
        for u in state["usage_events"]:
            row = refs(u)
            if row:
                _insert(conn, "usage_events", row, identity=True)
                counts["usage_events"] = counts.get("usage_events", 0) + 1
        for b in state["briefs"]:
            row = refs(b, ("newsroom",))
            if row:
                row["created_by"] = row.pop("_user", None)
                _insert(conn, "briefs", row)
                # Inserting a brief queues its generation; these are already written.
                conn.execute(
                    "delete from public.jobs where kind = 'generate_brief' and status = 'queued' and payload->>'brief_id' = %s",
                    (row["id"],),
                )
                counts["briefs"] = counts.get("briefs", 0) + 1
        for r in state["eval_runs"]:
            row = refs(r)
            if row:
                row["started_by"] = row.pop("_user", None)
                _insert(conn, "eval_runs", row)
                counts["eval_runs"] = counts.get("eval_runs", 0) + 1
        for f in state["follows"]:
            row = refs(f, ("newsroom", "user_email"))
            if row:
                row["user_id"] = row.pop("_user")
                _insert(conn, "follows", row)
        for i in state["invitations"]:
            desk = i.pop("desk", None)
            inviter = users.get(i.pop("invited_by") or "")
            row = refs(i, ("newsroom",))
            if row:
                found = conn.execute(
                    "select id from public.desks where newsroom_id = %s and name = %s",
                    (row["newsroom_id"], desk),
                ).fetchone()
                row["desk_id"] = found["id"] if found else None
                row["invited_by"] = inviter
                _insert(conn, "invitations", row)
        # Identity columns continue after the restored rows.
        for table in ("activity_log", "usage_events"):
            conn.execute(
                f"select setval(pg_get_serial_sequence('public.{table}', 'id'), coalesce((select max(id) from public.{table}), 0) + 1, false)"
            )
    log.info(
        "demo state restored: %s", ", ".join(f"{v} {k}" for k, v in counts.items()) or "nothing new"
    )
