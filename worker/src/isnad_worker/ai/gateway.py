"""One door to the models (Gemini API): per-task settings, structured outputs, escalation, usage.

Every call goes through `parse` (structured output) or `generate` (free text, e.g. with Google
Search). Both read the task's model and thinking level from `public.model_settings` and record
tokens, search queries and cost in `public.usage_events`.

Cheap first: every task runs on its primary model. A task with an escalation model is asked again
there only when the caller's own checks reject the cheap answer, and only with the part that
failed, so the expensive model reads as little as possible.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from importlib import resources
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel, ValidationError

from isnad_worker import db, jobs
from isnad_worker.config import settings

log = logging.getLogger("isnad.ai")

PROVIDER = "google"


@dataclass(frozen=True)
class Price:
    """USD per million tokens. Thinking tokens bill as output."""

    input: Decimal
    output: Decimal
    cache: Decimal
    audio: Decimal | None = None  # audio input, where it differs from text


PRICES: dict[str, Price] = {
    "gemini-3.5-flash-lite": Price(Decimal("0.30"), Decimal("2.50"), Decimal("0.03")),
    "gemini-3.1-flash-lite": Price(
        Decimal("0.25"), Decimal("1.50"), Decimal("0.025"), audio=Decimal("0.50")
    ),
    "gemini-3.8-flash": Price(Decimal("0.75"), Decimal("3.75"), Decimal("0.075")),
    "gemini-3.5-transcribe": Price(Decimal(2), Decimal(12), Decimal(0), audio=Decimal(2)),
}
# Announced price changes: (from, price).
PRICE_CHANGES: dict[str, tuple[date, Price]] = {
    "gemini-3.8-flash": (
        date(2027, 1, 1),
        Price(Decimal("1.50"), Decimal("7.50"), Decimal("0.15")),
    ),
}
# Google Search grounding: 5,000 free queries a month across Gemini 3 models, then $14 per 1,000.
# Recorded at the paid rate, so the console shows what the traffic costs past the free tier.
SEARCH_QUERY_USD = Decimal("0.014")

DEFAULT_MODEL = "gemini-3.5-flash-lite"
THINKING_LEVELS = ("minimal", "low", "medium", "high")
# Models without the "minimal" thinking level get "low" instead.
_NO_MINIMAL_THINKING = {"gemini-3.8-flash"}
_REFUSAL_REASONS = {
    "SAFETY",
    "RECITATION",
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "SPII",
    "LANGUAGE",
    "IMAGE_SAFETY",
    "IMAGE_PROHIBITED_CONTENT",
}


class ModelRefusal(Exception):
    """The model declined the request (a safety or policy block)."""


class ModelOutputError(Exception):
    """The response was cut off or didn't contain the expected output."""


class TaskDisabled(ModelRefusal):
    """The task was switched off in the console; callers fall back as they do for a refusal."""


@dataclass(frozen=True)
class TaskSettings:
    task: str
    provider: str
    model: str
    effort: str
    max_tokens: int | None = None
    enabled: bool = True
    escalation_model: str | None = None


@dataclass(frozen=True)
class CallContext:
    """Who the call is for, so usage can be attributed."""

    newsroom_id: str | None = None
    check_id: str | None = None


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0  # uncached text, images, documents and tool results
    audio_tokens: int = 0
    cache_read_tokens: int = 0
    output_tokens: int = 0  # answer and thinking
    search_queries: int = 0
    audio_seconds: float = 0.0


_client: genai.Client | None = None
_client_lock = threading.Lock()
_settings_cache: tuple[float, dict[str, TaskSettings]] = (0.0, {})
_SETTINGS_TTL = 60.0
# Per-request timeouts for generate calls; the client's own (10 minutes) is for transcription.
SHORT_CALL_TIMEOUT_MS = 120_000
LONG_CALL_TIMEOUT_MS = 300_000


def client() -> genai.Client:
    global _client
    with _client_lock:
        if _client is None:
            if not settings.gemini_api_key:
                raise jobs.PermanentError("GEMINI_API_KEY isn't set on the worker.")
            _client = genai.Client(
                api_key=settings.gemini_api_key,
                http_options=types.HttpOptions(
                    timeout=600_000,
                    retry_options=types.HttpRetryOptions(
                        attempts=5,
                        initial_delay=2.0,
                        max_delay=60.0,
                        http_status_codes=[408, 429, 500, 502, 503, 504],
                    ),
                ),
            )
        return _client


