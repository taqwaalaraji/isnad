"""Load the shared registry catalog: topics, indicators, entities and official sources.

Idempotent: rows are upserted by slug, so re-running updates names and metadata in place.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from isnad_worker import db

log = logging.getLogger("isnad.seed")

SEED_DATA = Path(__file__).resolve().parents[3] / "seed_data"
# The documents, clips and labelled claims the platform was tested with (see sample-data/README.md).
SAMPLE_DATA = Path(__file__).resolve().parents[4] / "sample-data"


def _load(name: str) -> dict:
    path = SEED_DATA / name
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def seed_topics() -> dict[str, str]:
    topics = _load("topics.json").get("topics", [])
    with db.transaction() as conn:
        for t in topics:
            conn.execute(
                """
                insert into public.topics (slug, name_ar, name_en, icon, sort_order)
                values (%(slug)s, %(name_ar)s, %(name_en)s, %(icon)s, %(sort_order)s)
                on conflict (slug) do update set
                  name_ar = excluded.name_ar, name_en = excluded.name_en,
                  icon = excluded.icon, sort_order = excluded.sort_order
                """,
                t,
            )
    log.info("topics: %d", len(topics))
    return {r["slug"]: r["id"] for r in db.fetch_all("select slug, id from public.topics")}


def seed_indicators(topic_ids: dict[str, str]) -> None:
    indicators = _load("indicators.json").get("indicators", [])
    with db.transaction() as conn:
        for i in indicators:
            conn.execute(
                """
                insert into public.indicators
                  (slug, topic_id, name_ar, name_en, aliases, definition_ar, unit_kind, unit, frequency)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (slug) do update set
                  topic_id = excluded.topic_id, name_ar = excluded.name_ar, name_en = excluded.name_en,
                  aliases = excluded.aliases, definition_ar = coalesce(excluded.definition_ar, public.indicators.definition_ar),
                  unit_kind = excluded.unit_kind, unit = excluded.unit, frequency = excluded.frequency
                """,
                (
                    i["slug"],
                    topic_ids.get(i["topic"]),
                    i["name_ar"],
                    i["name_en"],
                    i.get("aliases", []),
                    i.get("definition_ar"),
                    i["unit_kind"],
                    i["unit"],
                    i.get("frequency"),
                ),
            )
    log.info("indicators: %d", len(indicators))


def seed_sources(topic_ids: dict[str, str]) -> None:
    data = _load("sources.json")
    entities = data.get("entities", [])
    sources = data.get("sources", [])
    if not entities:
        log.warning("seed_data/sources.json not found or empty; skipping entities and sources")
        return
    with db.transaction() as conn:
        for e in entities:
            conn.execute(
                """
                insert into public.entities (slug, name_ar, name_en, kind, level, emirate, website, description_en)
                values (%(slug)s, %(name_ar)s, %(name_en)s, %(kind)s, %(level)s, %(emirate)s, %(website)s, %(description_en)s)
                on conflict (slug) do update set
                  name_ar = excluded.name_ar, name_en = excluded.name_en, kind = excluded.kind,
                  level = excluded.level, emirate = excluded.emirate, website = excluded.website,
                  description_en = excluded.description_en
                """,
                {"emirate": None, "website": None, "description_en": None, **e},
            )
        entity_ids = {
            r["slug"]: r["id"]
            for r in conn.execute("select slug, id from public.entities").fetchall()
        }
        for s in sources:
            row = conn.execute(
                """
                insert into public.sources
                  (slug, entity_id, name_ar, name_en, tier, type, homepage_url, data_url, domains,
                   access_methods, update_frequency, languages, description_en, verified_at, status)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active')
                on conflict (slug) do update set
                  entity_id = excluded.entity_id, name_ar = excluded.name_ar, name_en = excluded.name_en,
                  tier = excluded.tier, type = excluded.type, homepage_url = excluded.homepage_url,
                  data_url = excluded.data_url, domains = excluded.domains, access_methods = excluded.access_methods,
                  update_frequency = excluded.update_frequency, languages = excluded.languages,
                  description_en = excluded.description_en, verified_at = excluded.verified_at
                returning id
                """,
                (
                    s["slug"],
                    entity_ids.get(s.get("entity")),
                    s["name_ar"],
                    s["name_en"],
                    s["tier"],
                    s.get("type", "publications"),
                    s.get("homepage_url"),
                    s.get("data_url"),
                    s.get("domains", []),
                    s.get("access_methods", []),
                    s.get("update_frequency"),
                    s.get("languages", ["ar"]),
                    s.get("description_en"),
                    s.get("verified_at"),
                ),
            ).fetchone()
            conn.execute("delete from public.source_topics where source_id = %s", (row["id"],))
            for topic in s.get("topics", []):
                if topic in topic_ids:
                    conn.execute(
                        "insert into public.source_topics (source_id, topic_id) values (%s, %s) on conflict do nothing",
                        (row["id"], topic_ids[topic]),
                    )
    log.info("entities: %d, sources: %d", len(entities), len(sources))


def run() -> None:
    topic_ids = seed_topics()
    seed_indicators(topic_ids)
    seed_sources(topic_ids)
