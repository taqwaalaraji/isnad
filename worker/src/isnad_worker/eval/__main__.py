"""`python -m isnad_worker.eval [--limit N] [--only claim-001,...] [--no-discovery]`

Runs the labelled corpus claims through the check pipeline in this process and prints the metrics.
The run is stored in `eval_runs` like a run started from the console.
"""

from __future__ import annotations

import argparse
import json
import logging

from isnad_worker import db
from isnad_worker.config import settings
from isnad_worker.eval import harness


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m isnad_worker.eval")
    parser.add_argument("--limit", type=int, default=None, help="evaluate only the first N claims")
    parser.add_argument("--only", default="", help="comma-separated claim ids")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument(
        "--rescore", metavar="RUN_ID", help="score a finished run again from its stored checks"
    )
    parser.add_argument(
        "--recheck",
        metavar="RUN_ID",
        help="re-run comparison for a finished run's checks (same extracted claims) as a new run",
    )
    parser.add_argument(
        "--no-discovery",
        action="store_true",
        help="registry only: don't search official sites for numbers the registry lacks",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    for noisy in ("httpx", "httpx2", "google_genai"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if args.no_discovery:
        # This process runs only the evaluation, so changing the setting here affects nothing else.
        settings.discovery_enabled = False

    if args.rescore:
        metrics = harness.rescore(args.rescore)
        print(json.dumps({"eval_run_id": args.rescore, **metrics}, indent=2, ensure_ascii=False))
        return

    only = [x for x in args.only.split(",") if x] or None
    # The models in use, recorded like a console run's so runs can be compared.
    models = {
        r["task"]: {
            "model": r["model"],
            "effort": r["effort"],
            "escalation": r["escalation_model"],
            "enabled": r["enabled"],
        }
        for r in db.fetch_all(
            "select task, model, effort, escalation_model, enabled from public.model_settings"
        )
    }
    options = {
        **models,
        "limit": args.limit,
        "only": only,
        "discovery": settings.discovery_enabled,
        "source": "cli",
    }
    if args.recheck:
        options["recheck_of"] = args.recheck
    run_id = str(
        db.fetch_one(
            "insert into public.eval_runs (status, settings) values ('running', %s) returning id",
            (db.json(options),),
        )["id"]
    )
    if args.recheck:
        metrics = harness.recheck(args.recheck, run_id, concurrency=args.concurrency)
    else:
        metrics = harness.run(run_id, limit=args.limit, only=only, concurrency=args.concurrency)
    print(json.dumps({"eval_run_id": run_id, **metrics}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
