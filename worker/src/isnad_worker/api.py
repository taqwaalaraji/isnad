"""The worker's HTTP API: health, internal endpoints the web app calls with a shared token, and inbound
webhooks (Telegram).

Run with `make api` (or `uv run uvicorn isnad_worker.api:app --reload --port 8000`). In production
the reverse proxy routes only /telegram/webhook here publicly; /internal/* is reached from the web
container over the private network.
"""

import hmac
import logging
from typing import Annotated

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

from isnad_worker import ask, db
from isnad_worker.config import settings

log = logging.getLogger("isnad.api")

app = FastAPI(title="Isnad worker API", docs_url=None, redoc_url=None)


def internal_only(authorization: Annotated[str | None, Header()] = None) -> None:
    """Web → worker calls carry `Authorization: Bearer <INTERNAL_API_TOKEN>`."""
    token = settings.internal_api_token
    supplied = (authorization or "").removeprefix("Bearer ").strip()
    if not token or not hmac.compare_digest(supplied.encode(), token.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict:
    with db.connect() as conn:
        conn.execute("select 1")
    return {"status": "ok", "database": "ok"}


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    newsroom_id: str | None = None


@app.post("/internal/ask", dependencies=[Depends(internal_only)])
def internal_ask(body: AskRequest) -> dict:
    return ask.answer(body.question, body.newsroom_id)


def _handle_update(update: dict) -> None:
    from isnad_worker.telegram import bot

    try:
        bot.handle_update(update)
    except Exception:
        log.exception("telegram update %s failed", update.get("update_id"))


@app.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    background: BackgroundTasks,
    secret: str | None = Header(default=None, alias="X-Telegram-Bot-Api-Secret-Token"),
) -> dict:
    """Telegram updates (webhook mode). Answers at once; the update is handled in the background."""
    expected = settings.telegram_webhook_secret
    if not settings.telegram_enabled or not expected:
        raise HTTPException(status_code=404)
    if not secret or not hmac.compare_digest(secret.encode(), expected.encode()):
        raise HTTPException(status_code=403)
    try:
        update = await request.json()
    except ValueError:
        raise HTTPException(status_code=400) from None
    if not isinstance(update, dict) or "update_id" not in update:
        raise HTTPException(status_code=400)
    background.add_task(_handle_update, update)
    return {"ok": True}
