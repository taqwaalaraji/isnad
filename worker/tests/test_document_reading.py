from decimal import Decimal

from isnad_worker.pipeline.content import text_from_html
from isnad_worker.pipeline.evidence import verify_against_document
from isnad_worker.text import contains_in_pdf_page, fold_pdf, is_rtl, pdf_readings

QUOTE = (
    "حقق إجمالي أصول النظام المصرفي نمواً بلغت نسبته 17.1% ليصل إلى 5.3 تريليون درهم بنهاية العام."
)
# The same sentence as a PDF text layer stores it: visual order (words reversed on the line),
# the lam-alef split ("اإلمارات"), % and the full stop moved by bidi reordering.
VISUAL_PAGE = (
    "المصرفي النظام أصول إجمالي حقق\n"
    "إلى ليصل %17.1 نسبته بلغت نمواً\n"
    ". العام بنهاية درهم تريليون 5.3"
)


def test_rtl_detection():
    assert is_rtl("الناتج المحلي 2024")
    assert not is_rtl("Gross domestic product 2024")


def test_visual_order_pdf_text_matches_logical_quote():
    assert any("حقق إجمالي أصول" in r for r in pdf_readings(VISUAL_PAGE))
    assert contains_in_pdf_page(VISUAL_PAGE, QUOTE)


def test_letter_spaced_infographic_text_matches():
    page = "بلغ عد د ا لسكا ن في دو له ا الما رات 11.29 ملي و ن نسمه"
    assert contains_in_pdf_page(page, "بلغ عدد السكان في دولة الإمارات 11.29 مليون نسمة")


def test_changed_words_or_numbers_do_not_match():
    assert not contains_in_pdf_page(VISUAL_PAGE, QUOTE.replace("5.3", "6.3"))
    assert not contains_in_pdf_page(VISUAL_PAGE, QUOTE.replace("المصرفي", "التجاري"))
    # Very short needles never match through the lenient fold.
    assert not contains_in_pdf_page(VISUAL_PAGE, "حقق")


def test_fold_is_symmetric_for_lam_alef():
    assert fold_pdf("دولة الإمارات") == fold_pdf("دولة اإلمارات")
    assert fold_pdf("للإحصاءات") == fold_pdf("اللحصاءات")


def test_verify_uses_pdf_pages_for_quotes():
    ok = verify_against_document(
        quote=QUOTE,
        value=Decimal("5.3"),
        decimals=1,
        location={"kind": "text", "page": 1},
        text_content=VISUAL_PAGE,
        tables=[{"kind": "pdf_pages", "pages": [VISUAL_PAGE]}],
        page_texts=[VISUAL_PAGE],
    )
    assert ok
    wrong_value = verify_against_document(
        quote=QUOTE,
        value=Decimal("5.8"),
        decimals=1,
        location={"kind": "text", "page": 1},
        text_content=VISUAL_PAGE,
        tables=[],
        page_texts=[VISUAL_PAGE],
    )
    assert not wrong_value


def test_html_main_inside_header_is_kept():
    html = """<html><body>
      <header class="aegov-header"><nav>القائمة</nav>
        <main><article><div>اعتمد مجلس الوزراء الميزانية العامة بإجمالي مصروفات تبلغ 292.5 مليار درهم.</div>
        <div>وتشمل الميزانية 2027 مصروفات قدرها 97.4 مليار درهم.</div></article></main>
      </header><footer>حقوق النشر</footer></body></html>"""
    _, paragraphs = text_from_html(html)
    text = " ".join(p.text for p in paragraphs)
    assert "292.5 مليار درهم" in text
    assert "97.4" in text
    assert "القائمة" not in text
    assert "حقوق النشر" not in text


def test_html_inside_aspnet_form_is_kept():
    html = """<html><body><form id="aspnetForm"><input type="hidden" value="x">
      <div class="content"><p>بلغ عدد الزوار 19.59 مليون زائر خلال 2025.</p></div>
      <button>بحث</button></form></body></html>"""
    _, paragraphs = text_from_html(html)
    assert [p.text for p in paragraphs] == ["بلغ عدد الزوار 19.59 مليون زائر خلال 2025."]


def test_html_largest_article_wins():
    html = """<html><body><article><p>خبر ذو صلة</p></article>
      <article><p>الفقرة الأولى من الخبر الرئيسي وفيها 4.14 مليون نسمة.</p>
      <p>الفقرة الثانية من الخبر الرئيسي.</p></article></body></html>"""
    _, paragraphs = text_from_html(html)
    assert paragraphs[0].text.startswith("الفقرة الأولى")


def test_wam_articles_are_read_through_their_article_api():
    from isnad_worker.pipeline import content

    api = content.article_api("https://www.wam.ae/ar/article/bzkw3xr-266-مليون?x=1")
    assert api == "https://www.wam.ae/api/app/articles/GetArticleBySlug?slug=bzkw3xr-266-مليون"
    assert content.article_api("https://wam.ae/en/article/abc") is not None
    assert content.article_api("https://www.wam.ae/ar/") is None
    assert content.article_api("https://example.com/ar/article/abc") is None
    page, date = content.wam_article_html(
        '{"title": "عنوان", "articleDate": "2026-04-06T10:00:00", "body": "<p>نص 26.6 مليون</p>"}'.encode()
    )
    assert "<h1>عنوان</h1>" in page and "26.6 مليون" in page and date == "2026-04-06"


def test_an_imperfect_quote_is_replaced_by_the_documents_own_sentence():
    from decimal import Decimal

    from isnad_worker.pipeline.evidence import repair_quote

    text = (
        "ارتفعت قيمة الاستثمارات العقارية إلى 9.8 مليار درهم.\n"
        "من جانبها، واصلت إمارة دبي تسجيل نمو استثنائي، الأمر الذي انعكس على تصرفات عقارية "
        "بلغت قيمتها الإجمالية نحو 193 مليار درهم، نتجت عن 58 ألفا و39 تصرفا عقاريا."
    )
    garbled = (
        "واصلت إمارة دبي تسجيل نمو استثنائي، الأمر الذي انعكس على تصرفات عقارية بلغت قيمتها "
        "الإجمالية نحو 193 مليار درهم، نتجت عن 58 ألفا و39 تصرفا عقarيا."
    )
    repaired = repair_quote(garbled, text, Decimal(193), 0)
    assert repaired is not None and repaired in text and "193 مليار" in repaired
    # A sentence with the same number but other words doesn't stand in.
    assert repair_quote("بلغ عدد الزوار 193 مليار في الربع", text, Decimal(193), 0) is None
    # Nor does one without the number.
    assert repair_quote(garbled, text, Decimal(194), 0) is None
