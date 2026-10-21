"""The Isnad Telegram bot: a door into the web app for linked newsroom members.

- `/start <token>` links a Telegram account to an Isnad user (one-time token from Settings).
- Text, links, voice notes, audio, short clips and documents become checks in the member's
  newsroom; a progress message is edited as the check advances, then a summary is sent.
- /checks, /alerts, /desk, /unlink, /help.

Updates arrive by long polling in development (`python -m isnad_worker.telegram`) and by webhook
in production (`POST /telegram/webhook` on the worker API); both go through `handle_update`.
Each update is handled once (Telegram retries webhooks), and workflow actions run as the member
so the same permission rules apply as in the web app.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from html import escape
from pathlib import PurePosixPath
from zoneinfo import ZoneInfo

import psycopg

from isnad_worker import db, storage
from isnad_worker.config import settings
from isnad_worker.telegram import messages as m
from isnad_worker.telegram.client import BotApi, BotBlocked, TelegramError

log = logging.getLogger("isnad.telegram")

NEWSROOM_TZ = ZoneInfo("Asia/Dubai")
RATE_LIMIT_CHECKS = 10
RATE_LIMIT_MINUTES = 10
MIN_TEXT_CHARS = 20
URL_ONLY = re.compile(r"^\s*(https?://\S+)\s*$", re.IGNORECASE)

# The same intake types the web app accepts (web/src/features/checks/actions.ts).
DOCUMENT_TYPES = {
    "application/pdf": "document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "text/plain": "document",
    "text/html": "document",
}
EXTENSION_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".html": "text/html",
    ".htm": "text/html",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}

_api: BotApi | None = None
_api_lock = threading.Lock()
_progress_shown: dict[str, str] = {}


def api() -> BotApi:
    global _api
    if _api is None:
        with _api_lock:
            if _api is None:
                _api = BotApi(settings.telegram_bot_token)
    return _api


class Refusal(Exception):
    """A request the bot turns down with a message (key into messages.TEXTS)."""

    def __init__(self, key: str, **values: object) -> None:
        super().__init__(key)
        self.key = key
        self.values = values


# ─── accounts ─────────────────────────────────────────────────────────────────


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.strip().encode()).hexdigest()


@contextmanager
def as_user(user_id: str) -> Iterator[psycopg.Connection]:
    """A transaction acting as the member: workflow functions see them as `auth.uid()`."""
    with db.transaction() as conn:
        conn.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": str(user_id), "role": "authenticated"}),),
        )
        conn.execute("set local role authenticated")
        yield conn


def account(telegram_user_id: int) -> dict | None:
    return db.fetch_one(
        """
        select l.user_id, l.chat_id, l.newsroom_id, p.full_name, p.locale, p.last_newsroom_id
        from public.telegram_links l join public.profiles p on p.id = l.user_id
        where l.telegram_user_id = %s
        """,
        (telegram_user_id,),
    )


def memberships(user_id: str) -> list[dict]:
    return db.fetch_all(
        """
        select m.newsroom_id, m.role, m.desk_id, n.name as newsroom_name, n.telegram_enabled,
               n.monthly_check_limit, n.default_visibility, d.name as desk_name
        from public.memberships m
        join public.newsrooms n on n.id = m.newsroom_id
        left join public.desks d on d.id = m.desk_id
        where m.user_id = %s and m.status = 'active' and n.status = 'active' and not n.internal
        order by n.name
        """,
        (user_id,),
    )


def active_membership(acct: dict) -> dict | None:
    """The newsroom content goes to: the one chosen in /desk, else the last used, else the first."""
    rooms = memberships(acct["user_id"])
    for preferred in (acct.get("newsroom_id"), acct.get("last_newsroom_id")):
        found = next((r for r in rooms if r["newsroom_id"] == preferred), None)
        if found:
            return found
    return rooms[0] if rooms else None


def link_account(raw_token: str, tg_user: dict, chat_id: int) -> dict:
    """Link the Telegram account to the user who created the token. Raises Refusal."""
    with db.transaction() as conn:
        token = conn.execute(
            """
            select user_id from public.telegram_link_tokens
            where token_hash = %s and used_at is null and expires_at > now()
            for update
            """,
            (token_hash(raw_token),),
        ).fetchone()
        if not token:
            raise Refusal("link_invalid")
        user_id = token["user_id"]
        taken = conn.execute(
            "select user_id from public.telegram_links where telegram_user_id = %s and user_id <> %s",
            (tg_user["id"], user_id),
        ).fetchone()
        if taken:
            raise Refusal("link_taken")
        conn.execute(
            """
            insert into public.telegram_links (user_id, telegram_user_id, telegram_username, chat_id)
            values (%s, %s, %s, %s)
            on conflict (user_id) do update set
              telegram_user_id = excluded.telegram_user_id,
              telegram_username = excluded.telegram_username,
              chat_id = excluded.chat_id,
              linked_at = now()
            """,
            (user_id, tg_user["id"], tg_user.get("username"), chat_id),
        )
        conn.execute(
            "update public.telegram_link_tokens set used_at = now() where token_hash = %s",
            (token_hash(raw_token),),
        )
    acct = account(tg_user["id"])
    assert acct is not None
    room = active_membership(acct)
    if room:
        _log_activity(acct["user_id"], room["newsroom_id"], "telegram.linked")
    return acct


def _log_activity(user_id: str, newsroom_id: str, action: str, target: str | None = None) -> None:
    try:
        with as_user(user_id) as conn:
            conn.execute(
                "select public.log_activity(%s, %s, %s, %s, %s)",
                (newsroom_id, action, "check" if target else "account", target, db.json({})),
            )
    except psycopg.Error:
        log.warning("activity log failed for %s", action)


# ─── intake ───────────────────────────────────────────────────────────────────


def classify(message: dict) -> tuple[str, dict] | None:
    """What a message asks to check: ("text"|"link"|"audio"|"video"|"document", details)."""
    text = (message.get("text") or "").strip()
    if text:
        url = URL_ONLY.match(text)
        if url:
            return "link", {"url": url.group(1)}
        return "text", {"text": text}
    if voice := message.get("voice"):
        return "audio", {
            "file": voice,
            "mime": voice.get("mime_type") or "audio/ogg",
            "ext": ".ogg",
        }
    if audio := message.get("audio"):
        return "audio", {
            "file": audio,
            "mime": audio.get("mime_type") or "audio/mpeg",
            "name": audio.get("file_name"),
        }
    if video := message.get("video") or message.get("video_note"):
        return "video", {
            "file": video,
            "mime": video.get("mime_type") or "video/mp4",
            "name": video.get("file_name"),
            "ext": ".mp4",
        }
    if document := message.get("document"):
        name = document.get("file_name") or ""
        mime = document.get("mime_type") or EXTENSION_TYPES.get(
            PurePosixPath(name).suffix.lower(), ""
        )
        if mime in DOCUMENT_TYPES:
            return "document", {"file": document, "mime": mime, "name": name}
        if mime.startswith("audio/"):
            return "audio", {"file": document, "mime": mime, "name": name}
        if mime.startswith("video/"):
            return "video", {"file": document, "mime": mime, "name": name}
    return None


def title_for(message: dict, kind: str, details: dict) -> str:
    source = (
        message.get("caption") or details.get("text") or details.get("name") or details.get("url")
    )
    if source:
        first = source.strip().splitlines()[0]
        return first[:120] if len(first) <= 120 else first[:119] + "…"
    stamp = datetime.now(NEWSROOM_TZ).strftime("%Y-%m-%d %H:%M")
    return f"Telegram · {stamp}"


def _guard(acct: dict, room: dict) -> None:
    if not room["telegram_enabled"]:
        raise Refusal("telegram_disabled", newsroom=room["newsroom_name"])
    recent = db.fetch_one(
        """
        select count(*) as n from public.checks
        where created_by = %s and channel = 'telegram' and created_at > now() - %s * interval '1 minute'
        """,
        (acct["user_id"], RATE_LIMIT_MINUTES),
    )["n"]
    if recent >= RATE_LIMIT_CHECKS:
        raise Refusal("rate_limited")
    if room["monthly_check_limit"]:
        month = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used = db.fetch_one(
            "select count(*) as n from public.checks where newsroom_id = %s and created_at >= %s",
            (room["newsroom_id"], month),
        )["n"]
        if used >= room["monthly_check_limit"]:
            raise Refusal("limit_reached")


def _store_media(room: dict, details: dict) -> dict:
    data, remote_path = api().download(details["file"]["file_id"])
    name = details.get("name") or PurePosixPath(remote_path).name
    ext = (
        PurePosixPath(name).suffix.lower()
        or details.get("ext")
        or PurePosixPath(remote_path).suffix
    )
    path = f"{room['newsroom_id']}/{uuid.uuid4()}/original{ext}"
    storage.upload(storage.MEDIA, path, data, details["mime"])
    return {"storage_path": path, "name": name, "mime": details["mime"], "size": len(data)}


def create_check(
    acct: dict,
    room: dict,
    *,
    kind: str,
    title: str,
    chat_id: int,
    progress_id: int,
    **fields: object,
) -> str:
    check_id = str(uuid.uuid4())
    recorded = datetime.now(NEWSROOM_TZ).date()
    with db.transaction() as conn:
        conn.execute(
            """
            insert into public.checks
              (id, newsroom_id, created_by, desk_id, title, input_kind, channel, input_text, input_url,
               storage_path, original_filename, mime_type, size_bytes, recorded_at, visibility,
               telegram_chat_id, telegram_message_id)
            values (%s, %s, %s, %s, %s, %s, 'telegram', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                check_id,
                room["newsroom_id"],
                acct["user_id"],
                room["desk_id"],
                title,
                kind,
                fields.get("text"),
                fields.get("url"),
                fields.get("storage_path"),
                fields.get("name"),
                fields.get("mime"),
                fields.get("size"),
                recorded,
                room["default_visibility"],
                chat_id,
                progress_id,
            ),
        )
    _log_activity(acct["user_id"], room["newsroom_id"], "check.created", check_id)
    return check_id