def task_settings(task: str) -> TaskSettings:
    global _settings_cache
    loaded_at, cached = _settings_cache
    if time.monotonic() - loaded_at > _SETTINGS_TTL:
        rows = db.fetch_all(
            """
            select task, provider, model, effort, max_tokens, enabled, escalation_model
            from public.model_settings
            """
        )
        cached = {r["task"]: TaskSettings(**r) for r in rows}
        _settings_cache = (time.monotonic(), cached)
    return cached.get(task) or TaskSettings(task, PROVIDER, DEFAULT_MODEL, "low")


def _enabled_settings(task: str) -> TaskSettings:
    cfg = task_settings(task)
    if not cfg.enabled:
        raise TaskDisabled(f"{task} is switched off in the console")
    return cfg


def can_escalate(task: str) -> bool:
    """Whether the task has a stronger model to ask when its cheap answer fails a check."""
    cfg = task_settings(task)
    return cfg.enabled and bool(cfg.escalation_model) and cfg.escalation_model != cfg.model


def prompt(name: str) -> str:
    """A prompt file from `isnad_worker/prompts/` (kept byte-stable so its prefix caches)."""
    return (
        resources.files("isnad_worker.prompts").joinpath(f"{name}.md").read_text(encoding="utf-8")
    )


def price(model: str, on: date | None = None) -> Price:
    change = PRICE_CHANGES.get(model)
    if change and (on or date.today()) >= change[0]:
        return change[1]
    return PRICES.get(model, PRICES[DEFAULT_MODEL])


def cost_usd(model: str, usage: Usage, on: date | None = None) -> Decimal:
    p = price(model, on)
    return (
        Decimal(usage.input_tokens) * p.input
        + Decimal(usage.audio_tokens) * (p.audio if p.audio is not None else p.input)
        + Decimal(usage.cache_read_tokens) * p.cache
        + Decimal(usage.output_tokens) * p.output
    ) / Decimal(1_000_000) + usage.search_queries * SEARCH_QUERY_USD


def _searches(response: types.GenerateContentResponse) -> int:
    """Search queries the call ran (billed per query). The list isn't always reported; results are."""
    return len(search_queries(response)) or (1 if grounding_uris(response) else 0)


def usage_of(response: types.GenerateContentResponse) -> Usage:
    u = response.usage_metadata
    if u is None:
        return Usage(search_queries=_searches(response))
    audio = sum(
        d.token_count or 0
        for d in u.prompt_tokens_details or []
        if d.modality == types.MediaModality.AUDIO
    )
    cached = u.cached_content_token_count or 0
    return Usage(
        input_tokens=max(0, (u.prompt_token_count or 0) - cached - audio)
        + (u.tool_use_prompt_token_count or 0),
        audio_tokens=audio,
        cache_read_tokens=cached,
        output_tokens=(u.candidates_token_count or 0) + (u.thoughts_token_count or 0),
        search_queries=_searches(response),
    )


