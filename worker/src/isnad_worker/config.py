from functools import cached_property
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Worker settings, read from the environment and `worker/.env` (written by `make env`)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database and Supabase (the secret key bypasses row-level security: server only)
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_secret_key: str = ""

    # Public URL of the web app, used in links (Telegram replies, alerts, emails)
    site_url: str = "http://localhost:3000"

    # Shared secret for web → worker API calls
    internal_api_token: str = ""

    # Gemini API (Google AI Studio key): every model task, transcription included
    gemini_api_key: str = ""

    # Telegram
    telegram_bot_token: str = ""
    telegram_mode: Literal["polling", "webhook", "off"] = "polling"
    telegram_webhook_secret: str = ""
    # Public URL Telegram posts updates to (webhook mode); defaults to SITE_URL/telegram/webhook,
    # which the reverse proxy routes to the worker API.
    telegram_webhook_url: str = ""

    # Worker behaviour
    worker_concurrency: int = 4
    poll_interval_seconds: float = 5.0
    job_timeout_minutes: int = 30
    discovery_enabled: bool = True
    # Web searches per check; numbers past the budget can be searched on demand from the check page.
    discovery_per_check: int = 8
    watch_interval_hours: int = 24

    def supabase_headers(self) -> dict[str, str]:
        """Headers for server-side calls to Supabase with the secret key.

        Secret keys (sb_secret_…) go in `apikey`; the gateway handles the rest. A self-hosted
        stack's service-role key is a JWT, which Storage and Auth also expect as a bearer token.
        """
        headers = {"apikey": self.supabase_secret_key}
        if self.supabase_secret_key.startswith("eyJ"):
            headers["authorization"] = f"Bearer {self.supabase_secret_key}"
        return headers

    @cached_property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token) and self.telegram_mode != "off"


settings = Settings()
