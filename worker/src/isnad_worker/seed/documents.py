"""Load the official documents of the test corpus (`testdata/manifest.json`) into the registry.

Each document is stored as a versioned snapshot under the trusted source that publishes it, then
read into figures by the same ingestion the scheduled fetcher uses. Re-running is cheap: unchanged
files map to their existing version (content hash) and are not read again unless `force` is set.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

from isnad_worker import db
from isnad_worker.pipeline.content import wam_article_html
from isnad_worker.registry import ingest, store

log = logging.getLogger("isnad.seed")

REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_CORPUS = REPO_ROOT / "testdata"

# Manifest entity shorthands → catalog entity slugs (used when no source covers the URL's host).
ENTITY_ALIASES = {
    "dmo": "dubai-media-office",
    "admo": "abu-dhabi-media-office",
    "moet": "ministry-of-economy",
    "mof": "ministry-of-finance",
}

# Which outlet of a publisher a document most likely came from, by file kind.
TYPE_PREFERENCE = {
    "html": ("press_releases", "news_agency", "publications", "statistics_portal"),
    "pdf": ("publications", "statistics_portal", "press_releases", "open_data_portal"),
    "xlsx": ("statistics_portal", "open_data_portal", "publications", "dashboard"),
    "csv": ("open_data_portal", "statistics_portal", "publications", "dashboard"),
}


@dataclass
class Outcome:
    document: str
    figures: int = 0
    skipped: bool = False
    reverified: int = 0
    error: str | None = None
    seconds: float = 0.0


def first_date(value: str | None) -> str | None:
    """The first ISO date in a manifest field ("2026-07-27 (PDF creation date; ...)" → 2026-07-27)."""
    match = re.search(r"\d{4}-\d{2}-\d{2}", value or "")
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(0)).isoformat()
    except ValueError:
        return None


def corpus_dir() -> Path:
    return Path(os.environ.get("ISNAD_CORPUS_DIR") or DEFAULT_CORPUS)


def _covers(domains: list[str], host: str) -> bool:
    host = host.lower()
    return any(
        host == d.lower().lstrip(".") or host.endswith("." + d.lower().lstrip(".")) for d in domains
    )


def pick_source(sources: list[dict], *, url: str, kind: str, language: str) -> dict | None:
    """The best trusted source for a document: its host, then tier, outlet type and language."""
    host = urlparse(url).hostname or ""
    matching = [s for s in sources if _covers(s.get("domains") or [], host)]
    if not matching:
        return None
    preference = TYPE_PREFERENCE.get(kind, TYPE_PREFERENCE["html"])
    english = language == "en"

    def rank(s: dict) -> tuple:
        kind_rank = preference.index(s["type"]) if s["type"] in preference else len(preference)
        lang_rank = 0 if s["slug"].endswith("-en") == english else 1
        return (s["tier"], kind_rank, lang_rank, s["slug"])

    return min(matching, key=rank)


def _shared_sources() -> list[dict]:
    return db.fetch_all(
        """
        select s.id, s.slug, s.type, s.tier, s.domains, e.slug as entity_slug
        from public.sources s left join public.entities e on e.id = s.entity_id
        where s.newsroom_id is null and s.status = 'active'
        """
    )


def resolve_source(doc: dict, sources: list[dict]) -> dict | None:
    kind = "html" if doc["kind"] == "json" else doc["kind"]
    language = doc.get("language") or "ar"
    for url in (doc.get("landing_url"), doc.get("url")):
        if url and (found := pick_source(sources, url=url, kind=kind, language=language)):
            return found
    entity = ENTITY_ALIASES.get(doc.get("entity_slug", ""), doc.get("entity_slug"))
    by_entity = [s for s in sources if s["entity_slug"] == entity]
    if not by_entity:
        return None
    preference = TYPE_PREFERENCE.get(kind, TYPE_PREFERENCE["html"])
    return min(
        by_entity,
        key=lambda s: (
            s["tier"],
            preference.index(s["type"]) if s["type"] in preference else len(preference),
        ),
    )


def _store(doc: dict, source: dict, root: Path) -> dict:
    data = (root / doc["file"]).read_bytes()
    kind = doc["kind"]
    url = doc.get("url")
    published = first_date(doc.get("published_at"))
    if kind == "json":
        page, date = wam_article_html(data)
        data, kind, url = page.encode("utf-8"), "html", doc.get("landing_url") or url
        published = published or date
    language = doc.get("language") or "ar"
    return store.store_version(
        source_id=str(source["id"]),
        newsroom_id=None,
        title=(doc.get("title_en") if language == "en" else doc.get("title_ar"))
        or doc.get("title_en")
        or doc["id"],
        url=url,
        kind=kind,
        data=data,
        fetched_via="seed",
        published_at=published,
        language="en" if language == "en" else "ar",
    )


def _seed_one(
    doc: dict,
    sources: list[dict],
    root: Path,
    *,
    auto_approve: bool,
    force: bool,
    reverify: bool,
) -> Outcome:
    started = time.monotonic()
    outcome = Outcome(doc["id"])
    try:
        source = resolve_source(doc, sources)
        if source is None:
            raise LookupError(f"no trusted source for {doc.get('url')}")
        version = _store(doc, source, root)
        if version["extraction_status"] == "extracted" and not force:
            outcome.skipped = True
            outcome.figures = version["figures_count"] or 0
            if reverify:
                _, outcome.reverified = ingest.reverify(
                    str(version["id"]), auto_approve=auto_approve
                )
        else:
            outcome.figures = ingest.ingest(str(version["id"]), auto_approve=auto_approve)
    except Exception as exc:  # one bad document shouldn't stop the corpus
        log.exception("document %s failed", doc["id"])
        outcome.error = f"{type(exc).__name__}: {exc}"[:300]
    outcome.seconds = time.monotonic() - started
    return outcome


def run(
    *,
    auto_approve: bool = True,
    only: list[str] | None = None,
    force: bool = False,
    reverify: bool = False,
    concurrency: int = 3,
) -> list[Outcome]:
    root = corpus_dir()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    documents = [d for d in manifest["documents"] if not only or d["id"] in only]
    missing = [d["id"] for d in documents if not (root / d["file"]).exists()]
    if missing:
        log.warning(
            "%d corpus files are missing under %s: %s", len(missing), root, ", ".join(missing)
        )
    documents = [d for d in documents if d["id"] not in missing]
    sources = _shared_sources()
    since = db.fetch_one("select now() as t")["t"]

    outcomes: list[Outcome] = []
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        futures = [
            pool.submit(
                _seed_one,
                d,
                sources,
                root,
                auto_approve=auto_approve,
                force=force,
                reverify=reverify,
            )
            for d in documents
        ]
        for future in as_completed(futures):
            outcome = future.result()
            outcomes.append(outcome)
            log.info(
                "%-40s %s",
                outcome.document,
                outcome.error
                or f"{outcome.figures} figures{' (unchanged)' if outcome.skipped else ''}"
                f"{f', {outcome.reverified} newly verified' if outcome.reverified else ''} "
                f"in {outcome.seconds:.0f}s",
            )

    cost = db.fetch_one(
        "select coalesce(sum(cost_usd), 0) as usd from public.usage_events "
        "where task = 'extract_figures' and created_at >= %s",
        (since,),
    )["usd"]
    failed = [o for o in outcomes if o.error]
    log.info(
        "documents: %d, figures: %d, failed: %d, model cost: $%.2f",
        len(outcomes),
        sum(o.figures for o in outcomes),
        len(failed),
        cost,
    )
    return sorted(outcomes, key=lambda o: o.document)
