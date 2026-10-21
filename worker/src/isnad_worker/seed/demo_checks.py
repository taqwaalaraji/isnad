"""Processed checks kept as seed data, so a fresh database shows the same real, reviewed checks without
running the pipeline (which costs model calls).

    python -m isnad_worker.seed demo-checks-export [--titles "t1|t2"]   write seed_data/demo_checks.json.gz
                                                                      (default: every finished check)
    python -m isnad_worker.seed demo-checks                            restore them (idempotent; part of `make seed`)

Rows reference newsrooms, users, desks, indicators and entities by slug/email/name; check, claim and
result ids are kept. Media checks are restored from the clips in sample-data/media; without the clip
the check is skipped. Restored checks are never re-queued for processing.
"""

from __future__ import annotations

import gzip
import json
import logging
import tempfile
from pathlib import Path

from isnad_worker import db, storage
from isnad_worker.pipeline import media
from isnad_worker.seed.catalog import SAMPLE_DATA, SEED_DATA
from isnad_worker.seed.registry_snapshot import _plain

log = logging.getLogger("isnad.seed")

DATA = SEED_DATA / "demo_checks.json.gz"
MEDIA_DIR = SAMPLE_DATA / "media"

CHECK_COLUMNS = [
    "id", "title", "input_kind", "channel", "input_text", "input_url", "original_filename", "mime_type",
    "size_bytes", "recorded_at", "speakers", "dialect", "visibility", "status", "stage", "progress",
    "claim_count", "match_count", "context_count", "differs_count", "none_count", "decided_count",
    "registry_checked_at", "published_url", "published_at", "public_slug", "created_at",
]  # fmt: skip
SEGMENT_COLUMNS = ["id", "check_id", "idx", "start_ms", "end_ms", "speaker", "text", "words", "page", "low_confidence"]  # fmt: skip
CLAIM_COLUMNS = [
    "id", "check_id", "idx", "segment_id", "span_text", "span_start", "span_end", "start_ms", "end_ms",
    "speaker", "entity_text", "indicator_text", "value", "scale", "unit", "value_base", "decimals",
    "qualifier", "period_text", "period_start", "period_end", "geography", "breakdown", "claim_type",
    "attribution", "checkable", "uncheckable_reason", "review_state", "created_at",
]  # fmt: skip
RESULT_COLUMNS = [
    "claim_id", "check_id", "verdict", "differing_fields", "chain_status", "figure_id",
    "document_version_id", "evidence", "evidence_verified", "comparison", "verifier", "needs_review",
    "suggested_wording", "searched_sources", "chain", "earlier_figures", "discovered",
]  # fmt: skip
JSON_COLUMNS = {"progress", "words", "evidence", "comparison", "verifier", "searched_sources", "chain", "earlier_figures"}  # fmt: skip


def _select(table: str, columns: list[str], where: str, params: tuple) -> list[dict]:
    rows = db.fetch_all(f"select {', '.join(columns)} from public.{table} where {where}", params)
    return [{k: _plain(v) for k, v in r.items()} for r in rows]


def _fixture(row: dict) -> str | None:
    """The clip in sample-data/media a check was made from: same size, or its former file name."""
    former = {
        m["former_file"]: m["file"].removeprefix("media/")
        for m in json.loads((SAMPLE_DATA / "manifest.json").read_text(encoding="utf-8"))["media"]
        if m.get("former_file") and m.get("file")
    }
    for f in sorted(MEDIA_DIR.rglob("*")):
        if f.is_file() and f.stat().st_size == row["size_bytes"]:
            return f.relative_to(MEDIA_DIR).as_posix()
    return former.get(row.get("original_filename") or "")