def intake(acct: dict, message: dict) -> None:
    chat_id = message["chat"]["id"]
    locale = acct["locale"]
    found = classify(message)
    if found is None:
        raise Refusal("unsupported")
    kind, details = found
    if kind == "text" and len(details["text"]) < MIN_TEXT_CHARS:
        raise Refusal("text_short")
    room = active_membership(acct)
    if room is None:
        raise Refusal("no_newsroom")
    _guard(acct, room)
    if "file" in details and (details["file"].get("file_size") or 0) > m.MAX_FILE_BYTES:
        raise Refusal("too_large")

    what = {"text": "text", "link": "link"}.get(kind, kind)
    first_progress = m.progress(locale, "queued", None, what)
    progress_msg = api().send_message(chat_id, first_progress, reply_to=message.get("message_id"))
    try:
        fields: dict[str, object] = {}
        if kind == "text":
            fields["text"] = details["text"][:100_000]
        elif kind == "link":
            fields["url"] = details["url"]
        else:
            api().send_chat_action(chat_id, "upload_document")
            fields.update(_store_media(room, details))
        check_id = create_check(
            acct,
            room,
            kind=kind,
            title=title_for(message, kind, details),
            chat_id=chat_id,
            progress_id=progress_msg["message_id"],
            **fields,
        )
    except TelegramError as exc:
        key = "too_large" if exc.code == 413 else "failure_generic"
        api().edit_message(chat_id, progress_msg["message_id"], m.t(locale, key))
        log.warning("telegram intake failed: %s", exc)
        return
    except Exception:
        api().edit_message(chat_id, progress_msg["message_id"], m.t(locale, "failure_generic"))
        raise
    _progress_shown[check_id] = first_progress
    log.info("telegram check %s created (%s)", check_id, kind)


