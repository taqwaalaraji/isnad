"""Documents added by hand in the console: a link to fetch, or a file uploaded to the inbox.

`public.add_source_document` (staff only) queues `register_document`; this stores the document as a
version of its source and queues figure extraction. Uploads wait in the documents bucket under
`inbox/<uuid>/<name>` and are removed once stored.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

from isnad_worker import db, jobs, storage
from isnad_worker.pipeline import content
from isnad_worker.registry import store

log = logging.getLogger("isnad.intake")


def _in_domains(url: str, domains: list[str]) -> bool:
    host = (urlparse(url).hostname or "").lower()
    for domain in domains:
        d = domain.lower().lstrip(".")
        if host == d or host.endswith("." + d):
            return True
    return False


def _fail(source_id: str, title: str, message: str) -> None:
    """Record the failure where curators look: the source's health note."""
    db.execute(
        "update public.sources set health = 'warning', health_note = %s where id = %s",
        (f"{title}: {message}"[:300], source_id),
    )


@jobs.handler("register_document")
def register_document(job: jobs.Job) -> None:
    payload = job.payload
    source = db.fetch_one(
        "select id, newsroom_id, domains, status from public.sources where id = %s",
        (payload["source_id"],),
    )
    if not source or source["status"] == "rejected":
        raise jobs.PermanentError("source not found or rejected")
    source_id = str(source["id"])
    title = payload["title"]
    url = payload.get("url")
    staging = payload.get("staging_path")

    if url:
        # Checked when queued too; the source's domains may have changed since.
        if not _in_domains(url, source["domains"]):
            _fail(source_id, title, "the link is outside the source's domains")
            raise jobs.PermanentError("url outside the source's domains")
        try:
            download = content.download(url)
        except jobs.PermanentError as exc:
            _fail(source_id, title, str(exc))
            raise
        data, kind = download.content, content.kind_for(download.content_type, download.url)
    elif staging and staging.startswith("inbox/"):
        data = storage.download(storage.DOCUMENTS, staging)
        kind = content.kind_for("", staging)
    else:
        raise jobs.PermanentError("nothing to register")

    version = store.store_version(
        source_id=source_id,
        newsroom_id=str(source["newsroom_id"]) if source["newsroom_id"] else None,
        title=title,
        url=url,
        kind=kind,
        data=data,
        fetched_via="upload",
        fetched_by=payload.get("user_id"),
        published_at=payload.get("published_at"),
        language=payload.get("language") or "ar",
    )
    if staging:
        try:
            storage.remove(storage.DOCUMENTS, [staging])
        except Exception:
            log.exception("couldn't remove the staged upload %s", staging)
    if version["extraction_status"] == "pending":
        jobs.enqueue(
            "ingest_document",
            {"version_id": str(version["id"])},
            priority=5,
            dedupe_key=f"ingest:{version['id']}",
        )
    log.info("registered %s (%s) as version %s", title, kind, version["version"])