def export(titles: list[str] | None = None) -> Path:
    checks = db.fetch_all(
        """
        select c.id, n.slug as newsroom, n.name as newsroom_name, n.internal as newsroom_internal,
               p.email as author, e.email as editor, d.name as desk
        from public.checks c join public.newsrooms n on n.id = c.newsroom_id
        left join public.profiles p on p.id = c.created_by
        left join public.profiles e on e.id = c.assigned_editor_id
        left join public.desks d on d.id = c.desk_id
        where (cardinality(%s::text[]) = 0 or c.title = any(%s)) and c.status <> 'processing'
        order by c.created_at
        """,
        (titles or [], titles or []),
    )
    out = []
    for c in checks:
        cid = str(c["id"])
        row = _select("checks", CHECK_COLUMNS, "id = %s", (cid,))[0]
        claims = db.fetch_all(
            """
            select cl.id, i.slug as indicator_slug, en.slug as entity_slug from public.claims cl
            left join public.indicators i on i.id = cl.indicator_id
            left join public.entities en on en.id = cl.entity_id where cl.check_id = %s
            """,
            (cid,),
        )
        slugs = {str(x["id"]): x for x in claims}
        entry = {
            "check": row
            | {
                k: c[k]
                for k in (
                    "newsroom",
                    "newsroom_name",
                    "newsroom_internal",
                    "author",
                    "editor",
                    "desk",
                )
            },
            "segments": _select("segments", SEGMENT_COLUMNS, "check_id = %s", (cid,)),
            "claims": [
                cl
                | {
                    "indicator_slug": slugs[cl["id"]]["indicator_slug"],
                    "entity_slug": slugs[cl["id"]]["entity_slug"],
                }
                for cl in _select("claims", CLAIM_COLUMNS, "check_id = %s", (cid,))
            ],
            "results": _select("claim_results", RESULT_COLUMNS, "check_id = %s", (cid,)),
            "decisions": [
                {k: _plain(v) for k, v in d.items()}
                for d in db.fetch_all(
                    """
                    select d.claim_id, p.email as user_email, d.action, d.note, d.wording, d.created_at
                    from public.decisions d left join public.profiles p on p.id = d.user_id
                    where d.check_id = %s order by d.created_at
                    """,
                    (cid,),
                )
            ],
            "comments": [
                {k: _plain(v) for k, v in x.items()}
                for x in db.fetch_all(
                    """
                    select x.id, x.claim_id, p.email as user_email, x.body, x.created_at
                    from public.comments x left join public.profiles p on p.id = x.user_id
                    where x.check_id = %s order by x.created_at
                    """,
                    (cid,),
                )
            ],
            "publications": [
                {k: _plain(v) for k, v in x.items()}
                for x in db.fetch_all(
                    """
                    select x.id, x.url, x.published_at, p.email as user_email
                    from public.publications x left join public.profiles p on p.id = x.created_by
                    where x.check_id = %s order by x.published_at
                    """,
                    (cid,),
                )
            ],
            "media": None,
        }
        m = db.fetch_one(
            "select has_video, duration_ms, width, height, waveform from public.media where check_id = %s",
            (cid,),
        )
        if m:
            entry["media"] = {k: _plain(v) for k, v in m.items()} | {"fixture": _fixture(row)}
        out.append(entry)
    with gzip.open(DATA, "wt", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log.info("demo checks exported: %d → %s", len(out), DATA.name)
    return DATA


def _values(row: dict, columns: list[str]) -> list:
    return [
        db.json(row[c]) if c in JSON_COLUMNS and row[c] is not None else row[c] for c in columns
    ]


def _insert(conn, table: str, columns: list[str], row: dict, extra: dict | None = None) -> None:
    extra = extra or {}
    names = columns + list(extra)
    conn.execute(
        f"insert into public.{table} ({', '.join(names)}) values ({', '.join(['%s'] * len(names))}) on conflict do nothing",
        _values(row, columns) + list(extra.values()),
    )


def _restore_media(check: dict, newsroom_id: str, info: dict) -> dict | None:
    """Upload the clip and its web copy, poster and waveform; returns the media row values."""
    source = MEDIA_DIR / (info.get("fixture") or "")
    if not info.get("fixture") or not source.is_file():
        return None
    base = f"{newsroom_id}/{check['id']}"
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        storage.upload_file(
            storage.MEDIA, f"{base}/original{source.suffix}", source, check["mime_type"]
        )
        if info["has_video"]:
            web = media.web_video(source, work / "web.mp4")
            poster = media.poster(
                source, work / "poster.jpg", min(5.0, (info["duration_ms"] or 0) / 4000)
            )
            storage.upload_file(storage.MEDIA, f"{base}/web.mp4", web, "video/mp4")
            storage.upload_file(storage.MEDIA, f"{base}/poster.jpg", poster, "image/jpeg")
            return {
                "video_path": f"{base}/web.mp4",
                "audio_path": None,
                "poster_path": f"{base}/poster.jpg",
                "storage_path": f"{base}/original{source.suffix}",
            }
        web = media.web_audio(source, work / "web.m4a")
        storage.upload_file(storage.MEDIA, f"{base}/web.m4a", web, "audio/mp4")
        return {
            "video_path": None,
            "audio_path": f"{base}/web.m4a",
            "poster_path": None,
            "storage_path": f"{base}/original{source.suffix}",
        }


def restore() -> None:
    if not DATA.exists():
        log.info("no demo checks; skipped")
        return
    with gzip.open(DATA, "rt", encoding="utf-8") as f:
        entries = json.load(f)
    users = {
        r["email"]: str(r["id"]) for r in db.fetch_all("select id, email from public.profiles")
    }
    newsrooms = {
        r["slug"]: str(r["id"]) for r in db.fetch_all("select id, slug from public.newsrooms")
    }
    figures = {str(r["id"]) for r in db.fetch_all("select id from public.figures")}
    versions = {str(r["id"]) for r in db.fetch_all("select id from public.document_versions")}
    indicators = {
        r["slug"]: str(r["id"]) for r in db.fetch_all("select id, slug from public.indicators")
    }
    entities = {
        r["slug"]: str(r["id"]) for r in db.fetch_all("select id, slug from public.entities")
    }
    restored = 0
    for e in entries:
        c = e["check"]
        if c["newsroom"] not in newsrooms and c.get("newsroom_name"):
            # A newsroom the demo seed does not create (the evaluation runs' internal newsroom).
            row = db.fetch_one(
                "insert into public.newsrooms (slug, name, internal) values (%s, %s, %s) on conflict (slug) do update set name = excluded.name returning id",
                (c["newsroom"], c["newsroom_name"], bool(c.get("newsroom_internal"))),
            )
            newsrooms[c["newsroom"]] = str(row["id"])
        newsroom_id = newsrooms.get(c["newsroom"])
        if not newsroom_id or db.fetch_one("select 1 from public.checks where id = %s", (c["id"],)):
            continue
        media_paths = None
        if e["media"]:
            media_paths = _restore_media(c, newsroom_id, e["media"])
            if media_paths is None:
                log.warning(
                    "skipped %s: clip %s not found in %s (run `make media`)",
                    c["title"],
                    e["media"].get("fixture"),
                    MEDIA_DIR,
                )
                continue
        desk = (
            db.fetch_one(
                "select id from public.desks where newsroom_id = %s and name = %s",
                (newsroom_id, c["desk"]),
            )
            if c["desk"]
            else None
        )
        with db.transaction() as conn:
            _insert(conn, "checks", CHECK_COLUMNS, c, {
                "newsroom_id": newsroom_id,
                "created_by": users.get(c["author"]),
                "assigned_editor_id": users.get(c["editor"]) if c["editor"] else None,
                "desk_id": desk["id"] if desk else None,
                "storage_path": media_paths["storage_path"] if media_paths else None,
            })  # fmt: skip
            # Inserting a check queues it for processing; these are already processed.
            conn.execute(
                "delete from public.jobs where dedupe_key = %s and status = 'queued'",
                (f"check:{c['id']}",),
            )
            if media_paths:
                m = e["media"]
                conn.execute(
                    """
                    insert into public.media (check_id, has_video, duration_ms, width, height, video_path, audio_path, poster_path, waveform)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (c["id"], m["has_video"], m["duration_ms"], m["width"], m["height"], media_paths["video_path"],
                     media_paths["audio_path"], media_paths["poster_path"], db.json(m["waveform"])),
                )  # fmt: skip
            for s in e["segments"]:
                _insert(conn, "segments", SEGMENT_COLUMNS, s)
            for cl in e["claims"]:
                _insert(conn, "claims", CLAIM_COLUMNS, cl, {
                    "indicator_id": indicators.get(cl["indicator_slug"] or ""),
                    "entity_id": entities.get(cl["entity_slug"] or ""),
                })  # fmt: skip
            for r in e["results"]:
                r = r | {
                    "figure_id": r["figure_id"] if r["figure_id"] in figures else None,
                    "document_version_id": r["document_version_id"]
                    if r["document_version_id"] in versions
                    else None,
                }
                _insert(conn, "claim_results", RESULT_COLUMNS, r)
            for d in e["decisions"]:
                conn.execute(
                    "insert into public.decisions (check_id, claim_id, user_id, action, note, wording, created_at) values (%s, %s, %s, %s, %s, %s, %s)",
                    (c["id"], d["claim_id"], users.get(d["user_email"] or ""), d["action"], d["note"], d["wording"], d["created_at"]),
                )  # fmt: skip
            for x in e.get("comments", []):
                conn.execute(
                    "insert into public.comments (id, check_id, claim_id, user_id, body, created_at) values (%s, %s, %s, %s, %s, %s) on conflict do nothing",
                    (x["id"], c["id"], x["claim_id"], users.get(x["user_email"] or ""), x["body"], x["created_at"]),
                )  # fmt: skip
            publications = e.get("publications")
            if publications is None and c["status"] == "published" and c["published_url"]:
                publications = [{"id": None, "url": c["published_url"], "published_at": c["published_at"], "user_email": c["editor"] or c["author"]}]  # fmt: skip
            for x in publications or []:
                conn.execute(
                    "insert into public.publications (id, check_id, url, published_at, created_by) values (coalesce(%s, gen_random_uuid()), %s, %s, coalesce(%s, now()), %s) on conflict do nothing",
                    (x["id"], c["id"], x["url"], x["published_at"], users.get(x["user_email"] or "")),
                )  # fmt: skip
        restored += 1
    log.info("demo checks restored: %d of %d", restored, len(entries))
