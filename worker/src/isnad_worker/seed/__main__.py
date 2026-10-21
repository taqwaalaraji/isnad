"""`python -m isnad_worker.seed <what> [options]` (default: base).

Two seeds:
  base        the shared catalog: topics, indicators, entities and official sources (`make seed`;
              every deployment needs it). Same as `catalog`.
  demo-data   the demo, exactly as it was recorded (`make seed-demo`; local and demo installs only):
              demo accounts and newsrooms, the registry (documents, stored copies, figures), every
              check with its decisions, and the rest of the state (alerts, activity, usage, briefs,
              evaluation runs). No model calls; idempotent.
  all         base, then demo-data.

Parts of demo-data: demo (accounts and newsrooms), registry, demo-checks, state.
Writing the demo data from a database (`make seed-export`): export = snapshot + demo-checks-export
(every finished check, or --titles "a|b") + state-export, and sample-data/README.md.

showcase (demo checks the running worker processes; costs model calls):
  --no-wait         create the checks without waiting for them or applying review states

admin options (first Isnad administrator on a new deployment):
  --email EMAIL --name NAME   the password is read from ISNAD_ADMIN_PASSWORD or asked for

documents (read the corpus documents into the registry; costs model calls) options:
  --review          leave extracted figures for curator review instead of approving verified ones
  --force           read documents again even when their content is unchanged
  --reverify        re-check unchanged documents' figures against their stored text (no model calls)
  --only ID[,ID]    seed only these manifest document ids
  --concurrency N   documents read in parallel (default 3)
The corpus folder defaults to sample-data/ in the repository; set ISNAD_CORPUS_DIR to use another.
"""

import argparse
import getpass
import logging
import os

from isnad_worker import db
from isnad_worker.seed import auth_admin, catalog, demo


def bootstrap_admin(email: str, name: str) -> None:
    """Create (or promote) the platform administrator who then invites everyone else."""
    if not email or not name:
        raise SystemExit("admin needs --email and --name")
    password = os.environ.get("ISNAD_ADMIN_PASSWORD") or getpass.getpass(
        "Password (12+ characters): "
    )
    if len(password) < 12:
        raise SystemExit("Use a password of at least 12 characters.")
    user_id = auth_admin.ensure_user(email, password, name)
    db.execute(
        "update public.profiles set platform_role = 'admin', full_name = %s where id = %s",
        (name, user_id),
    )
    logging.getLogger("isnad.seed").info("platform admin ready: %s", email)


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m isnad_worker.seed")
    parser.add_argument(
        "what",
        nargs="?",
        default="base",
        choices=[
            "base",
            "catalog",
            "demo-data",
            "demo",
            "registry",
            "demo-checks",
            "state",
            "all",
            "export",
            "snapshot",
            "demo-checks-export",
            "state-export",
            "readme",
            "documents",
            "admin",
            "showcase",
        ],
    )
    parser.add_argument("--no-wait", action="store_true")
    parser.add_argument("--titles", default="", help="demo-checks-export: titles separated by |")
    parser.add_argument("--email", default="")
    parser.add_argument("--name", default="")
    parser.add_argument("--review", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--reverify", action="store_true")
    parser.add_argument("--only", default="")
    parser.add_argument("--concurrency", type=int, default=3)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    for noisy in ("httpx", "httpx2", "google_genai"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    if args.what == "admin":
        bootstrap_admin(args.email, args.name)
        return
    what = args.what
    if what in ("snapshot", "export"):
        from isnad_worker.seed import registry_snapshot

        registry_snapshot.export()
    if what in ("demo-checks-export", "export"):
        from isnad_worker.seed import demo_checks

        demo_checks.export([t for t in args.titles.split("|") if t])
    if what in ("state-export", "export"):
        from isnad_worker.seed import state

        state.export()
    if what in ("readme", "export"):
        from isnad_worker.seed import sample_readme

        sample_readme.write()
    if what == "showcase":
        from isnad_worker.seed import showcase

        showcase.run(wait=not args.no_wait)
        return
    demo_data = what in ("demo-data", "all")
    if what in ("base", "catalog", "all"):
        catalog.run()
    if what == "demo" or demo_data:
        demo.run()
    if what == "registry" or demo_data:
        from isnad_worker.seed import registry_snapshot

        registry_snapshot.restore()
    if what == "demo-checks" or demo_data:
        from isnad_worker.seed import demo_checks

        demo_checks.restore()
    if what == "state" or demo_data:
        from isnad_worker.seed import state

        state.restore()
    if what == "documents":
        from isnad_worker.seed import documents

        documents.run(
            auto_approve=not args.review,
            only=[x for x in args.only.split(",") if x] or None,
            force=args.force,
            reverify=args.reverify,
            concurrency=args.concurrency,
        )


if __name__ == "__main__":
    main()
