from contextlib import contextmanager

from fastapi.testclient import TestClient

from isnad_worker import api


class _FakeConnection:
    def execute(self, query):
        return None


def test_health(monkeypatch):
    @contextmanager
    def fake_connect():
        yield _FakeConnection()

    monkeypatch.setattr(api.db, "connect", fake_connect)
    response = TestClient(api.app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def _webhook_client(monkeypatch, secret="s3cret"):
    from isnad_worker.config import settings

    monkeypatch.setattr(settings, "telegram_webhook_secret", secret)
    monkeypatch.setitem(settings.__dict__, "telegram_enabled", True)
    handled = []
    monkeypatch.setattr(api, "_handle_update", handled.append)
    return TestClient(api.app), handled


def test_telegram_webhook_requires_the_secret(monkeypatch):
    client, handled = _webhook_client(monkeypatch)
    update = {"update_id": 1, "message": {"text": "hi"}}
    assert client.post("/telegram/webhook", json=update).status_code == 403
    wrong = {"X-Telegram-Bot-Api-Secret-Token": "nope"}
    assert client.post("/telegram/webhook", json=update, headers=wrong).status_code == 403
    assert handled == []


def test_telegram_webhook_accepts_updates(monkeypatch):
    client, handled = _webhook_client(monkeypatch)
    headers = {"X-Telegram-Bot-Api-Secret-Token": "s3cret"}
    response = client.post("/telegram/webhook", json={"update_id": 5}, headers=headers)
    assert response.status_code == 200
    assert handled == [{"update_id": 5}]
    assert client.post("/telegram/webhook", json=[1], headers=headers).status_code == 400


def test_telegram_webhook_off_without_secret(monkeypatch):
    client, _ = _webhook_client(monkeypatch, secret="")
    assert client.post("/telegram/webhook", json={"update_id": 1}).status_code == 404
