import json

import httpx2 as httpx
import pytest

from isnad_worker.telegram import bot, client
from isnad_worker.telegram import messages as m

TOKEN = "123456:SECRET-token-value"


def make_api(handler):
    return client.BotApi(TOKEN, transport=httpx.MockTransport(handler), max_attempts=3)


# ── client ────────────────────────────────────────────────────────────────────


def test_client_retries_flood_wait(monkeypatch):
    calls = []
    monkeypatch.setattr(client.time, "sleep", lambda s: calls.append(("sleep", s)))

    def handler(request):
        calls.append(("call", request.url.path))
        if len([c for c in calls if c[0] == "call"]) == 1:
            return httpx.Response(
                429,
                json={
                    "ok": False,
                    "error_code": 429,
                    "description": "Too Many Requests",
                    "parameters": {"retry_after": 3},
                },
            )
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 7}})

    result = make_api(handler).send_message(1, "hi")
    assert result == {"message_id": 7}
    assert ("sleep", 3.0) in calls


def test_client_blocked_and_scrubbed_errors():
    def handler(request):
        return httpx.Response(
            403,
            json={
                "ok": False,
                "error_code": 403,
                "description": f"Forbidden: bot was blocked ({TOKEN})",
            },
        )

    with pytest.raises(client.BotBlocked) as excinfo:
        make_api(handler).send_message(1, "hi")
    assert TOKEN not in str(excinfo.value)


def test_edit_not_modified_is_ignored():
    def handler(request):
        return httpx.Response(
            400,
            json={
                "ok": False,
                "error_code": 400,
                "description": "Bad Request: message is not modified",
            },
        )

    assert make_api(handler).edit_message(1, 2, "same") is None


def test_send_message_payload():
    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    make_api(handler).send_message(5, "x" * 5000, reply_to=9)
    assert seen["chat_id"] == 5
    assert len(seen["text"]) == 4096
    assert seen["parse_mode"] == "HTML"
    assert seen["reply_parameters"]["message_id"] == 9


def test_download_refuses_large_files():
    def handler(request):
        return httpx.Response(
            200, json={"ok": True, "result": {"file_path": "a.mp4", "file_size": 30 * 1024 * 1024}}
        )

    with pytest.raises(client.TelegramError) as excinfo:
        make_api(handler).download("f")
    assert excinfo.value.code == 413


# ── messages ──────────────────────────────────────────────────────────────────


def test_summary_counts_and_escaping():
    text = m.summary(
        "ar",
        title="مؤتمر <صحفي>",
        counts={"match": 2, "differs": 1, "context": 0, "none": 1},
        claims=[
            {
                "span": "بلغ <b>عدد</b> الزوار 5 ملايين",
                "verdict": "differs",
                "wording": "بلغ عدد الزوار 4.2 مليون",
                "source": "دائرة الاقتصاد",
            },
            {"span": "نمو 7%", "verdict": "match", "wording": None, "source": None},
        ],
    )
    assert "مؤتمر &lt;صحفي&gt;" in text
    assert "&lt;b&gt;عدد&lt;/b&gt;" in text
    assert "🔴 1 مختلف عن المصدر" in text
    assert "🟠" not in text.split("\n\n")[0]  # zero counts are left out
    assert "↳ بلغ عدد الزوار 4.2 مليون" in text


def test_summary_without_numbers():
    text = m.summary("en", title="t", counts={}, claims=[])
    assert "no checkable numbers" in text


def test_progress_and_failures():
    assert "3 من 5" in m.progress(
        "ar", "checking", {"claims_total": 5, "claims_checked": 3}, "video"
    )
    assert "Transcribing" in m.progress("en", "transcribing", {}, "audio")
    assert m.failure("ar", "speech_unavailable: 403") == m.t("ar", "failure_speech_unavailable")
    assert m.failure("en", "internal: KeyError") == m.t("en", "failure_generic")


def test_public_urls_only_for_buttons():
    assert m.is_public_url("https://isnad.ae/ar/checks/1")
    assert not m.is_public_url("http://localhost:3000/ar/checks/1")
    assert not m.is_public_url("http://127.0.0.1:3000/x")


def test_every_key_exists_in_both_languages():
    assert set(m.TEXTS["ar"]) == set(m.TEXTS["en"])


# ── intake ────────────────────────────────────────────────────────────────────


def test_classify_messages():
    assert bot.classify({"text": "https://wam.ae/ar/article/x"}) == (
        "link",
        {"url": "https://wam.ae/ar/article/x"},
    )
    assert bot.classify({"text": "بلغ عدد الزوار 19.59 مليون زائر في 2025"})[0] == "text"
    kind, details = bot.classify({"voice": {"file_id": "v", "mime_type": "audio/ogg"}})
    assert kind == "audio" and details["ext"] == ".ogg"
    assert bot.classify({"video_note": {"file_id": "n"}})[0] == "video"
    assert bot.classify({"document": {"file_id": "d", "file_name": "report.pdf"}})[0] == "document"
    assert bot.classify({"document": {"file_id": "d", "mime_type": "video/mp4"}})[0] == "video"
    assert bot.classify({"document": {"file_id": "d", "mime_type": "application/zip"}}) is None
    assert bot.classify({"photo": [{"file_id": "p"}]}) is None