# ─── commands ─────────────────────────────────────────────────────────────────


def _link(text: str, url: str) -> str:
    if m.is_public_url(url):
        return f'<a href="{escape(url, quote=True)}">{escape(text)}</a>'
    return f"{escape(text)} — {escape(url)}"


def cmd_checks(acct: dict) -> str:
    locale = acct["locale"]
    rows = db.fetch_all(
        """
        select id, title, status, match_count, context_count, differs_count, none_count
        from public.checks where created_by = %s order by created_at desc limit 5
        """,
        (acct["user_id"],),
    )
    if not rows:
        return m.t(locale, "checks_empty")
    lines = [m.t(locale, "checks_title")]
    for r in rows:
        counts = " ".join(
            f"{m.VERDICT_MARK[v]}{r[f'{v}_count']}" for v in m.VERDICT_ORDER if r[f"{v}_count"]
        )
        url = m.report_url(settings.site_url, locale, str(r["id"]))
        lines.append(
            f"• {_link(r['title'][:80], url)}\n   {m.t(locale, 'status_' + r['status'])} {counts}"
        )
    return "\n".join(lines)


def cmd_alerts(acct: dict) -> str:
    locale = acct["locale"]
    rows = db.fetch_all(
        """
        select a.kind, a.title, a.payload from public.alerts a
        where (a.user_id = %s or (a.user_id is null and a.newsroom_id in (
                 select newsroom_id from public.memberships where user_id = %s and status = 'active')))
          and a.read_at is null and a.dismissed_at is null
        order by a.created_at desc limit 5
        """,
        (acct["user_id"], acct["user_id"]),
    )
    if not rows:
        return m.t(locale, "alerts_empty")
    lines = [m.t(locale, "alerts_title")]
    for r in rows:
        label = m.t(locale, f"alert_{r['kind']}")
        line = f"• <b>{escape(label)}</b> · {escape(r['title'][:100])}"
        if check_id := (r["payload"] or {}).get("check_id"):
            line += "\n   " + _link(
                m.t(locale, "alert_open"), m.report_url(settings.site_url, locale, check_id)
            )
        lines.append(line)
    return "\n".join(lines)


