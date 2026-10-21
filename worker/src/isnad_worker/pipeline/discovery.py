"""On-demand discovery: when the registry has no figure, search trusted official domains only.

Two steps, so a source can't be invented:
1. Search: code writes the query (statistic, place, period, site: filters for the most relevant
   official domains) and the model runs it with Google Search. Only the pages the search really
   returned are kept, so a remembered or invented link can't become a source.
2. Read: code downloads each candidate itself (re-checking the allowlist), keeps the passages that
   mention the indicator or the number, and the model reads only those for the figure. The figure
   is accepted only if its quote and value are really in the downloaded document.
Discovered figures are usable as evidence for this check and wait for curator review before they
join the shared registry.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from decimal import Decimal
from urllib.parse import urlparse

import httpx2 as httpx
from google.genai import types

from isnad_worker import db
from isnad_worker.ai import gateway
from isnad_worker.config import settings
from isnad_worker.jobs import PermanentError
from isnad_worker.pipeline import content as content_mod
from isnad_worker.pipeline.evidence import repair_quote, verify_against_document
from isnad_worker.pipeline.models import DocumentReading
from isnad_worker.pipeline.review import PLACE_AR
from isnad_worker.registry import store
from isnad_worker.text import SCALES, find_numbers, normalize, normalize_unit, period_label

log = logging.getLogger("isnad.discovery")

MAX_DOMAINS = 60
MAX_CANDIDATES = 3
# The query's site: filter: this many producers and relays (the most relevant first).
SEARCH_PRODUCERS = 4
SEARCH_RELAYS = 2
# Text the reader gets from one document: the whole of a short one, the best passages of a long one.
MAX_READ_CHARS = 40_000
GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com"

READ_SYSTEM = """You read an official document to find one statistic cited in UAE media.

Find the figure for exactly the indicator, period and geography described. Report what the
document says, not what the claim says: copy the quote verbatim from the document (the shortest
complete sentence or table row with the number exactly as printed). If the document doesn't state
this figure, set found to false. Never estimate or compute a number yourself."""


def _ranked_sources(
    *, topic_id: str | None, entity_id: str | None, geography: str | None, newsroom_id: str
) -> list[dict]:
    """Active sources, most relevant first: the claim's entity, its topic, its emirate (or
    federal), then tier."""
    rows = db.fetch_all(
        """
        select s.domains, s.tier, e.emirate, e.level,
               exists (select 1 from public.source_topics st where st.source_id = s.id and st.topic_id = %(topic)s) as topical,
               s.entity_id = %(entity)s as entity_match
        from public.sources s
        left join public.entities e on e.id = s.entity_id
        where s.status = 'active' and (s.newsroom_id is null or s.newsroom_id = %(newsroom)s)
        """,
        {"topic": topic_id, "entity": entity_id, "newsroom": newsroom_id},
    )
    emirate = (geography or "").lower().replace(" ", "_")

    def score(r: dict) -> tuple:
        return (
            not r["entity_match"],
            not r["topical"],
            not (r["emirate"] == emirate or r["level"] == "federal"),
            r["tier"],
        )

    return sorted(rows, key=score)


def _domains(row: dict) -> list[str]:
    return [d for d in (x.lower().strip().lstrip(".") for x in row["domains"]) if d and "." in d]


def allowed_domains(
    *, topic_id: str | None, entity_id: str | None, geography: str | None, newsroom_id: str
) -> list[str]:
    domains: list[str] = []
    for row in _ranked_sources(
        topic_id=topic_id, entity_id=entity_id, geography=geography, newsroom_id=newsroom_id
    ):
        domains += [d for d in _domains(row) if d not in domains]
        if len(domains) >= MAX_DOMAINS:
            break
    return domains[:MAX_DOMAINS]


def search_sites(
    *, topic_id: str | None, entity_id: str | None, geography: str | None, newsroom_id: str
) -> list[str]:
    """The query's site: filter: the best-ranked producers, then the relays (tier 3: the news
    agency, the emirate's media office) that republish most official statistics."""
    producers: list[str] = []
    relays: list[str] = []
    for row in _ranked_sources(
        topic_id=topic_id, entity_id=entity_id, geography=geography, newsroom_id=newsroom_id
    ):
        for d in _domains(row):
            if not any(d == x or d.endswith("." + x) for x in producers + relays):
                (relays if row["tier"] >= 3 else producers).append(d)
    return producers[:SEARCH_PRODUCERS] + relays[:SEARCH_RELAYS]