def record_usage(task: str, model: str, usage: Usage, ctx: CallContext, duration_ms: int) -> None:
    try:
        db.execute(
            """
            insert into public.usage_events
              (newsroom_id, check_id, task, provider, model, input_tokens, output_tokens, cache_read_tokens,
               search_queries, audio_seconds, cost_usd, duration_ms)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                ctx.newsroom_id,
                ctx.check_id,
                task,
                PROVIDER,
                model,
                usage.input_tokens + usage.audio_tokens,
                usage.output_tokens,
                usage.cache_read_tokens,
                usage.search_queries,
                usage.audio_seconds,
                cost_usd(model, usage),
                duration_ms,
            ),
        )
    except Exception:
        log.exception("failed to record usage for %s", task)


def pdf(data: bytes) -> types.Part:
    """A PDF to attach to a message (read natively: text, tables and page images)."""
    return types.Part.from_bytes(data=data, mime_type="application/pdf")


def _contents(messages: list[dict[str, Any]]) -> list[types.Content]:
    """Messages as {"role": "user" | "assistant", "content": str | [str | Part, ...]}."""
    contents = []
    for m in messages:
        items = m["content"] if isinstance(m["content"], list) else [m["content"]]
        contents.append(
            types.Content(
                role="model" if m["role"] in ("assistant", "model") else "user",
                parts=[types.Part.from_text(text=i) if isinstance(i, str) else i for i in items],
            )
        )
    return contents


def _thinking(model: str, level: str) -> types.ThinkingConfig:
    if level not in THINKING_LEVELS:
        level = "low"
    if level == "minimal" and model in _NO_MINIMAL_THINKING:
        level = "low"
    return types.ThinkingConfig(thinking_level=level)


def _check(response: types.GenerateContentResponse, task: str) -> None:
    feedback = response.prompt_feedback
    if feedback and feedback.block_reason:
        raise ModelRefusal(f"{task}: the request was blocked ({feedback.block_reason.name})")
    if not response.candidates:
        raise ModelOutputError(f"{task}: no answer in the response")
    reason = response.candidates[0].finish_reason
    name = reason.name if reason else "STOP"
    if name == "MAX_TOKENS":
        raise ModelOutputError(f"{task}: output was cut off at max_tokens")
    if name in _REFUSAL_REASONS:
        raise ModelRefusal(f"{task}: the model declined ({name})")


def _model_for(task: str, escalate: bool) -> tuple[TaskSettings, str]:
    cfg = _enabled_settings(task)
    if not escalate:
        return cfg, cfg.model
    if not cfg.escalation_model:
        raise TaskDisabled(f"{task} has no escalation model")
    return cfg, cfg.escalation_model


def _generate(
    task: str,
    model: str,
    cfg: TaskSettings,
    *,
    system: str | None,
    messages: list[dict[str, Any]],
    ctx: CallContext | None,
    max_tokens: int,
    effort: str | None,
    **config: Any,
) -> types.GenerateContentResponse:
    started = time.monotonic()
    response = client().models.generate_content(
        model=model,
        contents=_contents(messages),
        config=types.GenerateContentConfig(
            # Short answers get a short wait (retries still apply); long readings get longer.
            http_options=types.HttpOptions(
                timeout=SHORT_CALL_TIMEOUT_MS if max_tokens <= 8000 else LONG_CALL_TIMEOUT_MS
            ),
            system_instruction=system,
            max_output_tokens=cfg.max_tokens or max_tokens,
            thinking_config=_thinking(model, effort or cfg.effort),
            **config,
        ),
    )
    record_usage(
        task,
        model,
        usage_of(response),
        ctx or CallContext(),
        int((time.monotonic() - started) * 1000),
    )
    _check(response, task)
    return response


def parse[T: BaseModel](
    task: str,
    *,
    system: str,
    messages: list[dict[str, Any]],
    output: type[T],
    ctx: CallContext | None = None,
    max_tokens: int = 16000,
    effort: str | None = None,
    escalate: bool = False,
) -> T:
    """Structured output validated against `output`. `escalate` asks the task's stronger model."""
    cfg, model = _model_for(task, escalate)
    response = _generate(
        task,
        model,
        cfg,
        system=system,
        messages=messages,
        ctx=ctx,
        max_tokens=max_tokens,
        effort=effort,
        response_mime_type="application/json",
        response_json_schema=output.model_json_schema(),
    )
    try:
        return output.model_validate_json(response.text or "")
    except ValidationError as exc:
        raise ModelOutputError(
            f"{task}: the answer didn't match the schema ({exc.error_count()} errors)"
        ) from exc


def generate(
    task: str,
    *,
    system: str | None = None,
    messages: list[dict[str, Any]],
    ctx: CallContext | None = None,
    tools: list[types.Tool] | None = None,
    max_tokens: int = 8000,
    effort: str | None = None,
    escalate: bool = False,
) -> types.GenerateContentResponse:
    """A free-text call, optionally with server tools (Google Search)."""
    cfg, model = _model_for(task, escalate)
    return _generate(
        task,
        model,
        cfg,
        system=system,
        messages=messages,
        ctx=ctx,
        max_tokens=max_tokens,
        effort=effort,
        tools=tools,
    )


def search_queries(response: types.GenerateContentResponse) -> list[str]:
    candidate = response.candidates[0] if response.candidates else None
    metadata = candidate.grounding_metadata if candidate else None
    return list(metadata.web_search_queries or []) if metadata else []


def grounding_uris(response: types.GenerateContentResponse) -> list[str]:
    """Pages Google Search returned to the model (redirect links that lead to the real page)."""
    candidate = response.candidates[0] if response.candidates else None
    metadata = candidate.grounding_metadata if candidate else None
    if not metadata:
        return []
    return [c.web.uri for c in metadata.grounding_chunks or [] if c.web and c.web.uri]
