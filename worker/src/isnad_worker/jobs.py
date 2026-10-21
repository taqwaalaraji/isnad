"""Job queue on Postgres: claimed with FOR UPDATE SKIP LOCKED, woken by NOTIFY isnad_jobs."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from isnad_worker import db

log = logging.getLogger("isnad.jobs")


@dataclass(frozen=True)
class Job:
    id: int
    kind: str
    payload: dict[str, Any]
    attempts: int
    max_attempts: int


Handler = Callable[[Job], None]
_handlers: dict[str, Handler] = {}


class RetryableError(Exception):
    """A failure worth retrying later (network, rate limits, a busy dependency)."""


class PermanentError(Exception):
    """A failure that retrying won't fix (bad input, unsupported file)."""


def handler(kind: str) -> Callable[[Handler], Handler]:
    def register(fn: Handler) -> Handler:
        _handlers[kind] = fn
        return fn

    return register


def handlers() -> dict[str, Handler]:
    return _handlers


def enqueue(
    kind: str,
    payload: dict[str, Any],
    *,
    priority: int = 0,
    dedupe_key: str | None = None,
    delay: timedelta | None = None,
) -> int | None:
    row = db.fetch_one(
        """
        insert into public.jobs (kind, payload, priority, dedupe_key, run_after)
        values (%s, %s, %s, %s, now() + %s)
        on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running') do nothing
        returning id
        """,
        (kind, db.json(payload), priority, dedupe_key, delay or timedelta(0)),
    )
    return row["id"] if row else None


def claim(worker_id: str, kinds: list[str]) -> Job | None:
    row = db.fetch_one(
        """
        update public.jobs
        set status = 'running', locked_at = now(), locked_by = %s, attempts = attempts + 1, started_at = now()
        where id = (
            select id from public.jobs
            where status = 'queued' and run_after <= now() and kind = any(%s)
            order by priority desc, id
            for update skip locked
            limit 1
        )
        returning id, kind, payload, attempts, max_attempts
        """,
        (worker_id, kinds),
    )
    return Job(**row) if row else None


def complete(job: Job) -> None:
    db.execute(
        "update public.jobs set status = 'done', finished_at = now(), last_error = null where id = %s",
        (job.id,),
    )


def fail(job: Job, error: str, *, retry: bool) -> bool:
    """Record a failure. Returns True when the job was re-queued for another attempt."""
    if retry and job.attempts < job.max_attempts:
        backoff = timedelta(seconds=30 * (2 ** (job.attempts - 1)))
        db.execute(
            """
            update public.jobs
            set status = 'queued', locked_at = null, locked_by = null, last_error = %s, run_after = now() + %s
            where id = %s
            """,
            (error[:4000], backoff, job.id),
        )
        return True
    db.execute(
        "update public.jobs set status = 'failed', finished_at = now(), last_error = %s where id = %s",
        (error[:4000], job.id),
    )
    return False


def recover_stale(timeout_minutes: int) -> int:
    """Jobs left running by a crashed worker go back to the queue."""
    rows = db.fetch_all(
        """
        update public.jobs
        set status = 'queued', locked_at = null, locked_by = null,
            last_error = coalesce(last_error, '') || ' [recovered after timeout]'
        where status = 'running' and locked_at < now() - make_interval(mins => %s)
        returning id
        """,
        (timeout_minutes,),
    )
    if rows:
        log.warning("recovered %d stale jobs", len(rows))
    return len(rows)


def prune(days: int = 30) -> None:
    db.execute(
        "delete from public.jobs where status in ('done', 'cancelled') and finished_at < now() - make_interval(days => %s)",
        (days,),
    )
