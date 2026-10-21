"""Supabase Storage over its REST API, with the secret key (server only)."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import quote

import httpx2 as httpx

from isnad_worker.config import settings

MEDIA = "media"
DOCUMENTS = "documents"


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    return {**settings.supabase_headers(), **(extra or {})}


def _url(*parts: str) -> str:
    return settings.supabase_url.rstrip("/") + "/storage/v1/" + "/".join(parts)


def _object_path(path: str) -> str:
    return quote(path.lstrip("/"), safe="/")


def upload(bucket: str, path: str, data: bytes, content_type: str | None = None) -> None:
    content_type = content_type or mimetypes.guess_type(path)[0] or "application/octet-stream"
    response = httpx.post(
        _url("object", bucket, _object_path(path)),
        headers=_headers({"content-type": content_type, "x-upsert": "true"}),
        content=data,
        timeout=300,
    )
    response.raise_for_status()


def upload_file(bucket: str, path: str, file: Path, content_type: str | None = None) -> None:
    content_type = content_type or mimetypes.guess_type(file.name)[0] or "application/octet-stream"
    with file.open("rb") as fh:
        response = httpx.post(
            _url("object", bucket, _object_path(path)),
            headers=_headers({"content-type": content_type, "x-upsert": "true"}),
            content=fh,
            timeout=600,
        )
    response.raise_for_status()


def download(bucket: str, path: str) -> bytes:
    response = httpx.get(
        _url("object", bucket, _object_path(path)), headers=_headers(), timeout=300
    )
    response.raise_for_status()
    return response.content


def download_to(bucket: str, path: str, dest: Path) -> Path:
    with httpx.stream(
        "GET", _url("object", bucket, _object_path(path)), headers=_headers(), timeout=600
    ) as r:
        r.raise_for_status()
        with dest.open("wb") as fh:
            for chunk in r.iter_bytes(1 << 20):
                fh.write(chunk)
    return dest


def signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    response = httpx.post(
        _url("object", "sign", bucket, _object_path(path)),
        headers=_headers({"content-type": "application/json"}),
        json={"expiresIn": expires_in},
        timeout=30,
    )
    response.raise_for_status()
    return settings.supabase_url.rstrip("/") + "/storage/v1" + response.json()["signedURL"]


def remove(bucket: str, paths: list[str]) -> None:
    if not paths:
        return
    response = httpx.request(
        "DELETE",
        _url("object", bucket),
        headers=_headers({"content-type": "application/json"}),
        json={"prefixes": paths},
        timeout=60,
    )
    response.raise_for_status()


def list_prefix(bucket: str, prefix: str) -> list[str]:
    response = httpx.post(
        _url("object", "list", bucket),
        headers=_headers({"content-type": "application/json"}),
        json={"prefix": prefix, "limit": 1000},
        timeout=60,
    )
    response.raise_for_status()
    return [f"{prefix.rstrip('/')}/{item['name']}" for item in response.json()]
