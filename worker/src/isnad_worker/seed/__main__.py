"""`python -m isnad_worker.seed [catalog|demo|registry|snapshot|documents|admin|showcase|all] [options]`
(default: all).

registry: restore the committed registry snapshot (no model calls); snapshot: write it from the database.
demo-checks: restore processed demo checks (no model calls); demo-checks-export --titles "a|b": write them.

showcase (demo checks the running worker processes; costs model calls; not part of "all"):
  --no-wait         create the checks without waiting for them or applying review states

admin options (first Isnad administrator on a new deployment; not part of "all"):
  --email EMAIL --name NAME   the password is read from ISNAD_ADMIN_PASSWORD or asked for

documents options:
  --review          leave extracted figures for curator review instead of approving verified ones
  --force           read documents again even when their content is unchanged
  --reverify        re-check unchanged documents' figures against their stored text (no model calls)
  --only ID[,ID]    seed only these manifest document ids
  --concurrency N   documents read in parallel (default 3)
The corpus folder defaults to testdata/ in the repository; set ISNAD_CORPUS_DIR to use another.
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
        default="all",
        choices=[
            "catalog",
            "demo",
            "registry",
            "demo-checks",
            "snapshot",
            "demo-checks-export",
            "documents",
            "admin",
            "showcase",
            "all",
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
    if args.what == "snapshot":
        from isnad_worker.seed import registry_snapshot

        registry_snapshot.export()
        return
    if args.what == "demo-checks-export":
        from isnad_worker.seed import demo_checks

        demo_checks.export([t for t in args.titles.split("|") if t])
        return
    if args.what == "showcase":
        from isnad_worker.seed import showcase

        showcase.run(wait=not args.no_wait)
        return
    if args.what in ("catalog", "all"):
        catalog.run()
    if args.what in ("demo", "all"):
        demo.run()
    if args.what in ("registry", "all"):
        from isnad_worker.seed import registry_snapshot

        registry_snapshot.restore()
    if args.what in ("demo-checks", "all"):
        from isnad_worker.seed import demo_checks

        demo_checks.restore()
    if args.what in ("documents", "all"):
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
