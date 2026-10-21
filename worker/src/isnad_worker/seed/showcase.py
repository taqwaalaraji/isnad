"""Demo checks for showcases: real newspaper claims grouped as newsroom drafts, plus real Arabic clips
(broadcast reports, interviews, a podcast) downloaded with `make media`.

The checks go through the real pipeline (the worker must be running), then get realistic review states:
one published with a public evidence page, one escalated, one with matches approved, one sent to an
editor, the rest awaiting review. Idempotent by (newsroom, title). Never for production data.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import time
import uuid
from contextlib import contextmanager

from isnad_worker import db, storage
from isnad_worker.seed.catalog import SAMPLE_DATA, SEED_DATA

log = logging.getLogger("isnad.seed")

MANIFEST = SAMPLE_DATA / "manifest.json"
MEDIA_DIR = SAMPLE_DATA / "media"
WAIT_SECONDS = 30 * 60

KIND_BY_SUFFIX = {
    ".mp4": "video",
    ".mov": "video",
    ".m4a": "audio",
    ".mp3": "audio",
    ".wav": "audio",
}


@contextmanager
def _as_user(user_id: str):
    """A transaction in which auth.uid() is this user, so workflow functions check their real role."""
    with db.transaction() as conn:
        conn.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": user_id, "role": "authenticated"}),),
        )
        yield conn


def _user_id(email: str) -> str:
    row = db.fetch_one("select id from public.profiles where email = %s", (email,))
    if not row:
        raise SystemExit(
            f"demo user {email} is missing: run `python -m isnad_worker.seed demo` first"
        )
    return str(row["id"])


def _article_text(claim_ids: list[str], claims: dict[str, dict]) -> str:
    missing = [c for c in claim_ids if c not in claims]
    if missing:
        raise SystemExit(f"claims not in the manifest: {missing}")
    return "\n\n".join(claims[c]["text_ar"].strip() for c in claim_ids)


def _create(spec: dict, claims: dict[str, dict]) -> str | None:
    newsroom = db.fetch_one("select id from public.newsrooms where slug = %s", (spec["newsroom"],))
    if not newsroom:
        raise SystemExit(f"newsroom {spec['newsroom']} is missing: run the demo seed first")
    existing = db.fetch_one(
        "select id from public.checks where newsroom_id = %s and title = %s",
        (newsroom["id"], spec["title"]),
    )
    if existing:
        log.info("exists: %s", spec["title"])
        return None
    author = _user_id(spec["author"])
    desk = (
        db.fetch_one(
            "select id from public.desks where newsroom_id = %s and name = %s",
            (newsroom["id"], spec["desk"]),
        )
        if spec.get("desk")
        else None
    )
    check_id = str(uuid.uuid4())
    row = {
        "id": check_id,
        "newsroom_id": newsroom["id"],
        "created_by": author,
        "desk_id": desk["id"] if desk else None,
        "title": spec["title"],
        "recorded_at": spec["recorded_at"],
        "speakers": spec.get("speakers"),
    }
    if spec.get("media"):
        source = MEDIA_DIR / spec["media"]
        if not source.exists():
            log.warning("skipped %s: %s missing (run `make media`)", spec["title"], source.name)
            return None
        path = f"{newsroom['id']}/{uuid.uuid4()}/original{source.suffix}"
        mime = mimetypes.guess_type(source.name)[0] or "application/octet-stream"
        if source.suffix == ".m4a":
            mime = "audio/mp4"
        storage.upload_file(storage.MEDIA, path, source, mime)
        row |= {
            "input_kind": KIND_BY_SUFFIX[source.suffix],
            "storage_path": path,
            # The name a journalist's upload would carry (the downloaded file's name is technical).
            "original_filename": spec.get("filename") or source.name,
            "mime_type": mime,
            "size_bytes": source.stat().st_size,
        }
    else:
        row |= {"input_kind": "text", "input_text": _article_text(spec["claims"], claims)}
    columns = ", ".join(row)
    db.execute(
        f"insert into public.checks ({columns}) values ({', '.join(['%s'] * len(row))})",
        tuple(row.values()),
    )
    log.info("created: %s", spec["title"])
    return check_id


def _wait(check_ids: list[str]) -> None:
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        rows = db.fetch_all(
            "select title, status from public.checks where id = any(%s::uuid[])", (check_ids,)
        )
        pending = [r["title"] for r in rows if r["status"] == "processing"]
        if not pending:
            return
        log.info("waiting for the worker: %d of %d processing", len(pending), len(check_ids))
        time.sleep(15)
    raise SystemExit("timed out waiting for the worker; is `make worker` running?")


def _review(check_id: str, spec: dict, base_url: str) -> None:
    action = spec.get("review")
    if not action:
        return
    status = db.fetch_one("select status from public.checks where id = %s", (check_id,))
    # Newsroom policy may already have escalated a number the verifier objected to; an editor
    # handles those too.
    if not status or status["status"] not in ("awaiting_review", "in_review", "escalated"):
        log.warning("not reviewing %s (status %s)", spec["title"], status and status["status"])
        return
    editor = _user_id(spec["editor"])
    author = _user_id(spec["author"])
    if action == "send_for_review":
        with _as_user(author) as conn:
            conn.execute("select public.send_for_review(%s, %s)", (check_id, editor))
        return
    with _as_user(editor) as conn:
        conn.execute("select public.approve_matches(%s)", (check_id,))
        if action == "approve_matches":
            return
        rows = conn.execute(
            """
            select c.id, r.verdict, r.suggested_wording from public.claims c
            join public.claim_results r on r.claim_id = c.id
            where c.check_id = %s and c.checkable and c.review_state in ('pending', 'escalated')
            order by c.idx
            """,
            (check_id,),
        ).fetchall()
        if action == "escalate":
            target = next((r for r in rows if r["verdict"] == "differs"), rows[0] if rows else None)
            if target:
                conn.execute(
                    "select public.decide_claim(%s, 'escalate', %s)",
                    (target["id"], "الرقم الرسمي مختلف؛ نحتاج تأكيد المصدر قبل النشر."),
                )
            return
        # publish: every number decided (differences take the corrected wording), then approve and publish.
        for r in rows:
            if r["verdict"] in ("differs", "context") and r["suggested_wording"]:
                conn.execute(
                    "select public.decide_claim(%s, 'edit', %s, %s)",
                    (r["id"], "صُحّح وفق المصدر الرسمي", r["suggested_wording"]),
                )
            else:
                conn.execute("select public.decide_claim(%s, 'approve')", (r["id"],))
        conn.execute("select public.approve_check(%s)", (check_id,))
        conn.execute("select public.publish_check(%s, %s)", (check_id, f"{base_url}{check_id[:8]}"))


def run(*, wait: bool = True) -> None:
    spec = json.loads((SEED_DATA / "showcase.json").read_text(encoding="utf-8"))
    claims = {c["id"]: c for c in json.loads(MANIFEST.read_text(encoding="utf-8"))["claims"]}
    created = [(cid, item) for item in spec["checks"] if (cid := _create(item, claims))]
    if not created:
        log.info("showcase: nothing new")
        return
    if not wait:
        return
    _wait([cid for cid, _ in created])
    for check_id, item in created:
        _review(check_id, item, spec["published_url_base"])
    log.info("showcase: %d checks ready", len(created))
