"""A small Telegram Bot API client: retries, flood-control waits, and no token in logs or errors."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx2 as httpx

from isnad_worker.telegram.messages import MAX_FILE_BYTES as MAX_DOWNLOAD_BYTES

log = logging.getLogger("isnad.telegram")

API_ROOT = "https://api.telegram.org"


class TelegramError(Exception):
    """An error answered by the Bot API (`ok: false`)."""

    def __init__(self, method: str, code: int, description: str) -> None:
        super().__init__(f"{method}: {code} {description}")
        self.code = code
        self.description = description


class BotBlocked(TelegramError):
    """The user blocked the bot or deleted the chat (403): stop messaging them."""


class BotApi:
    def __init__(
        self,
        token: str,
        *,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 40.0,
        max_attempts: int = 4,
    ) -> None:
        if not token:
            raise ValueError("a bot token is required")
        self._token = token
        self.max_attempts = max_attempts
        self._http = httpx.Client(
            base_url=f"{API_ROOT}/bot{token}/", transport=transport, timeout=timeout
        )
        self._files = httpx.Client(
            base_url=f"{API_ROOT}/file/bot{token}/", transport=transport, timeout=120.0
        )

    def _scrub(self, text: str) -> str:
        return text.replace(self._token, "<token>")

    def call(self, method: str, **params: Any) -> Any:
        """Call a Bot API method. Retries network errors, 5xx and flood waits (429)."""
        payload = {k: v for k, v in params.items() if v is not None}
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self._http.post(method, json=payload)
                body = response.json()
            except (httpx.TransportError, ValueError) as exc:
                if attempt == self.max_attempts:
                    raise TelegramError(method, 0, self._scrub(type(exc).__name__)) from None
                time.sleep(min(2**attempt, 10))
                continue
            if body.get("ok"):
                return body.get("result")
            code = int(body.get("error_code") or response.status_code)
            description = self._scrub(str(body.get("description") or ""))
            retry_after = (body.get("parameters") or {}).get("retry_after")
            if code == 429 and attempt < self.max_attempts:
                time.sleep(min(float(retry_after or 1), 30))
                continue
            if code >= 500 and attempt < self.max_attempts:
                time.sleep(min(2**attempt, 10))
                continue
            if code == 403:
                raise BotBlocked(method, code, description)
            raise TelegramError(method, code, description)
        raise TelegramError(method, 0, "no response")

    # ── methods ───────────────────────────────────────────────────────────────

    def get_me(self) -> dict:
        return self.call("getMe")

    def get_updates(self, offset: int | None, timeout: int = 30) -> list[dict]:
        return self.call(
            "getUpdates",
            offset=offset,
            timeout=timeout,
            allowed_updates=["message", "callback_query"],
        )

    def send_message(
        self,
        chat_id: int,
        text: str,
        *,
        reply_markup: dict | None = None,
        reply_to: int | None = None,
    ) -> dict:
        return self.call(
            "sendMessage",
            chat_id=chat_id,
            text=text[:4096],
            parse_mode="HTML",
            link_preview_options={"is_disabled": True},
            reply_markup=reply_markup,
            reply_parameters={"message_id": reply_to, "allow_sending_without_reply": True}
            if reply_to
            else None,
        )

    def edit_message(
        self, chat_id: int, message_id: int, text: str, *, reply_markup: dict | None = None
    ) -> dict | None:
        try:
            return self.call(
                "editMessageText",
                chat_id=chat_id,
                message_id=message_id,
                text=text[:4096],
                parse_mode="HTML",
                link_preview_options={"is_disabled": True},
                reply_markup=reply_markup,
            )
        except TelegramError as exc:
            # Editing to the same text, or a message that's gone, isn't worth failing over.
            if exc.code == 400 and (
                "not modified" in exc.description or "not found" in exc.description
            ):
                return None
            raise

    def answer_callback(self, callback_id: str, text: str | None = None) -> None:
        self.call("answerCallbackQuery", callback_query_id=callback_id, text=text)

    def send_chat_action(self, chat_id: int, action: str = "typing") -> None:
        try:
            self.call("sendChatAction", chat_id=chat_id, action=action)
        except TelegramError:
            pass

    def set_my_commands(self, commands: list[dict], language_code: str | None = None) -> None:
        self.call("setMyCommands", commands=commands, language_code=language_code)

    def set_webhook(self, url: str, secret: str) -> None:
        self.call(
            "setWebhook",
            url=url,
            secret_token=secret,
            allowed_updates=["message", "callback_query"],
            drop_pending_updates=False,
        )

    def delete_webhook(self) -> None:
        self.call("deleteWebhook", drop_pending_updates=False)

    def download(self, file_id: str, *, max_bytes: int = MAX_DOWNLOAD_BYTES) -> tuple[bytes, str]:
        """The file's bytes and its path on Telegram's servers (which carries the extension)."""
        info = self.call("getFile", file_id=file_id)
        size = info.get("file_size") or 0
        if size > max_bytes:
            raise TelegramError("getFile", 413, "file too large")
        path = info["file_path"]
        try:
            response = self._files.get(path)
        except httpx.TransportError as exc:
            raise TelegramError("download", 0, type(exc).__name__) from None
        if response.status_code != 200:
            raise TelegramError("download", response.status_code, "download failed")
        if len(response.content) > max_bytes:
            raise TelegramError("download", 413, "file too large")
        return response.content, path

    def close(self) -> None:
        self._http.close()
        self._files.close()