def discover(claim: dict, *, newsroom_id: str, ctx: gateway.CallContext) -> str | None:
    """Try to find and register an official figure for the claim. Returns the new figure id or None."""
    if not settings.discovery_enabled:
        return None
    indicator = (
        db.fetch_one(
            "select id, topic_id, name_ar, name_en, unit from public.indicators where id = %s",
            (claim["indicator_id"],),
        )
        if claim.get("indicator_id")
        else None
    )
    scope = {
        "topic_id": indicator["topic_id"] if indicator else None,
        "entity_id": claim.get("entity_id"),
        "geography": claim.get("geography"),
        "newsroom_id": newsroom_id,
    }
    sites = search_sites(**scope)
    # The relays named in the search's site: filter rank low but are always allowed.
    domains = allowed_domains(**scope)
    domains += [d for d in sites if d not in domains]
    if not domains:
        return None
    request = {
        "statistic": claim.get("indicator_text"),
        "catalog_indicator": {"ar": indicator["name_ar"], "en": indicator["name_en"]}
        if indicator
        else None,
        "entity": claim.get("entity_text"),
        "geography": claim.get("geography"),
        "period": {
            "as_stated": claim.get("period_text"),
            "start": claim.get("period_start"),
            "end": claim.get("period_end"),
        },
        "measure": claim.get("claim_type"),
        "claim_as_published": claim.get("span_text"),
    }
    for url in search(request, sites, domains, ctx):
        try:
            figure_id = _read(
                url,
                request,
                claim=claim,
                catalog_unit=indicator["unit"] if indicator else None,
                newsroom_id=newsroom_id,
                domains=domains,
                ctx=ctx,
            )
        except (PermanentError, httpx.HTTPError) as exc:
            log.info("couldn't read %s: %s", url, exc)
            continue
        if figure_id:
            return figure_id
    return None


def in_domains(url: str, domains: list[str]) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in domains)


def _resolve(uri: str) -> str | None:
    """Search results link through a Google redirect; the real page is its Location header."""
    if (urlparse(uri).hostname or "") != GROUNDING_REDIRECT_HOST:
        return uri
    try:
        response = httpx.get(uri, follow_redirects=False, timeout=15)
    except httpx.HTTPError:
        return None
    return response.headers.get("location")


def candidate_urls(grounded: list[str], domains: list[str]) -> list[str]:
    """Pages to read, in the search's order: allowlisted, deduplicated, no bare home pages."""
    urls: list[str] = []
    for u in grounded:
        if in_domains(u, domains) and urlparse(u).path.strip("/") and u not in urls:
            urls.append(u)
    return urls[:MAX_CANDIDATES]


def search_prompt(request: dict, sites: list[str]) -> str:
    """A question that needs a fresh answer (so the model really searches), with the query terms
    and site: filters written by code. Asked for links only, the model answers from memory."""
    period = request.get("period") or {}
    try:
        when = period_label(
            date.fromisoformat(str(period.get("start"))), date.fromisoformat(str(period.get("end")))
        )
    except ValueError:
        when = period.get("as_stated") or ""
    geography = request.get("geography") or ""
    place = "" if geography in ("UAE", "Other", "") else PLACE_AR.get(geography, geography)
    statistic = request.get("statistic") or (request.get("catalog_indicator") or {}).get("ar") or ""
    terms = " ".join(t for t in (statistic, *(x for x in (place, when) if x not in statistic)) if t)
    within = " OR ".join(f"site:{d}" for d in sites)
    return (
        f"According to official sources, what is the latest official figure for: {terms}? "
        f"Search Google ({within}) and cite the official pages you used."
    )


def search(
    request: dict, sites: list[str], domains: list[str], ctx: gateway.CallContext
) -> list[str]:
    """Official pages for the statistic, from Google Search. The model decides by itself whether
    to search, so a call that didn't is asked once more (it costs a few hundred tokens)."""
    prompt = search_prompt(request, sites)
    for _ in range(2):
        try:
            response = gateway.generate(
                "discover_source",
                messages=[{"role": "user", "content": prompt}],
                ctx=ctx,
                tools=[types.Tool(google_search=types.GoogleSearch())],
                max_tokens=4000,
            )
        except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
            log.info("source search unavailable: %s", exc)
            return []
        found = gateway.grounding_uris(response)
        if found:
            return candidate_urls([u for u in (_resolve(x) for x in found) if u], domains)
    log.info("the model didn't search for %r", request.get("statistic"))
    return []


def _terms(request: dict) -> list[str]:
    words = [
        request.get("statistic"),
        *(request.get("catalog_indicator") or {}).values(),
        request.get("entity"),
    ]
    terms = {normalize(w) for w in words if w and len(w) > 3}
    claim = request.get("claim_as_published") or ""
    terms |= {normalize(n.text.split()[0]) for n in find_numbers(claim)}
    period = request.get("period") or {}
    terms |= {str(d)[:4] for d in (period.get("start"), period.get("end")) if d}
    return sorted(t for t in terms if t)


def passages(text: str, page_texts: list[str] | None, terms: list[str]) -> str:
    """What the reader gets: the whole document when short, else its most relevant pages or
    paragraphs (by the indicator's words, the claim's numbers and the period's years), in order."""
    blocks = (
        [f"[Page {i}]\n{t}" for i, t in enumerate(page_texts, start=1)]
        if page_texts
        else [b for b in re.split(r"\n\s*\n", text) if b.strip()]
    )
    if sum(len(b) for b in blocks) <= MAX_READ_CHARS:
        return "\n\n".join(blocks)

    def score(block: str) -> int:
        norm = normalize(block)
        return sum(1 for t in terms if t in norm)

    ranked = sorted(range(len(blocks)), key=lambda i: -score(blocks[i]))
    keep: list[int] = []
    size = 0
    for i in ranked:
        if score(blocks[i]) == 0 or size + len(blocks[i]) > MAX_READ_CHARS:
            continue
        keep.append(i)
        size += len(blocks[i])
    return "\n\n".join(blocks[i] for i in sorted(keep))


