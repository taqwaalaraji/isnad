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


@jobs.handler("deliver_alerts")
def deliver_alerts(job: jobs.Job) -> None:
    """Send undelivered alerts to members who linked Telegram and want Telegram alerts."""
    if not settings.telegram_enabled:
        return
    from isnad_worker.telegram import bot

    rows = db.fetch_all(
        """
        select a.id, a.kind, a.title, a.body, a.payload, l.chat_id, p.locale, p.notification_prefs
        from public.alerts a
        join public.telegram_links l on l.user_id = a.user_id
        join public.profiles p on p.id = a.user_id
        where a.delivered_telegram_at is null and a.read_at is null and a.created_at > now() - interval '2 days'
        order by a.created_at
        limit 100
        """
    )
    for row in rows:
        if wants_telegram(row["notification_prefs"], row["kind"]):
            try:
                bot.send_alert(row)
            except Exception:
                log.exception("telegram alert %s failed", row["id"])
                continue
        db.execute(
            "update public.alerts set delivered_telegram_at = now() where id = %s", (row["id"],)
        )
