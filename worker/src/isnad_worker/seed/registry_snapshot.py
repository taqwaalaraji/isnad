"""A snapshot of the seeded registry (corpus documents, their versions and extracted figures), so a
fresh database gets a working registry without paying for figure extraction again.

    python -m isnad_worker.seed snapshot      write seed_data/registry_snapshot.json.gz from the database
    python -m isnad_worker.seed registry      restore it (idempotent; part of `make seed`)

Rows reference sources, indicators and entities by slug (their ids change between databases). The
stored document files come from the test corpus (testdata/files/documents, matched by URL through
testdata/manifest.json); without them the registry still works, only "open the original copy" is
unavailable for those documents.
"""

from __future__ import annotations

import gzip
import json
import logging
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from isnad_worker import db, storage
from isnad_worker.seed.catalog import SEED_DATA

log = logging.getLogger("isnad.seed")

SNAPSHOT = SEED_DATA / "registry_snapshot.json.gz"
ROOT = Path(__file__).resolve().parents[4]
CORPUS = ROOT / "testdata"

DOCUMENT_COLUMNS = ["id", "title", "url", "kind", "language", "published_at", "watch"]
VERSION_COLUMNS = [
    "id",
    "document_id",
    "version",
    "content_hash",
    "mime_type",
    "size_bytes",
    "page_count",
    "fetched_at",
    "fetched_via",
    "text_content",
    "text_normalized",
    "tables",
    "extraction_status",
    "figures_count",
    "previous_version_id",
]
FIGURE_COLUMNS = [
    "id",
    "document_version_id",
    "document_id",
    "value",
    "scale",
    "decimals",
    "value_base",
    "unit",
    "period_start",
    "period_end",
    "period_label",
    "geography",
    "breakdown",
    "measure",
    "status",
    "location",
    "quote",
    "quote_verified",
    "review_status",
    "reviewed_at",
    "review_note",
    "supersedes_id",
    "is_current",
    "published_at",
]


def _plain(value: object) -> object:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if hasattr(value, "hex") and type(value).__name__ == "UUID":
        return str(value)
    return value


def _rows(query: str) -> list[dict]:
    return [{k: _plain(v) for k, v in row.items()} for row in db.fetch_all(query)]


def export() -> Path:
    """Shared-registry documents read by the seed (fetched_via = 'seed'), with their figures."""
    documents = _rows(
        f"""
        select {", ".join("d." + c for c in DOCUMENT_COLUMNS)}, s.slug as source_slug
        from public.documents d join public.sources s on s.id = d.source_id
        where d.newsroom_id is null
          and exists (select 1 from public.document_versions v
                      where v.document_id = d.id and v.fetched_via = 'seed')
        order by d.created_at
        """
    )
    ids = [d["id"] for d in documents]
    versions = _rows(
        f"""
        select {", ".join(VERSION_COLUMNS)} from public.document_versions
        where fetched_via = 'seed' and document_id = any('{{{",".join(ids)}}}'::uuid[])
        order by document_id, version
        """
    )
    version_ids = {v["id"] for v in versions}
    figures = [
        f
        for f in _rows(
            f"""
            select {", ".join("f." + c for c in FIGURE_COLUMNS)},
                   s.slug as source_slug, i.slug as indicator_slug, e.slug as entity_slug
            from public.figures f
            join public.sources s on s.id = f.source_id
            left join public.indicators i on i.id = f.indicator_id
            left join public.entities e on e.id = f.entity_id
            where f.newsroom_id is null and f.review_status in ('approved', 'pending')
            order by f.created_at
            """
        )
        if f["document_version_id"] in version_ids
    ]
    figure_ids = {f["id"] for f in figures}
    for f in figures:  # links to figures outside the snapshot are dropped
        if f["supersedes_id"] not in figure_ids:
            f["supersedes_id"] = None
    for v in versions:
        if v["previous_version_id"] not in version_ids:
            v["previous_version_id"] = None
    payload = {"documents": documents, "versions": versions, "figures": figures}
    with gzip.open(SNAPSHOT, "wt", encoding="utf-8") as out:
        json.dump(payload, out, ensure_ascii=False, separators=(",", ":"))
    log.info(
        "snapshot: %d documents, %d versions, %d figures → %s",
        len(documents),
        len(versions),
        len(figures),
        SNAPSHOT.name,
    )
    return SNAPSHOT


def _corpus_files() -> dict[str, Path]:
    manifest = CORPUS / "manifest.json"
    if not manifest.exists():
        return {}
    files = {}
    for doc in json.loads(manifest.read_text(encoding="utf-8"))["documents"]:
        path = CORPUS / "files" / "documents" / Path(doc.get("file", "")).name
        if doc.get("url") and path.is_file():
            files[doc["url"]] = path
    return files


