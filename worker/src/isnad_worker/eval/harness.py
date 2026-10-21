"""The evaluation harness: the labelled corpus claims through the real check pipeline.

Each claim sentence becomes a text check in an internal "evaluation" newsroom and runs through
the same code as a newsroom's check (extraction, registry lookup, discovery when enabled, the
code comparison, the verifier and the wording). The verdict given to the labelled number is
compared with its label, and the run's metrics and per-claim results are stored on `eval_runs`.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlparse

from isnad_worker import db, jobs
from isnad_worker.eval import scoring
from isnad_worker.pipeline import check as check_pipeline
from isnad_worker.seed.documents import corpus_dir, first_date

log = logging.getLogger("isnad.eval")

EVAL_NEWSROOM_SLUG = "isnad-eval"
KEEP_CHECKS_DAYS = 14


def ensure_newsroom() -> str:
    """The internal newsroom that holds evaluation checks (excluded from product statistics)."""
    row = db.fetch_one(
        """
        insert into public.newsrooms (slug, name, internal, telegram_enabled)
        values (%s, 'Isnad evaluation', true, false)
        on conflict (slug) do update set internal = true
        returning id
        """,
        (EVAL_NEWSROOM_SLUG,),
    )
    return str(row["id"])


def load_manifest(root: Path | None = None) -> dict:
    manifest = json.loads(((root or corpus_dir()) / "manifest.json").read_text(encoding="utf-8"))
    unlabelled = [c["id"] for c in manifest["claims"] if not c.get("target")]
    if unlabelled:
        raise jobs.PermanentError(
            f"{len(unlabelled)} corpus claims have no target number (e.g. {unlabelled[0]}); "
            "the manifest in ISNAD_CORPUS_DIR is older than the code's"
        )
    return manifest


def _url_key(url: str | None) -> str:
    if not url:
        return ""
    parsed = urlparse(unquote(url))
    return f"{(parsed.hostname or '').removeprefix('www.')}{parsed.path.rstrip('/')}".lower()


def _create_check(newsroom_id: str, claim: dict, run_id: str) -> str:
    """A text check for one claim, run here rather than by the worker queue."""
    recorded = first_date(claim.get("published_at")) or date.today().isoformat()
    with db.transaction() as conn:
        row = conn.execute(
            """
            insert into public.checks
              (newsroom_id, title, input_kind, input_text, recorded_at, speakers, visibility)
            values (%s, %s, 'text', %s, %s, %s, 'newsroom')
            returning id
            """,
            (
                newsroom_id,
                f"eval {claim['id']} · {run_id[:8]}",
                claim["text_ar"],
                recorded,
                claim.get("speaker"),
            ),
        ).fetchone()
        check_id = str(row["id"])
        # The insert trigger queued it for the worker; this process runs it instead.
        conn.execute(
            "delete from public.jobs where dedupe_key = %s and status = 'queued'",
            (f"check:{check_id}",),
        )
    return check_id


def _results(check_id: str) -> tuple[list[scoring.ExtractedClaim], list[dict]]:
    rows = db.fetch_all(
        """
        select c.id, c.span_start, c.span_end, c.checkable, s.text as segment_text,
               r.verdict, r.evidence, r.evidence_verified, r.discovered, r.needs_review,
               r.chain_status, r.suggested_wording
        from public.claims c
        join public.segments s on s.id = c.segment_id
        left join public.claim_results r on r.claim_id = c.id
        where c.check_id = %s
        order by c.idx
        """,
        (check_id,),
    )
    extracted = [
        scoring.ExtractedClaim(
            segment_text=r["segment_text"],
            span_start=r["span_start"],
            span_end=r["span_end"],
            checkable=r["checkable"],
            verdict=r["verdict"],
        )
        for r in rows
    ]
    return extracted, rows


def _row_for_target(rows: list[dict], target: str) -> dict | None:
    for r in rows:
        at = scoring.locate(r["segment_text"], target)
        if at is not None and r["span_start"] is not None and r["span_start"] <= at < r["span_end"]:
            return r
    return None


def evaluate_claim(claim: dict, *, newsroom_id: str, run_id: str, documents: dict) -> dict:
    started = time.monotonic()
    check_id = _create_check(newsroom_id, claim, run_id)
    error = None
    try:
        check_pipeline.process_check(
            jobs.Job(0, "process_check", {"check_id": check_id}, attempts=1, max_attempts=1)
        )
    except Exception as exc:  # recorded per claim; one failure doesn't stop the run
        log.exception("eval claim %s failed", claim["id"])
        error = f"{type(exc).__name__}: {exc}"[:300]
    return score_claim(
        claim,
        check_id=check_id,
        documents=documents,
        seconds=time.monotonic() - started,
        error=error,
    )


def score_claim(
    claim: dict, *, check_id: str, documents: dict, seconds: float, error: str | None
) -> dict:
    """Compare a processed check's result for the labelled number with its label."""
    expected = scoring.expected_verdict(claim["expected_verdict"])
    extracted, rows = _results(check_id)
    target = claim.get("target") or ""
    predicted, how = scoring.predicted_verdict(claim["text_ar"], target, extracted)
    row = _row_for_target(rows, target)
    evidence = (row or {}).get("evidence") or {}
    expected_doc = documents.get((claim.get("evidence") or {}).get("document_id") or "")
    right_document = None
    if expected_doc and evidence.get("document"):
        found = _url_key(evidence["document"].get("url"))
        right_document = found in {
            _url_key(expected_doc.get("url")),
            _url_key(expected_doc.get("landing_url")),
        }
    status = db.fetch_one("select status, error from public.checks where id = %s", (check_id,))
    cost = db.fetch_one(
        "select coalesce(sum(cost_usd), 0) as usd from public.usage_events where check_id = %s",
        (check_id,),
    )["usd"]
    return {
        "claim_id": claim["id"],
        "check_id": check_id,
        "expected": expected,
        "predicted": predicted,
        "correct": expected == predicted,
        "how": how,
        "target": target,
        "evidence_document": (evidence.get("document") or {}).get("title"),
        "evidence_url": (evidence.get("document") or {}).get("url"),
        "evidence_verified": bool(row and row["evidence_verified"]),
        "discovered": bool(row and row["discovered"]),
        "needs_review": bool(row and row["needs_review"]),
        "right_document": right_document,
        "claims_extracted": len(rows),
        "check_status": status["status"] if status else None,
        "error": error or (status["error"] if status and status["status"] == "failed" else None),
        "seconds": round(seconds, 1),
        "cost_usd": float(cost),
    }