def cmd_desk(acct: dict) -> tuple[str, dict | None]:
    locale = acct["locale"]
    rooms = memberships(acct["user_id"])
    room = active_membership(acct)
    if room is None:
        return m.t(locale, "no_newsroom"), None
    text = m.t(
        locale,
        "desk",
        newsroom=escape(room["newsroom_name"]),
        desk=escape(room["desk_name"] or m.t(locale, "desk_none")),
        role=m.t(locale, f"role_{room['role']}"),
    )
    others = [r for r in rooms if r["newsroom_id"] != room["newsroom_id"]]
    if not others:
        return text, None
    keyboard = {
        "inline_keyboard": [
            [{"text": r["newsroom_name"], "callback_data": f"room:{r['newsroom_id']}"}]
            for r in others
        ]
    }
    return text + "\n\n" + m.t(
        locale, "desk_choose", newsroom=escape(room["newsroom_name"])
    ), keyboard


def cmd_unlink(acct: dict) -> str:
    db.execute("delete from public.telegram_links where user_id = %s", (acct["user_id"],))
    return m.t(acct["locale"], "unlinked")


# ─── updates ──────────────────────────────────────────────────────────────────


def first_time(update_id: int) -> bool:
    """Record the update; False when it was already handled (webhook retry, restart)."""
    row = db.fetch_one(
        "insert into public.telegram_updates (update_id) values (%s) on conflict do nothing returning update_id",
        (update_id,),
    )
    return row is not None


def _guess_locale(tg_user: dict | None) -> str:
    return "en" if (tg_user or {}).get("language_code", "").startswith("en") else "ar"


def handle_update(update: dict) -> None:
    if "update_id" in update and not first_time(update["update_id"]):
        return
    try:
        if message := update.get("message"):
            _on_message(message)
        elif callback := update.get("callback_query"):
            _on_callback(callback)
    except BotBlocked:
        log.info("user blocked the bot; ignoring update %s", update.get("update_id"))


