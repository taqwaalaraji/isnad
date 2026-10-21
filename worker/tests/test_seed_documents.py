import json

from isnad_worker.seed import documents

SOURCES = [
    {
        "id": 1,
        "slug": "moet-media-centre",
        "type": "press_releases",
        "tier": 2,
        "domains": ["moet.gov.ae"],
        "entity_slug": "ministry-of-economy",
    },
    {
        "id": 2,
        "slug": "moet-publications",
        "type": "publications",
        "tier": 2,
        "domains": ["moet.gov.ae"],
        "entity_slug": "ministry-of-economy",
    },
    {
        "id": 3,
        "slug": "moet-open-data",
        "type": "open_data_portal",
        "tier": 2,
        "domains": ["moet.gov.ae"],
        "entity_slug": "ministry-of-economy",
    },
    {
        "id": 4,
        "slug": "scad-news",
        "type": "press_releases",
        "tier": 1,
        "domains": ["scad.gov.ae"],
        "entity_slug": "scad",
    },
    {
        "id": 5,
        "slug": "scad-statistics",
        "type": "statistics_portal",
        "tier": 1,
        "domains": ["scad.gov.ae"],
        "entity_slug": "scad",
    },
    {
        "id": 6,
        "slug": "wam-ar",
        "type": "news_agency",
        "tier": 3,
        "domains": ["wam.ae"],
        "entity_slug": "wam",
    },
    {
        "id": 7,
        "slug": "wam-en",
        "type": "news_agency",
        "tier": 3,
        "domains": ["wam.ae"],
        "entity_slug": "wam",
    },
    {
        "id": 8,
        "slug": "dubai-media-office-news",
        "type": "press_releases",
        "tier": 3,
        "domains": ["mediaoffice.ae"],
        "entity_slug": "dubai-media-office",
    },
]


def _doc(**kw):
    return {"id": "x", "kind": "html", "language": "ar", "entity_slug": "", **kw}


def test_source_by_host_and_kind():
    pick = lambda **kw: documents.resolve_source(_doc(**kw), SOURCES)["slug"]
    assert pick(url="https://www.moet.gov.ae/ar/-/news") == "moet-media-centre"
    assert pick(url="https://www.moet.gov.ae/documents/x.pdf", kind="pdf") == "moet-publications"
    assert pick(url="https://www.moet.gov.ae/documents/x.xlsx", kind="xlsx") == "moet-open-data"
    assert pick(url="https://www.scad.gov.ae/documents/t.xlsx", kind="xlsx") == "scad-statistics"
    assert pick(url="https://www.wam.ae/en/article/x", language="en") == "wam-en"
    assert pick(url="https://www.wam.ae/api/app/articles/x", kind="json") == "wam-ar"


def test_source_by_entity_alias_when_host_unknown():
    doc = _doc(url="https://example.org/x", entity_slug="dmo")
    assert documents.resolve_source(doc, SOURCES)["slug"] == "dubai-media-office-news"
    assert documents.resolve_source(_doc(url="https://example.org/x"), SOURCES) is None


def test_subdomains_match_but_lookalikes_do_not():
    assert documents.pick_source(
        SOURCES, url="https://data.scad.gov.ae/x", kind="html", language="ar"
    )
    assert (
        documents.pick_source(SOURCES, url="https://notscad.gov.ae/x", kind="html", language="ar")
        is None
    )


def test_wam_article_json_becomes_html():
    raw = json.dumps(
        {
            "title": "156.8 مليون مسافر عبر مطارات الدولة",
            "articleDate": "2026-07-10T12:00:00+04:00",
            "body": "<p>ارتفع إجمالي حركة المسافرين إلى 156.8 مليون مسافر</p>",
        },
        ensure_ascii=False,
    ).encode()
    page, date = documents.wam_article_html(raw)
    assert date == "2026-07-10"
    assert "<title>156.8 مليون مسافر عبر مطارات الدولة</title>" in page
    assert "<p>ارتفع إجمالي حركة المسافرين إلى 156.8 مليون مسافر</p>" in page


def test_first_date_from_free_text():
    assert (
        documents.first_date("2026-07-27 (PDF creation date; uploaded 2026-08-06)") == "2026-07-27"
    )
    assert documents.first_date(None) is None


def test_first_date_rejects_partial_and_invalid_dates():
    assert documents.first_date("2026-04 (metadata 'Last Update Date: ابريل 2026')") is None
    assert documents.first_date("2026-13-45") is None
