from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi.testclient import TestClient

from isnad_worker import api, ask


def row(
    figure_id: str,
    value: str,
    scale: str = "million",
    decimals: int = 2,
    unit: str = "visitor",
    start: date = date(2025, 1, 1),
    end: date = date(2025, 12, 31),
) -> dict:
    multiplier = {"one": 1, "thousand": 10**3, "million": 10**6, "billion": 10**9}[scale]
    return {
        "id": figure_id,
        "value": Decimal(value),
        "value_base": Decimal(value) * (1 if unit == "%" else multiplier),
        "scale": scale,
        "decimals": decimals,
        "unit": unit,
        "period_start": start,
        "period_end": end,
        "fetched_at": datetime(2026, 2, 9, 8, 0, tzinfo=UTC),
        "published_at": date(2026, 2, 9),
        "version": 1,
    }


VISITORS = row("f1", "19.59")
GROWTH = row("f2", "5", scale="one", decimals=0, unit="%")
POPULATION = row(
    "f3",
    "4135985",
    scale="one",
    decimals=0,
    unit="person",
    start=date(2024, 1, 1),
    end=date(2024, 12, 31),
)
ROWS = {r["id"]: r for r in (VISITORS, GROWTH, POPULATION)}


def test_accepts_cited_numbers_with_dates_and_markers():
    answer = (
        "استقبلت دبي 19.59 مليون زائر دولي خلال 2025 [1]، بنمو 5% [2] وفق بيانات 9 فبراير 2026."
    )
    assert ask.verify(answer, ["f1", "f2"], ROWS).ok


def test_accepts_a_rounded_restatement_of_a_cited_figure():
    assert ask.verify("Abu Dhabi had 4.14 million residents in 2024 [1].", ["f3"], ROWS).ok
    assert ask.verify("بلغ عدد السكان 4,135,985 نسمة في 2024 [1].", ["f3"], ROWS).ok


def test_rejects_a_number_that_is_not_cited():
    result = ask.verify("استقبلت دبي 21 مليون زائر في 2025 [1].", ["f1"], ROWS)
    assert not result.ok
    assert "21" in result.problem


def test_rejects_a_computed_growth_rate():
    result = ask.verify("Visitors rose 7% to 19.59 million in 2025 [1].", ["f1"], ROWS)
    assert not result.ok


def test_rejects_a_percentage_that_matches_only_a_count():
    result = ask.verify("نمو بنسبة 19.59% [1].", ["f1"], ROWS)
    assert not result.ok


def test_rejects_unknown_ids_and_missing_or_dangling_markers():
    assert not ask.verify("19.59 مليون [1]", ["nope"], ROWS).ok
    assert not ask.verify("19.59 مليون زائر", ["f1"], ROWS).ok
    assert not ask.verify("19.59 مليون [2]", ["f1"], ROWS).ok
    assert not ask.verify("19.59 مليون [1]", [], ROWS).ok


def test_endpoint_requires_the_internal_token(monkeypatch):
    monkeypatch.setattr(api.settings, "internal_api_token", "secret-token")
    monkeypatch.setattr(ask, "answer", lambda question, newsroom_id: {"answerable": False})
    client = TestClient(api.app)
    assert client.post("/internal/ask", json={"question": "x"}).status_code == 401
    bad = client.post(
        "/internal/ask", json={"question": "x"}, headers={"Authorization": "Bearer wrong"}
    )
    assert bad.status_code == 401
    ok = client.post(
        "/internal/ask",
        json={"question": "كم عدد الزوار؟"},
        headers={"Authorization": "Bearer secret-token"},
    )
    assert ok.status_code == 200
    assert ok.json() == {"answerable": False}


def test_endpoint_is_closed_when_no_token_is_configured(monkeypatch):
    monkeypatch.setattr(api.settings, "internal_api_token", "")
    response = TestClient(api.app).post(
        "/internal/ask", json={"question": "x"}, headers={"Authorization": "Bearer "}
    )
    assert response.status_code == 401