def disagrees(claim: dict, found: DocumentReading) -> bool:
    """The figure read from the document differs from the claim's number by more than 2%."""
    if found.value is None or claim.get("value") is None:
        return False

    def base(value: object, scale: str | None, unit: str | None) -> Decimal:
        mult = Decimal(1) if normalize_unit(unit) == "%" else SCALES.get(scale or "one", Decimal(1))
        return Decimal(str(value)) * mult

    claimed = base(claim["value"], claim.get("scale"), claim.get("unit"))
    official = base(found.value, found.scale, found.unit)
    return claimed == 0 or abs(official - claimed) / abs(claimed) > Decimal("0.02")


def _read(
    url: str,
    request: dict,
    *,
    claim: dict,
    catalog_unit: str | None,
    newsroom_id: str,
    domains: list[str],
    ctx: gateway.CallContext,
) -> str | None:
    source = store.source_for_url(url, newsroom_id)
    if source is None:
        return None
    download = content_mod.download(url)
    if not in_domains(download.url, domains):
        log.warning("discovered link redirected outside the allowlist: %s", download.url)
        return None
    kind = content_mod.kind_for(download.content_type, download.url)
    extracted = store.extract(kind, download.content)
    page_texts = next(
        (t.get("pages") for t in extracted.tables if t.get("kind") == "pdf_pages"), None
    )
    text = passages(extracted.text or "", page_texts, _terms(request))
    if not text.strip():
        return None

    def read(escalate: bool) -> DocumentReading:
        return gateway.parse(
            "discover_source",
            system=READ_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(request, ensure_ascii=False, default=str)
                    + f"\n\nDocument: {download.url}\n\n{text}",
                }
            ],
            output=DocumentReading,
            ctx=ctx,
            max_tokens=4000,
            escalate=escalate,
        )

    try:
        found = read(False)
        # A figure that disagrees with the claim makes it "differs", so the stronger model reads
        # the same passages first: the cheap one sometimes takes a related number from the page.
        if found.found and disagrees(claim, found) and gateway.can_escalate("discover_source"):
            found = read(True)
    except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
        log.info("couldn't read the discovered document: %s", exc)
        return None
    if not found.found or not found.quote or found.value is None:
        return None
    value = Decimal(str(found.value))
    decimals = (
        found.decimals
        if found.decimals is not None
        else max(0, -value.normalize().as_tuple().exponent)
    )
    location = {"kind": "text", "page": found.page} if found.page else {"kind": "text"}

    def verified(quote: str) -> bool:
        return verify_against_document(
            quote=quote,
            value=value,
            decimals=decimals,
            location=location,
            text_content=extracted.text,
            tables=extracted.tables,
            page_texts=page_texts,
        )

    if not verified(found.quote):
        repaired = repair_quote(found.quote, extracted.text, value, decimals)
        if not repaired or not verified(repaired):
            log.info("discovered quote not found verbatim in the document; discarded")
            return None
        found = found.model_copy(update={"quote": repaired})
    try:
        period_start = date.fromisoformat(found.period_start or claim.get("period_start") or "")
        period_end = date.fromisoformat(found.period_end or claim.get("period_end") or "")
    except ValueError:
        return None
    version = store.store_version(
        source_id=source["id"],
        newsroom_id=source["newsroom_id"],
        title=found.title or download.url,
        url=download.url,
        kind=kind,
        data=download.content,
        fetched_via="discovery",
        published_at=found.published_at,
    )
    scale = found.scale or "one"
    unit = normalize_unit(found.unit or claim.get("unit"))
    if unit != "%" and catalog_unit:
        # Documents name the counted thing their own way (Dubai Airports counts "guests").
        unit = normalize_unit(catalog_unit)
    base = value if unit == "%" else value * SCALES.get(scale, Decimal(1))
    row = db.fetch_one(
        """
        insert into public.figures
          (document_version_id, document_id, source_id, newsroom_id, indicator_id, entity_id, value, scale, decimals,
           value_base, unit, period_start, period_end, period_label, geography, measure, status, location, quote,
           quote_verified, review_status, published_at)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'final', %s, %s, true, 'pending', %s)
        returning id
        """,
        (
            version["id"],
            version["document_id"],
            source["id"],
            source["newsroom_id"],
            claim.get("indicator_id"),
            source["entity_id"],
            value,
            scale,
            decimals,
            base,
            unit,
            period_start,
            period_end,
            period_label(period_start, period_end) or found.period_label,
            found.geography or claim.get("geography") or "UAE",
            found.measure or "level",
            db.json(location),
            found.quote,
            found.published_at,
        ),
    )
    db.execute(
        "update public.document_versions set extraction_status = 'extracted', figures_count = figures_count + 1 where id = %s",
        (version["id"],),
    )
    return str(row["id"]) if row else None
