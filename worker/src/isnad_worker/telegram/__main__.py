"""`python -m isnad_worker.telegram`: the bot process (`make bot`).

- polling (development): reads updates with getUpdates and handles them here
- webhook (production): registers the webhook (updates go to the worker API) and keeps the
  progress messages of running checks up to date
Either way this process edits progress messages while checks run.
"""

from __future__ import annotations

import logging
import signal
import threading
from concurrent.futures import ThreadPoolExecutor

from isnad_worker.config import settings
from isnad_worker.telegram import bot
from isnad_worker.telegram.client import TelegramError

log = logging.getLogger("isnad.telegram")

PROGRESS_SECONDS = 4.0


def _progress_loop(stopping: threading.Event) -> None:
    while not stopping.is_set():
        try:
            bot.progress_tick()
        except Exception:
            log.exception("progress update failed")
        stopping.wait(PROGRESS_SECONDS)


def _poll(stopping: threading.Event) -> None:
    api = bot.api()
    api.delete_webhook()
    offset: int | None = None
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="update") as pool:
        while not stopping.is_set():
            try:
                updates = api.get_updates(offset, timeout=10)
            except TelegramError as exc:
                log.warning("getUpdates failed: %s", exc)
                stopping.wait(5)
                continue
            for update in updates:
                offset = update["update_id"] + 1
                pool.submit(_safe_handle, update)


def _safe_handle(update: dict) -> None:
    try:
        bot.handle_update(update)
    except Exception:
        log.exception("update %s failed", update.get("update_id"))


def webhook_url() -> str:
    return settings.telegram_webhook_url or f"{settings.site_url.rstrip('/')}/telegram/webhook"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    for noisy in ("httpx", "httpx2"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if not settings.telegram_enabled:
        log.info("Telegram is off (no TELEGRAM_BOT_TOKEN, or TELEGRAM_MODE=off)")
        return
    me = bot.api().get_me()
    bot.register_commands()
    stopping = threading.Event()

    def stop(*_: object) -> None:
        stopping.set()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    threading.Thread(target=_progress_loop, args=(stopping,), name="progress", daemon=True).start()
    if settings.telegram_mode == "webhook":
        if not settings.telegram_webhook_secret:
            raise SystemExit("TELEGRAM_WEBHOOK_SECRET is required in webhook mode")
        bot.api().set_webhook(webhook_url(), settings.telegram_webhook_secret)
        log.info("@%s: webhook set; updating progress messages", me.get("username"))
        stopping.wait()
    else:
        log.info("@%s: polling for updates", me.get("username"))
        _poll(stopping)
    log.info("bot stopped")


if __name__ == "__main__":
    main()