def _on_message(message: dict) -> None:
    chat = message.get("chat") or {}
    if chat.get("type") != "private":
        return  # The bot works in one-to-one chats only.
    chat_id = chat["id"]
    tg_user = message.get("from") or {}
    text = (message.get("text") or "").strip()
    command, _, argument = text.partition(" ")
    command = command.split("@", 1)[0].lower() if command.startswith("/") else ""

    if command == "/start" and argument.strip():
        try:
            acct = link_account(argument.strip(), tg_user, chat_id)
        except Refusal as refusal:
            api().send_message(chat_id, m.t(_guess_locale(tg_user), refusal.key))
            return
        room = active_membership(acct)
        name = escape((acct["full_name"] or "").split(" ")[0] or tg_user.get("first_name", ""))
        welcome = m.t(
            acct["locale"],
            "welcome",
            name=name,
            newsroom=escape(room["newsroom_name"]) if room else "Isnad",
        )
        api().send_message(chat_id, welcome + "\n\n" + m.t(acct["locale"], "size_hint"))
        return

    acct = account(tg_user.get("id", 0))
    if acct is None:
        api().send_message(chat_id, m.t(_guess_locale(tg_user), "not_linked"))
        return
    if acct["chat_id"] != chat_id:
        db.execute(
            "update public.telegram_links set chat_id = %s where user_id = %s",
            (chat_id, acct["user_id"]),
        )

    locale = acct["locale"]
    if command:
        if command in ("/help", "/start"):
            api().send_message(chat_id, m.t(locale, "help"))
        elif command == "/checks":
            api().send_message(chat_id, cmd_checks(acct))
        elif command == "/alerts":
            api().send_message(chat_id, cmd_alerts(acct))
        elif command == "/desk":
            text, keyboard = cmd_desk(acct)
            api().send_message(chat_id, text, reply_markup=keyboard)
        elif command == "/unlink":
            api().send_message(chat_id, cmd_unlink(acct))
        else:
            api().send_message(chat_id, m.t(locale, "help"))
        return

    try:
        intake(acct, message)
    except Refusal as refusal:
        api().send_message(
            chat_id, m.t(locale, refusal.key, **refusal.values), reply_to=message.get("message_id")
        )


def _on_callback(callback: dict) -> None:
    tg_user = callback.get("from") or {}
    data = callback.get("data") or ""
    acct = account(tg_user.get("id", 0))
    if acct is None:
        api().answer_callback(callback["id"], m.t(_guess_locale(tg_user), "not_linked")[:190])
        return
    locale = acct["locale"]
    action, _, target = data.partition(":")
    try:
        uuid.UUID(target)
    except ValueError:
        api().answer_callback(callback["id"])
        return
    if action == "review":
        try:
            with as_user(acct["user_id"]) as conn:
                conn.execute("select public.send_for_review(%s, null)", (target,))
        except psycopg.Error as exc:
            reason = (exc.diag.message_primary or "error") if exc.diag else "error"
            api().answer_callback(callback["id"], m.t(locale, "action_failed", reason=reason)[:190])
            return
        api().answer_callback(callback["id"], m.t(locale, "sent_editor")[:190])
    elif action == "room":
        room = next(
            (r for r in memberships(acct["user_id"]) if str(r["newsroom_id"]) == target), None
        )
        if room is None:
            api().answer_callback(callback["id"])
            return
        db.execute(
            "update public.telegram_links set newsroom_id = %s where user_id = %s",
            (room["newsroom_id"], acct["user_id"]),
        )
        api().answer_callback(
            callback["id"], m.t(locale, "desk_switched", newsroom=room["newsroom_name"])[:190]
        )
    else:
        api().answer_callback(callback["id"])


# ─── progress, summaries and alerts ──────────────────────────────────────────

_WHAT = {"text": "text", "link": "link", "audio": "audio", "video": "video", "document": "document"}


def progress_tick() -> int:
    """Edit the progress message of each Telegram check that moved since the last look."""
    rows = db.fetch_all(
        """
        select c.id, c.stage, c.progress, c.input_kind, c.telegram_chat_id, c.telegram_message_id,
               p.locale
        from public.checks c left join public.profiles p on p.id = c.created_by
        where c.channel = 'telegram' and c.status = 'processing'
          and c.telegram_message_id is not null and c.updated_at > now() - interval '2 hours'
        """
    )
    edited = 0
    for r in rows:
        text = m.progress(
            r["locale"], r["stage"], r["progress"], _WHAT.get(r["input_kind"], "text")
        )
        key = str(r["id"])
        if _progress_shown.get(key) == text:
            continue
        try:
            api().edit_message(r["telegram_chat_id"], r["telegram_message_id"], text)
            _progress_shown[key] = text
            edited += 1
        except TelegramError as exc:
            log.warning("progress edit failed for %s: %s", key, exc)
    live = {str(r["id"]) for r in rows}
    for key in [k for k in _progress_shown if k not in live]:
        _progress_shown.pop(key, None)
    return edited


