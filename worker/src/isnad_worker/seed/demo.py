"""Demo accounts and newsrooms for local development and demos (never for production data)."""

from __future__ import annotations

import json
import logging

from isnad_worker import db
from isnad_worker.seed import auth_admin
from isnad_worker.seed.catalog import SEED_DATA

log = logging.getLogger("isnad.seed")


def run() -> None:
    demo = json.loads((SEED_DATA / "demo.json").read_text(encoding="utf-8"))
    password = demo["password"]

    for staff in demo["staff"]:
        user_id = auth_admin.ensure_user(staff["email"], password, staff["full_name"])
        db.execute(
            "update public.profiles set platform_role = %s, full_name = %s where id = %s",
            (staff["platform_role"], staff["full_name"], user_id),
        )

    for room in demo["newsrooms"]:
        newsroom = db.fetch_one(
            """
            insert into public.newsrooms (slug, name) values (%s, %s)
            on conflict (slug) do update set name = excluded.name
            returning id
            """,
            (room["slug"], room["name"]),
        )
        desk_ids = {}
        for desk in room["desks"]:
            row = db.fetch_one(
                """
                insert into public.desks (newsroom_id, name) values (%s, %s)
                on conflict (newsroom_id, name) do update set name = excluded.name
                returning id
                """,
                (newsroom["id"], desk),
            )
            desk_ids[desk] = row["id"]
        for member in room["members"]:
            user_id = auth_admin.ensure_user(member["email"], password, member["full_name"])
            db.execute(
                "update public.profiles set full_name = %s, last_newsroom_id = coalesce(last_newsroom_id, %s) where id = %s",
                (member["full_name"], newsroom["id"], user_id),
            )
            db.execute(
                """
                insert into public.memberships (newsroom_id, user_id, role, desk_id)
                values (%s, %s, %s, %s)
                on conflict (newsroom_id, user_id) do update set role = excluded.role, desk_id = excluded.desk_id, status = 'active'
                """,
                (newsroom["id"], user_id, member["role"], desk_ids.get(member.get("desk"))),
            )
        log.info("newsroom %s: %d members", room["slug"], len(room["members"]))
