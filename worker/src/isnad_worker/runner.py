"""The worker process: runs queued jobs on a thread pool and the periodic schedule.

Run with `make worker` (or `uv run python -m isnad_worker.runner`).
"""

from __future__ import annotations

import logging
import os
import signal
import socket
import threading
import time
from datetime import UTC, datetime

from isnad_worker import db, jobs
from isnad_worker.config import settings

log = logging.getLogger("isnad.worker")


def _register_handlers() -> None:
    # Importing the modules registers their @jobs.handler functions.
    from isnad_worker import briefs, evals  # noqa: F401
    from isnad_worker.pipeline import check  # noqa: F401
    from isnad_worker.registry import ingest, intake, revisions, watch  # noqa: F401
    from isnad_worker.telegram import notify  # noqa: F401


class Worker:
    def __init__(self, concurrency: int) -> None:
        self.concurrency = concurrency
        self.stopping = threading.Event()
        self.wake = threading.Event()
        self.id_prefix = f"{socket.gethostname()}:{os.getpid()}"

    # ── job loop ──────────────────────────────────────────────────────────────

    def _work(self, index: int) -> None:
        worker_id = f"{self.id_prefix}:{index}"
        kinds = list(jobs.handlers())
        while not self.stopping.is_set():
            try:
                job = jobs.claim(worker_id, kinds)
            except Exception:
                log.exception("claim failed")
                self.stopping.wait(5)
                continue
            if job is None:
                self.wake.wait(settings.poll_interval_seconds)
                self.wake.clear()
                continue
            self._run(job)

    def _run(self, job: jobs.Job) -> None:
        handler = jobs.handlers()[job.kind]
        started = time.monotonic()
        log.info("job %s %s started (attempt %d)", job.id, job.kind, job.attempts)
        try:
            handler(job)
        except jobs.PermanentError as exc:
            log.warning("job %s %s failed permanently: %s", job.id, job.kind, exc)
            jobs.fail(job, str(exc), retry=False)
        except Exception as exc:
            requeued = jobs.fail(job, f"{type(exc).__name__}: {exc}", retry=True)
            log.exception(
                "job %s %s failed%s", job.id, job.kind, " (will retry)" if requeued else ""
            )
        else:
            jobs.complete(job)
            log.info("job %s %s done in %.1fs", job.id, job.kind, time.monotonic() - started)

    # ── wake-ups ──────────────────────────────────────────────────────────────

    def _listen(self) -> None:
        while not self.stopping.is_set():
            try:
                with db.connect() as conn:
                    conn.execute("listen isnad_jobs")
                    for _ in conn.notifies(timeout=30, stop_after=None):
                        self.wake.set()
                        if self.stopping.is_set():
                            return
            except Exception:
                log.exception("listen connection lost; reconnecting")
                self.stopping.wait(5)

    # ── schedule ──────────────────────────────────────────────────────────────

    def _schedule(self) -> None:
        from isnad_worker.telegram import notify

        last_minute = last_alerts = last_watch = last_daily = 0.0
        while not self.stopping.is_set():
            now = time.time()
            try:
                if now - last_minute >= 60:
                    jobs.recover_stale(settings.job_timeout_minutes)
                    last_minute = now
                if now - last_alerts >= 300:
                    notify.queue_missed()
                    last_alerts = now
                if now - last_watch >= settings.watch_interval_hours * 3600:
                    stamp = datetime.now(UTC).strftime("%Y%m%d%H")
                    jobs.enqueue("watch_sources", {}, dedupe_key=f"watch:{stamp}")
                    last_watch = now
                if now - last_daily >= 86400:
                    jobs.enqueue(
                        "retention_cleanup", {}, dedupe_key=f"retention:{datetime.now(UTC):%Y%m%d}"
                    )
                    jobs.prune()
                    last_daily = now
            except Exception:
                log.exception("schedule tick failed")
            self.stopping.wait(15)

    def run(self) -> None:
        _register_handlers()
        log.info(
            "worker started: %d threads, handlers: %s",
            self.concurrency,
            ", ".join(sorted(jobs.handlers())),
        )
        threads = [
            threading.Thread(target=self._listen, name="listen", daemon=True),
            threading.Thread(target=self._schedule, name="schedule", daemon=True),
            *(
                threading.Thread(target=self._work, args=(i,), name=f"work-{i}", daemon=True)
                for i in range(self.concurrency)
            ),
        ]
        for t in threads:
            t.start()
        self.stopping.wait()
        log.info("stopping: waiting for running jobs to finish")
        self.wake.set()
        # Unfinished jobs go back to the queue after the stale timeout; don't wait forever for them.
        deadline = time.monotonic() + 120
        for t in threads:
            if t.name.startswith("work-"):
                t.join(timeout=max(0.0, deadline - time.monotonic()))
        log.info("worker stopped")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpx2").setLevel(logging.WARNING)
    worker = Worker(settings.worker_concurrency)

    def stop(*_: object) -> None:
        if worker.stopping.is_set():
            log.warning("second stop signal: exiting without waiting for running jobs")
            os._exit(1)
        worker.stopping.set()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    worker.run()


if __name__ == "__main__":
    main()