def _ids(table: str, slugs: set[str]) -> dict[str, str]:
    rows = db.fetch_all(
        f"select slug, id from public.{table} where slug = any(%s)",
        (sorted(s for s in slugs if s),),
    )
    return {r["slug"]: str(r["id"]) for r in rows}


def restore() -> None:
    if not SNAPSHOT.exists():
        log.info("no registry snapshot; skipped")
        return
    with gzip.open(SNAPSHOT, "rt", encoding="utf-8") as src:
        data = json.load(src)
    sources = db.fetch_all("select slug, id, entity_id from public.sources")
    source_by_slug = {r["slug"]: r for r in sources}
    indicators = _ids("indicators", {f["indicator_slug"] for f in data["figures"]})
    entities = _ids("entities", {f["entity_slug"] for f in data["figures"]})
    files = _corpus_files()
    latest: dict[str, dict] = {}
    for v in data["versions"]:
        if v["document_id"] not in latest or v["version"] > latest[v["document_id"]]["version"]:
            latest[v["document_id"]] = v

    restored = skipped = uploaded = 0
    with db.transaction() as conn:
        for d in data["documents"]:
            source = source_by_slug.get(d["source_slug"])
            if not source:
                skipped += 1
                continue
            conn.execute(
                """
                insert into public.documents (id, source_id, title, url, kind, language, published_at, watch)
                values (%s, %s, %s, %s, %s, %s, %s, %s) on conflict (id) do nothing
                """,
                (
                    d["id"],
                    source["id"],
                    d["title"],
                    d["url"],
                    d["kind"],
                    d["language"],
                    d["published_at"],
                    d["watch"],
                ),
            )
            restored += 1
        known_docs = {
            str(r["id"])
            for r in conn.execute(
                "select id from public.documents where id = any(%s::uuid[])",
                ([d["id"] for d in data["documents"]],),
            ).fetchall()
        }
        doc_source = {
            d["id"]: source_by_slug[d["source_slug"]]["id"]
            for d in data["documents"]
            if d["source_slug"] in source_by_slug
        }
        for v in data["versions"]:
            if v["document_id"] not in known_docs:
                continue
            # Replaced by the uploaded copy's path below when the corpus file is available.
            path = f"{doc_source[v['document_id']]}/{v['document_id']}/v{v['version']}"
            conn.execute(
                f"""
                insert into public.document_versions ({", ".join(VERSION_COLUMNS)}, storage_path)
                values ({", ".join(["%s"] * (len(VERSION_COLUMNS) + 1))})
                on conflict (id) do nothing
                """,
                (
                    *[
                        db.json(v[c]) if c == "tables" and v[c] is not None else v[c]
                        for c in VERSION_COLUMNS
                    ],
                    path,
                ),
            )
        for doc_id, v in latest.items():
            if doc_id in known_docs:
                conn.execute(
                    "update public.documents set current_version_id = %s where id = %s and current_version_id is null",
                    (v["id"], doc_id),
                )
        figures = [f for f in data["figures"] if f["document_id"] in known_docs]
        for f in figures:
            conn.execute(
                f"""
                insert into public.figures ({", ".join(c for c in FIGURE_COLUMNS if c != "supersedes_id")},
                                            source_id, indicator_id, entity_id)
                values ({", ".join(["%s"] * (len(FIGURE_COLUMNS) + 2))})
                on conflict (id) do nothing
                """,
                (
                    *[
                        db.json(f[c]) if c == "location" and f[c] is not None else f[c]
                        for c in FIGURE_COLUMNS
                        if c != "supersedes_id"
                    ],
                    source_by_slug[f["source_slug"]]["id"],
                    indicators.get(f["indicator_slug"]),
                    entities.get(f["entity_slug"]),
                ),
            )
        for f in figures:  # links after every figure exists
            if f["supersedes_id"]:
                conn.execute(
                    "update public.figures set supersedes_id = %s where id = %s and supersedes_id is null",
                    (f["supersedes_id"], f["id"]),
                )

    # The original copies, from the local corpus when present.
    for d in data["documents"]:
        v = latest.get(d["id"])
        source = source_by_slug.get(d["source_slug"])
        file = files.get(d["url"] or "")
        if not v or not source or not file:
            continue
        path = f"{source['id']}/{d['id']}/v{v['version']}{file.suffix.lower()}"
        try:
            storage.upload_file(storage.DOCUMENTS, path, file, v["mime_type"])
        except Exception as exc:  # already there after a previous restore
            if "Duplicate" not in str(exc) and "409" not in str(exc):
                raise
        db.execute(
            "update public.document_versions set storage_path = %s where id = %s", (path, v["id"])
        )
        uploaded += 1
    log.info(
        "registry restored: %d documents (%d skipped), %d figures, %d original files",
        restored,
        skipped,
        len(data["figures"]),
        uploaded,
    )