def test_titles():
    assert bot.title_for({"caption": "مؤتمر اليوم\nسطر ثانٍ"}, "video", {}) == "مؤتمر اليوم"
    assert len(bot.title_for({}, "text", {"text": "x" * 300})) == 120
    assert bot.title_for({}, "audio", {}).startswith("Telegram · ")


def test_token_hash_matches_database():
    # The database stores encode(digest(raw, 'sha256'), 'hex').
    assert (
        bot.token_hash(" abc ")
        == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )


# ── update routing ────────────────────────────────────────────────────────────


class FakeApi:
    def __init__(self):
        self.sent = []

    def send_message(self, chat_id, text, **kw):
        self.sent.append((chat_id, text, kw))
        return {"message_id": len(self.sent)}

    def answer_callback(self, callback_id, text=None):
        self.sent.append(("callback", text, {}))


@pytest.fixture
def fake(monkeypatch):
    api = FakeApi()
    monkeypatch.setattr(bot, "api", lambda: api)
    monkeypatch.setattr(bot, "first_time", lambda update_id: True)
    return api


def _message(text, *, user_id=42, chat_type="private", lang="ar"):
    return {
        "update_id": 1,
        "message": {
            "message_id": 10,
            "chat": {"id": 99, "type": chat_type},
            "from": {"id": user_id, "language_code": lang, "first_name": "Laila"},
            "text": text,
        },
    }


def test_unlinked_user_gets_instructions(fake, monkeypatch):
    monkeypatch.setattr(bot, "account", lambda tg_id: None)
    bot.handle_update(_message("مرحباً"))
    assert fake.sent[0][1] == m.t("ar", "not_linked")
    bot.handle_update(_message("hello", lang="en"))
    assert fake.sent[1][1] == m.t("en", "not_linked")


def test_group_chats_are_ignored(fake, monkeypatch):
    monkeypatch.setattr(bot, "account", lambda tg_id: pytest.fail("should not look up"))
    bot.handle_update(_message("hi", chat_type="group"))
    assert fake.sent == []


def test_duplicate_updates_are_ignored(fake, monkeypatch):
    monkeypatch.setattr(bot, "first_time", lambda update_id: False)
    bot.handle_update(_message("/help"))
    assert fake.sent == []


def test_start_with_invalid_token(fake, monkeypatch):
    def refuse(raw, tg_user, chat_id):
        raise bot.Refusal("link_invalid")

    monkeypatch.setattr(bot, "link_account", refuse)
    bot.handle_update(_message("/start deadbeef"))
    assert fake.sent[0][1] == m.t("ar", "link_invalid")


def test_start_links_and_welcomes(fake, monkeypatch):
    acct = {
        "user_id": "u",
        "chat_id": 99,
        "newsroom_id": None,
        "full_name": "ليلى حداد",
        "locale": "ar",
        "last_newsroom_id": None,
    }
    monkeypatch.setattr(bot, "link_account", lambda raw, tg_user, chat_id: acct)
    monkeypatch.setattr(bot, "active_membership", lambda a: {"newsroom_name": "غرفة المدار"})
    bot.handle_update(_message("/start abc123"))
    text = fake.sent[0][1]
    assert "ليلى" in text and "غرفة المدار" in text


def test_linked_commands_and_refusals(fake, monkeypatch):
    acct = {
        "user_id": "u",
        "chat_id": 99,
        "newsroom_id": None,
        "full_name": "Sara",
        "locale": "en",
        "last_newsroom_id": None,
    }
    monkeypatch.setattr(bot, "account", lambda tg_id: acct)
    bot.handle_update(_message("/help"))
    assert fake.sent[-1][1] == m.t("en", "help")
    bot.handle_update(_message("too short"))
    assert fake.sent[-1][1] == m.t("en", "text_short")
    monkeypatch.setattr(bot, "active_membership", lambda a: None)
    bot.handle_update(_message("Dubai welcomed 19.59 million international visitors in 2025"))
    assert fake.sent[-1][1] == m.t("en", "no_newsroom")


def test_intake_guard_refusals(fake, monkeypatch):
    acct = {
        "user_id": "u",
        "chat_id": 99,
        "newsroom_id": None,
        "full_name": "Sara",
        "locale": "ar",
        "last_newsroom_id": None,
    }
    room = {
        "newsroom_id": "n",
        "newsroom_name": "غرفة",
        "telegram_enabled": False,
        "monthly_check_limit": None,
        "desk_id": None,
        "default_visibility": "newsroom",
        "role": "journalist",
    }
    monkeypatch.setattr(bot, "account", lambda tg_id: acct)
    monkeypatch.setattr(bot, "active_membership", lambda a: room)
    bot.handle_update(_message("بلغ عدد الزوار الدوليين 19.59 مليون زائر خلال 2025"))
    assert fake.sent[-1][1] == m.t("ar", "telegram_disabled", newsroom="غرفة")