def summarize(results: list[dict]) -> dict:
    pairs = [(r["expected"], r["predicted"]) for r in results]
    metrics = scoring.score(pairs).as_dict()
    shown = [r for r in results if r["predicted"] != "none"]
    located = [r for r in results if r["right_document"] is not None]
    seconds = [r["seconds"] for r in results]
    metrics.update(
        {
            "risks": scoring.risk_counts(pairs),
            "evidence_verified_rate": round(
                sum(1 for r in shown if r["evidence_verified"]) / len(shown), 4
            )
            if shown
            else 0.0,
            "right_document_rate": round(
                sum(1 for r in located if r["right_document"]) / len(located), 4
            )
            if located
            else 0.0,
            "discovered": sum(1 for r in results if r["discovered"]),
            "abstention_reasons": {
                how: sum(1 for r in results if r["how"] == how)
                for how in ("not_checkable", "not_extracted", "no_result", "target_missing")
            },
            "errors": sum(1 for r in results if r["error"]),
            "cost_usd": round(sum(r["cost_usd"] for r in results), 4),
            "seconds_total": round(sum(seconds), 1),
            "seconds_p50": scoring.percentile(seconds, 0.5),
            "seconds_p90": scoring.percentile(seconds, 0.9),
        }
    )
    return metrics


