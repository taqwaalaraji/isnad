"""Write `web/.env.local` and `worker/.env` for local development.

Reads the running local Supabase (`supabase status`), keeps generated secrets stable across runs,
and merges the API keys from `credentials.env` at the repository root (git-ignored; created from
`credentials.env.example` on the first run), skipping empty values. `ISNAD_CREDENTIALS_DIR` can name
a folder of `*.env` files to read the keys from as well. Prints variable names only, never values.
Run with `make env`.
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
WEB_ENV = REPO / "web" / ".env.local"
WORKER_ENV = REPO / "worker" / ".env"
CREDENTIALS_FILE = REPO / "credentials.env"
CREDENTIALS_EXAMPLE = REPO / "credentials.env.example"
CREDENTIALS_DIR = os.environ.get("ISNAD_CREDENTIALS_DIR")

# The keys the worker uses; any other value in those files stays out of the local env files.
USED = {"GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN"}


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"')
    return values


def supabase_status() -> dict[str, str]:
    out = subprocess.run(
        ["supabase", "status", "-o", "env"], cwd=REPO, capture_output=True, text=True, check=False
    )
    if out.returncode != 0:
        sys.exit("Local Supabase isn't running. Start it with `make db`.")
    return read_env_text(out.stdout)


def read_env_text(text: str) -> dict[str, str]:
    values = {}
    for line in text.splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
    return values


def credentials() -> dict[str, str]:
    if not CREDENTIALS_FILE.exists() and CREDENTIALS_EXAMPLE.exists():
        CREDENTIALS_FILE.write_text(CREDENTIALS_EXAMPLE.read_text())
        CREDENTIALS_FILE.chmod(0o600)
        print("Created credentials.env from credentials.env.example: add your keys there.")
    files = sorted(Path(CREDENTIALS_DIR).glob("*.env")) if CREDENTIALS_DIR else []
    merged: dict[str, str] = {}
    for file in [*files, CREDENTIALS_FILE]:
        for key, value in read_env(file).items():
            if value and key in USED:
                merged[key] = value
    return merged


def telegram_username(token: str) -> str | None:
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getMe", timeout=10) as r:
            data = json.load(r)
        return data["result"]["username"] if data.get("ok") else None
    except (OSError, ValueError, KeyError):
        return None


def write(path: Path, values: dict[str, str], header: str) -> None:
    lines = [f"# {header}", "# Written by `make env`; regenerate rather than editing by hand.", ""]
    lines += [f"{k}={v}" for k, v in values.items()]
    path.write_text("\n".join(lines) + "\n")
    path.chmod(0o600)


def main() -> None:
    status = supabase_status()
    previous = {**read_env(WORKER_ENV), **read_env(WEB_ENV)}
    internal_token = previous.get("INTERNAL_API_TOKEN") or secrets.token_urlsafe(32)
    creds = credentials()

    site_url = "http://localhost:3000"
    worker_values = {
        "DATABASE_URL": status["DB_URL"],
        "SUPABASE_URL": status["API_URL"],
        "SUPABASE_SECRET_KEY": status["SECRET_KEY"],
        "SITE_URL": site_url,
        "INTERNAL_API_TOKEN": internal_token,
        **creds,
    }
    web_values = {
        "NEXT_PUBLIC_SUPABASE_URL": status["API_URL"],
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": status["PUBLISHABLE_KEY"],
        "SUPABASE_SECRET_KEY": status["SECRET_KEY"],
        "SITE_URL": site_url,
        "WORKER_API_URL": "http://localhost:8000",
        "INTERNAL_API_TOKEN": internal_token,
    }
    if (token := creds.get("TELEGRAM_BOT_TOKEN")) and (username := telegram_username(token)):
        web_values["NEXT_PUBLIC_TELEGRAM_BOT_USERNAME"] = username

    write(WORKER_ENV, worker_values, "Isnad worker — local development")
    write(WEB_ENV, web_values, "Isnad web — local development")
    print(f"Wrote {WORKER_ENV.relative_to(REPO)}: {', '.join(worker_values)}")
    print(f"Wrote {WEB_ENV.relative_to(REPO)}: {', '.join(web_values)}")
    if not creds:
        print(
            "No API keys in credentials.env: new checks need GEMINI_API_KEY (the demo data works without)."
        )


if __name__ == "__main__":
    main()
