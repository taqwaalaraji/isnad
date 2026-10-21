"""Watching official sources: re-fetch tracked documents, store new versions, and clean up old media."""

from __future__ import annotations

import logging

from isnad_worker import db, jobs, storage
from isnad_worker.pipeline import content
from isnad_worker.registry import store

log = logging.getLogger("isnad.watch")


@jobs.handler("watch_sources")
def watch_sources(job: jobs.Job) -> None:
    """Queue a re-fetch for watched documents that are due: how often depends on how often the
    source publishes (a daily source daily, an annual one monthly), measured from the last fetch."""
    rows = db.fetch_all(
        """
        select d.id from public.documents d
        join public.sources s on s.id = d.source_id
        left join public.document_versions v on v.id = d.current_version_id
        where d.watch and d.url is not null and s.status = 'active'
          and coalesce(v.fetched_at, '-infinity') < now() - case s.update_frequency
                when 'daily' then interval '20 hours'
                when 'weekly' then interval '3 days'
                when 'monthly' then interval '7 days'
                when 'quarterly' then interval '14 days'
                when 'annual' then interval '30 days'
                else interval '7 days'
              end
        """
    )
    for row in rows:
        jobs.enqueue(
            "refetch_document", {"document_id": str(row["id"])}, dedupe_key=f"refetch:{row['id']}"
        )
    log.info("queued %d documents for re-fetch", len(rows))


@jobs.handler("refetch_document")
def refetch_document(job: jobs.Job) -> None:
    document = db.fetch_one(
        """
        select d.*, s.newsroom_id as source_newsroom_id from public.documents d
        join public.sources s on s.id = d.source_id where d.id = %s
        """,
        (job.payload["document_id"],),
    )
    if not document or not document["url"]:
        return
    try:
        download = content.download(document["url"])
    except jobs.PermanentError as exc:
        db.execute(
            "update public.sources set health = 'warning', health_note = %s where id = %s",
            (str(exc)[:300], document["source_id"]),
        )
        return
    kind = content.kind_for(download.content_type, download.url)
    before = document["current_version_id"]
    version = store.store_version(
        source_id=str(document["source_id"]),
        newsroom_id=str(document["newsroom_id"]) if document["newsroom_id"] else None,
        title=document["title"],
        url=document["url"],
        kind=kind,
        data=download.content,
        fetched_via="schedule",
    )
    db.execute(
        "update public.sources set last_fetched_at = now(), health = 'healthy', health_note = null where id = %s",
        (document["source_id"],),
    )
    if str(version["id"]) != str(before):
        jobs.enqueue(
            "ingest_document",
            {"version_id": str(version["id"])},
            dedupe_key=f"ingest:{version['id']}",
        )
        followers = db.fetch_all(
            """
            select f.user_id, f.newsroom_id from public.follows f
            join public.sources s on s.entity_id = f.target_id and f.target_type = 'entity'
            where s.id = %s
            """,
            (document["source_id"],),
        )
        for f in followers:
            db.execute(
                "insert into public.alerts (newsroom_id, user_id, kind, title, payload) values (%s, %s, 'new_release', %s, %s)",
                (
                    f["newsroom_id"],
                    f["user_id"],
                    document["title"],
                    db.json({"document_id": str(document["id"])}),
                ),
            )


@jobs.handler("retention_cleanup")
def retention_cleanup(job: jobs.Job) -> None:
    """Delete uploaded media older than each newsroom's retention period (results and text stay)."""
    rows = db.fetch_all(
        """
        select c.id, c.storage_path from public.checks c
        join public.newsrooms n on n.id = c.newsroom_id
        where c.storage_path is not null and c.input_kind in ('video', 'audio')
          and c.created_at < now() - make_interval(days => n.media_retention_days)
        limit 500
        """
    )
    for row in rows:
        base = row["storage_path"].rsplit("/", 1)[0]
        try:
            storage.remove(storage.MEDIA, storage.list_prefix(storage.MEDIA, base))
        except Exception:
            log.exception("couldn't delete media for check %s", row["id"])
            continue
        db.execute("update public.checks set storage_path = null where id = %s", (row["id"],))
        db.execute(
            "update public.media set video_path = null, audio_path = null, poster_path = null where check_id = %s",
            (row["id"],),
        )
    if rows:
        log.info("retention: removed media for %d checks", len(rows))
