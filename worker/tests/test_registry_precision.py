from decimal import Decimal

from isnad_worker.registry import ingest, revisions, store


def test_display_formats():
    assert store.display_format("#,##0.0") == (1, False)
    assert store.display_format('_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)') == (2, False)
    assert store.display_format("0%;\\-0%;0%") == (0, True)
    assert store.display_format("0.0%") == (1, True)
    assert store.display_format("General") == (None, False)
    assert store.display_format("@") == (None, False)


def test_cells_are_stored_as_published():
    assert store.published_number(325682.14963061886, "#,##0.0") == (325682.1, 1, False)
    assert store.published_number(0.8458162144881093, "0%") == (85, 0, True)
    assert store.published_number(0.795, "0.0%") == (79.5, 1, True)
    assert store.published_number(0.1 + 0.2, "General") == (0.3, 1, False)
    assert store.published_number(2014, "General") == (2014, 0, False)


def test_published_value_rounds_float_noise():
    assert ingest.published_value(Decimal("53.91831260218126"), 14) == (Decimal("53.918313"), 6)
    assert ingest.published_value(Decimal("53.91831260218126"), 1) == (Decimal("53.9"), 1)
    assert ingest.published_value(Decimal("4135985.0"), 0) == (Decimal(4135985), 0)


def _figure(value, decimals, scale="million", unit="person"):
    multiplier = Decimal(1) if unit == "%" else store_scale(scale)
    return {
        "value_base": Decimal(str(value)) * multiplier,
        "decimals": decimals,
        "scale": scale,
        "unit": unit,
    }


def store_scale(scale):
    from isnad_worker.text import SCALES

    return SCALES[scale]


def test_revisions_respect_published_precision():
    assert not revisions.is_revision(_figure("4.1", 1), _figure("4.14", 2))
    assert revisions.is_revision(_figure("156.8", 1), _figure("158", 0))
    assert revisions.is_revision(_figure("4.13", 2), _figure("4.14", 2))
    assert not revisions.is_revision(_figure("5", 0, "one", "%"), _figure("5.0", 1, "one", "%"))
    assert revisions.is_revision(_figure("5", 0, "one", "%"), _figure("5.7", 1, "one", "%"))


def test_page_versions_are_compared_by_text():
    first = b"<html><body><article><p>Visitors reached 19.59 million in 2025.</p></article><script>t=1</script></body></html>"
    second = b"<html><body><article><p>Visitors reached 19.59 million in 2025.</p></article><script>t=2</script></body></html>"
    a = store.extract("html", first)
    b = store.extract("html", second)
    assert a.text == b.text
