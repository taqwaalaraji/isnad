"""Evaluation runs against the labelled test set (filled in with the corpus harness)."""

from __future__ import annotations

from isnad_worker import db, jobs


@jobs.handler("run_eval")
def run_eval(job: jobs.Job) -> None:
    from isnad_worker.eval import harness

    run_id = job.payload["eval_run_id"]
    try:
        harness.run(run_id)
    except Exception as exc:
        db.execute(
            "update public.eval_runs set status = 'failed', error = %s, finished_at = now() where id = %s",
            (f"{type(exc).__name__}: {exc}"[:1000], run_id),
        )
        raise