def summary_payload(check_id: str) -> tuple[dict, list[dict]] | None:
    check = db.fetch_one(
        """
        select c.id, c.title, c.status, c.error, c.input_kind, c.created_by, c.telegram_chat_id,
               c.telegram_message_id, c.match_count, c.context_count, c.differs_count, c.none_count,
               p.locale, m.role
        from public.checks c
        left join public.profiles p on p.id = c.created_by
        left join public.memberships m on m.newsroom_id = c.newsroom_id and m.user_id = c.created_by
        where c.id = %s
        """,
        (check_id,),
    )
    if not check:
        return None
    claims = db.fetch_all(
        """
        select c.span_text, r.verdict, r.suggested_wording,
               coalesce(r.evidence ->> %s, r.evidence ->> %s) as source
        from public.claims c join public.claim_results r on r.claim_id = c.id
        where c.check_id = %s and c.checkable
        order by case r.verdict when 'differs' then 0 when 'context' then 1 when 'none' then 2 else 3 end, c.idx
        """,
        (
            f"publisher_name_{m.lang(check['locale'])}",
            f"source_name_{m.lang(check['locale'])}",
            check_id,
        ),
    )
    return check, [
        {
            "span": c["span_text"],
            "verdict": c["verdict"],
            "wording": c["suggested_wording"],
            "source": c["source"],
        }
        for c in claims
    ]


def send_check_summary(check_id: str) -> None:
    found = summary_payload(check_id)
    if not found:
        return
    check, claims = found
    chat_id, progress_id, locale = (
        check["telegram_chat_id"],
        check["telegram_message_id"],
        check["locale"],
    )
    if not chat_id:
        return
    _progress_shown.pop(str(check_id), None)
    what = _WHAT.get(check["input_kind"], "text")
    url = m.report_url(settings.site_url, locale, str(check["id"]))
    if check["status"] == "failed":
        if progress_id:
            api().edit_message(chat_id, progress_id, m.t(locale, "failed_line"))
        api().send_message(chat_id, escape(m.failure(locale, check["error"])), reply_to=progress_id)
        return
    if progress_id:
        api().edit_message(
            chat_id,
            progress_id,
            m.t(locale, "received", what=m.t(locale, f"what_{what}"))
            + "\n"
            + m.t(locale, "done_line"),
        )
    counts = {v: check[f"{v}_count"] or 0 for v in m.VERDICT_ORDER}
    text = m.summary(locale, title=check["title"], counts=counts, claims=claims)
    buttons: list[list[dict]] = []
    if m.is_public_url(url):
        buttons.append([{"text": m.t(locale, "open_report"), "url": url}])
    else:
        text += "\n\n" + escape(m.t(locale, "report_link", url=url))
    if check["role"] == "journalist" and check["status"] in (
        "awaiting_review",
        "in_review",
        "escalated",
    ):
        buttons.append(
            [{"text": m.t(locale, "send_editor"), "callback_data": f"review:{check['id']}"}]
        )
    api().send_message(
        chat_id,
        text,
        reply_markup={"inline_keyboard": buttons} if buttons else None,
        reply_to=progress_id,
    )


def send_alert(row: dict) -> None:
    locale = row.get("locale")
    lines = [f"<b>{escape(m.t(locale, 'alert_' + row['kind']))}</b>", escape(row["title"])]
    if row.get("body"):
        lines.append(escape(row["body"][:600]))
    markup = None
    if check_id := (row.get("payload") or {}).get("check_id"):
        url = m.report_url(settings.site_url, locale, check_id)
        if m.is_public_url(url):
            markup = {"inline_keyboard": [[{"text": m.t(locale, "alert_open"), "url": url}]]}
        else:
            lines.append(escape(url))
    try:
        api().send_message(row["chat_id"], "\n".join(lines), reply_markup=markup)
    except BotBlocked:
        log.info("alert %s not delivered: the user blocked the bot", row.get("id"))


def register_commands() -> None:
    for locale, code in (("ar", None), ("en", "en")):
        api().set_my_commands(m.command_list(locale), language_code=code)
