"""Supabase Auth admin API (create users, invite) with the secret key."""

from __future__ import annotations

import httpx2 as httpx

from isnad_worker.config import settings


def _headers() -> dict[str, str]:
    return {**settings.supabase_headers(), "content-type": "application/json"}


def _url(path: str) -> str:
    return settings.supabase_url.rstrip("/") + "/auth/v1/" + path.lstrip("/")


def find_user_by_email(email: str) -> dict | None:
    page = 1
    while True:
        r = httpx.get(
            _url("admin/users"),
            headers=_headers(),
            params={"page": page, "per_page": 200},
            timeout=30,
        )
        r.raise_for_status()
        users = r.json().get("users", [])
        for user in users:
            if (user.get("email") or "").lower() == email.lower():
                return user
        if len(users) < 200:
            return None
        page += 1


def ensure_user(email: str, password: str, full_name: str, locale: str = "ar") -> str:
    """Create a confirmed user (or return the existing one's id)."""
    existing = find_user_by_email(email)
    if existing:
        return existing["id"]
    r = httpx.post(
        _url("admin/users"),
        headers=_headers(),
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name, "locale": locale},
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["id"]