def recheck(previous_run_id: str, new_run_id: str, *, concurrency: int = 3) -> dict:
    """Re-run comparison and verification for a finished run's checks against today's registry,
    keeping their extracted claims: isolates changes to the rules and the registry from
    extraction variance. Results go to a new run."""
    previous = db.fetch_one(
        "select results from public.eval_runs where id = %s", (previous_run_id,)
    )
    if not previous:
        raise jobs.PermanentError("eval run not found")
    manifest = load_manifest()
    claims = {c["id"]: c for c in manifest["claims"]}
    documents = {d["id"]: d for d in manifest["documents"]}
    results: list[dict] = []
    lock = threading.Lock()

    def one(r: dict) -> None:
        started = time.monotonic()
        db.execute(
            "update public.checks set status = 'processing', stage = 'queued' where id = %s",
            (r["check_id"],),
        )
        error = None
        try:
            check_pipeline.process_check(
                jobs.Job(
                    0,
                    "process_check",
                    {"check_id": r["check_id"], "mode": "recheck"},
                    attempts=1,
                    max_attempts=1,
                )
            )
        except Exception as exc:
            log.exception("eval recheck %s failed", r["claim_id"])
            error = f"{type(exc).__name__}: {exc}"[:300]
        result = score_claim(
            claims[r["claim_id"]],
            check_id=r["check_id"],
            documents=documents,
            seconds=time.monotonic() - started,
            error=error,
        )
        with lock:
            results.append(result)

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        list(pool.map(one, [r for r in previous["results"] if r["claim_id"] in claims]))
    results.sort(key=lambda r: r["claim_id"])
    metrics = summarize(results)
    db.execute(
        """
        update public.eval_runs
        set status = 'done', metrics = %s, results = %s, finished_at = now()
        where id = %s
        """,
        (db.json(metrics), db.json(results), new_run_id),
    )
    return metrics


def rescore(eval_run_id: str) -> dict:
    """Score a finished run again from its stored checks (after a label fix); no model calls."""
    run_row = db.fetch_one("select results from public.eval_runs where id = %s", (eval_run_id,))
    if not run_row:
        raise jobs.PermanentError("eval run not found")
    manifest = load_manifest()
    claims = {c["id"]: c for c in manifest["claims"]}
    documents = {d["id"]: d for d in manifest["documents"]}
    results = [
        score_claim(
            claims[r["claim_id"]],
            check_id=r["check_id"],
            documents=documents,
            seconds=r["seconds"],
            error=r.get("error"),
        )
        for r in run_row["results"]
        if r["claim_id"] in claims
    ]
    results.sort(key=lambda r: r["claim_id"])
    metrics = summarize(results)
    db.execute(
        "update public.eval_runs set metrics = %s, results = %s where id = %s",
        (db.json(metrics), db.json(results), eval_run_id),
    )
    return metrics


def _cleanup(newsroom_id: str) -> None:
    db.execute(
        "delete from public.checks where newsroom_id = %s and created_at < now() - %s * interval '1 day'",
        (newsroom_id, KEEP_CHECKS_DAYS),
    )


def run(
    eval_run_id: str,
    *,
    limit: int | None = None,
    only: list[str] | None = None,
    concurrency: int = 3,
) -> dict:
    run_row = db.fetch_one("select * from public.eval_runs where id = %s", (eval_run_id,))
    if not run_row:
        raise jobs.PermanentError("eval run not found")
    options = run_row["settings"] or {}
    limit = limit or options.get("limit")
    only = only or options.get("only")
    db.execute(
        "update public.eval_runs set status = 'running', error = null, results = '[]' where id = %s",
        (eval_run_id,),
    )
    manifest = load_manifest()
    claims = [c for c in manifest["claims"] if not only or c["id"] in only]
    if limit:
        claims = claims[: int(limit)]
    documents = {d["id"]: d for d in manifest["documents"]}
    newsroom_id = ensure_newsroom()
    _cleanup(newsroom_id)

    results: list[dict] = []
    lock = threading.Lock()

    def one(claim: dict) -> None:
        result = evaluate_claim(
            claim, newsroom_id=newsroom_id, run_id=eval_run_id, documents=documents
        )
        with lock:
            results.append(result)
            done = sorted(results, key=lambda r: r["claim_id"])
            db.execute(
                "update public.eval_runs set results = %s, metrics = %s where id = %s",
                (db.json(done), db.json({"progress": len(done), "of": len(claims)}), eval_run_id),
            )
        log.info(
            "%s expected %-7s got %-7s %s (%s, %.0fs)",
            claim["id"],
            result["expected"],
            result["predicted"],
            "✓" if result["correct"] else "✗",
            result["how"],
            result["seconds"],
        )

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        list(pool.map(one, claims))

    results.sort(key=lambda r: r["claim_id"])
    metrics = summarize(results)
    db.execute(
        """
        update public.eval_runs
        set status = 'done', metrics = %s, results = %s, finished_at = now()
        where id = %s
        """,
        (db.json(metrics), db.json(results), eval_run_id),
    )
    log.info(
        "eval %s: accuracy %.1f%% on %d claims, cost $%.2f",
        eval_run_id,
        metrics["accuracy"] * 100,
        metrics["total"],
        metrics["cost_usd"],
    )
    return metrics
