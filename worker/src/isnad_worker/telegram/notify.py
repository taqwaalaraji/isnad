"""Telegram delivery: check summaries and alerts for linked users."""

from __future__ import annotations

import logging

from isnad_worker import db, jobs
from isnad_worker.config import settings

log = logging.getLogger("isnad.telegram")

# Alert kinds grouped as the settings page offers them (profiles.notification_prefs.telegram_kinds).
PREF_GROUP = {
    "figure_revised": "revisions",
    "review_requested": "review",
    "check_escalated": "review",
    "check_ready": "check_ready",
    "new_release": "follows",
    "new_figure": "follows",
}


def wants_telegram(prefs: dict | None, kind: str) -> bool:
    prefs = prefs or {}
    if prefs.get("telegram") is False:
        return False
    return (prefs.get("telegram_kinds") or {}).get(PREF_GROUP.get(kind, ""), True) is not False


@jobs.handler("telegram_check_done")
def telegram_check_done(job: jobs.Job) -> None:
    if not settings.telegram_enabled:
        return
    from isnad_worker.telegram import bot

    bot.send_check_summary(job.payload["check_id"])


# Alerts waiting for Telegram: recent, unread, for a linked member, and newer than the link (linking
# doesn't replay older alerts). `channel` is the check's channel for "check ready" alerts.
PENDING = """
    select a.id, a.kind, a.title, a.body, a.payload, l.chat_id, p.locale, p.notification_prefs,
           c.channel
    from public.alerts a
    join public.telegram_links l on l.user_id = a.user_id
    join public.profiles p on p.id = a.user_id
    left join public.checks c on a.kind = 'check_ready' and c.id = (a.payload->>'check_id')::uuid
    where a.delivered_telegram_at is null and a.read_at is null and a.created_at > now() - interval '2 days'
      and a.created_at >= l.linked_at
"""


@jobs.handler("deliver_alerts")
def deliver_alerts(job: jobs.Job) -> None:
    """Send undelivered alerts to members who linked Telegram and want Telegram alerts.

    Queued by a trigger on every alert insert, and by the scheduler's sweep. A check sent from
    Telegram already gets its summary there, so its "check ready" alert isn't sent again.
    """
    if not settings.telegram_enabled:
        return
    from isnad_worker.telegram import bot
    from isnad_worker.telegram.client import TelegramError

    while rows := db.fetch_all(PENDING + " order by a.created_at limit 100"):
        for row in rows:
            if (
                wants_telegram(row["notification_prefs"], row["kind"])
                and row["channel"] != "telegram"
            ):
                try:
                    bot.send_alert(row)
                except TelegramError as exc:
                    if exc.code == 0 or exc.code >= 500:  # Telegram unreachable: the sweep retries
                        log.warning("telegram alert %s not sent yet: %s", row["id"], exc)
                        return
                    log.warning("telegram alert %s dropped: %s", row["id"], exc)
                except Exception:
                    log.exception("telegram alert %s dropped", row["id"])
            db.execute(
                "update public.alerts set delivered_telegram_at = now() where id = %s", (row["id"],)
            )


def queue_missed() -> None:
    """Scheduler sweep: queue a delivery for alerts that have waited over a minute (the job their
    insert queued was already running, or Telegram was unreachable)."""
    if not settings.telegram_enabled:
        return
    if db.fetch_one(PENDING + " and a.created_at < now() - interval '1 minute' limit 1"):
        jobs.enqueue("deliver_alerts", {}, dedupe_key="deliver-alerts")
