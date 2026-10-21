"""The indicator and entity catalog, rendered for prompts and resolved by slug or by name."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from isnad_worker import db
from isnad_worker.text import normalize

_TTL = 300.0
_lock = threading.Lock()
_cache: tuple[float, Catalog | None] = (0.0, None)


@dataclass(frozen=True)
class Catalog:
    indicators: dict[str, dict]  # slug -> row
    entities: dict[str, dict]
    indicators_text: str
    entities_text: str

    def indicator_id(self, slug: str | None) -> str | None:
        return self.indicators[slug]["id"] if slug and slug in self.indicators else None

    def entity_id(self, slug: str | None) -> str | None:
        return self.entities[slug]["id"] if slug and slug in self.entities else None


def load() -> Catalog:
    global _cache
    with _lock:
        loaded_at, catalog = _cache
        if catalog is not None and time.monotonic() - loaded_at < _TTL:
            return catalog
        indicators = db.fetch_all(
            "select id, slug, name_ar, name_en, aliases, unit, unit_kind from public.indicators order by slug"
        )
        entities = db.fetch_all(
            "select id, slug, name_ar, name_en, kind, level from public.entities order by slug"
        )
        indicators_text = "\n".join(
            f"{i['slug']} | {i['name_ar']} | {i['name_en']} | {', '.join(i['aliases'][:8])} | {i['unit']}"
            for i in indicators
        )
        entities_text = "\n".join(
            f"{e['slug']} | {e['name_ar']} | {e['name_en']}" for e in entities
        )
        catalog = Catalog(
            {i["slug"]: i for i in indicators},
            {e["slug"]: e for e in entities},
            indicators_text or "(none yet)",
            entities_text or "(none yet)",
        )
        _cache = (time.monotonic(), catalog)
        return catalog


def invalidate() -> None:
    global _cache
    with _lock:
        _cache = (0.0, None)


def match_indicator(name: str | None) -> str | None:
    """Closest indicator by name and aliases (trigram similarity), when the model gave no slug."""
    if not name:
        return None
    row = db.fetch_one(
        """
        select id, extensions.similarity(search_text, %s) as score
        from public.indicators
        where search_text operator(extensions.%%) %s
        order by score desc
        limit 1
        """,
        (normalize(name), normalize(name)),
    )
    return row["id"] if row and row["score"] >= 0.35 else None


def match_entity(name: str | None) -> str | None:
    if not name:
        return None
    row = db.fetch_one(
        """
        select id, extensions.similarity(search_text, %s) as score
        from public.entities
        where search_text operator(extensions.%%) %s
        order by score desc
        limit 1
        """,
        (normalize(name), normalize(name)),
    )
    return row["id"] if row and row["score"] >= 0.35 else None
