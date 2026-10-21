from isnad_worker.pipeline import discovery

DOMAINS = ["dubaidet.gov.ae", "dsc.gov.ae"]


def test_only_allowlisted_hosts_and_subdomains():
    assert discovery.in_domains("https://www.dubaidet.gov.ae/en/report", DOMAINS)
    assert discovery.in_domains("https://dsc.gov.ae/ar/page", DOMAINS)
    assert not discovery.in_domains("https://dubaidet.gov.ae.example.com/x", DOMAINS)
    assert not discovery.in_domains("https://example.com/dsc.gov.ae", DOMAINS)


def test_candidates_are_search_results_on_the_allowlist_without_home_pages():
    grounded = [
        "https://www.dsc.gov.ae/en/real-report",
        "https://news.example.com/story",
        "https://www.dubaidet.gov.ae/",
        "https://www.dsc.gov.ae/en/real-report",
        "https://www.dubaidet.gov.ae/en/other",
    ]
    assert discovery.candidate_urls(grounded, DOMAINS) == [
        "https://www.dsc.gov.ae/en/real-report",
        "https://www.dubaidet.gov.ae/en/other",
    ]


def test_candidates_are_capped():
    grounded = [f"https://dsc.gov.ae/{i}" for i in range(10)]
    assert len(discovery.candidate_urls(grounded, DOMAINS)) == discovery.MAX_CANDIDATES


def test_the_search_question_carries_the_terms_period_and_site_filters():
    prompt = discovery.search_prompt(
        {
            "statistic": "عدد سكان إمارة الشارقة",
            "geography": "Sharjah",
            "period": {"as_stated": "عام 2022", "start": "2022-01-01", "end": "2022-12-31"},
        },
        ["sharjah.ae", "dsc.gov.ae", "wam.ae", "sharjah24.ae"],
    )
    assert "عدد سكان إمارة الشارقة 2022?" in prompt  # the place is already in the statistic
    assert "site:sharjah.ae OR site:dsc.gov.ae OR site:wam.ae OR site:sharjah24.ae)" in prompt
    national = discovery.search_prompt(
        {"statistic": "عدد الزوار", "geography": "Dubai", "period": {"as_stated": "هذا العام"}},
        ["a.ae"],
    )
    assert "عدد الزوار دبي هذا العام?" in national


def test_short_documents_are_read_whole():
    assert discovery.passages("أ\n\nب", None, []) == "أ\n\nب"
    assert discovery.passages("", ["p1", "p2"], []) == "[Page 1]\np1\n\n[Page 2]\np2"


def test_long_documents_keep_the_relevant_pages_in_order(monkeypatch):
    monkeypatch.setattr(discovery, "MAX_READ_CHARS", 300)
    pages = [
        "مقدمة " * 40,
        "عدد الزوار الدوليين 18.72 مليون في 2024",
        "صور " * 40,
        "الزوار من الصين 2024",
    ]
    text = discovery.passages("", pages, ["الزوار", "18.72", "2024"])
    assert "[Page 2]" in text and "[Page 4]" in text
    assert "[Page 1]" not in text and "[Page 3]" not in text
    assert text.index("[Page 2]") < text.index("[Page 4]")


def test_search_terms_come_from_the_indicator_numbers_and_period():
    terms = discovery._terms(
        {
            "statistic": "عدد الزوار الدوليين",
            "catalog_indicator": {"ar": "الزوار الدوليون", "en": "International visitors"},
            "claim_as_published": "استقبلت دبي 18.72 مليون زائر",
            "period": {"start": "2024-01-01", "end": "2024-12-31"},
        }
    )
    assert (
        "18.72" in terms
        and "2024" in terms
        and "international visitors" in [t.lower() for t in terms]
    )


def test_a_figure_that_disagrees_with_the_claim_is_flagged_for_a_second_reading():
    from isnad_worker.pipeline.models import DocumentReading

    def reading(value, scale="million", unit="visitor"):
        return DocumentReading(
            found=True, title=None, published_at=None, quote="q", value=value, scale=scale,
            decimals=2, unit=unit, period_start=None, period_end=None, period_label=None,
            geography=None, measure=None, page=None, notes=None,
        )  # fmt: skip

    claim = {"value": 20000, "scale": "one", "unit": "visitor"}
    assert discovery.disagrees(claim, reading(19.59))
    assert not discovery.disagrees(
        {"value": 19.6, "scale": "million", "unit": "visitor"}, reading(19.59)
    )
    assert discovery.disagrees(
        {"value": 20, "scale": "one", "unit": "%"}, reading(79.4, "one", "%")
    )
