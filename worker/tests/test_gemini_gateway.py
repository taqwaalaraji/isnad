from datetime import date
from decimal import Decimal

import pytest
from google.genai import types
from pydantic import BaseModel

from isnad_worker.ai import gateway


class Answer(BaseModel):
    value: int


def response(
    text: str = '{"value": 7}',
    finish: types.FinishReason = types.FinishReason.STOP,
    *,
    prompt: int = 1000,
    cached: int = 0,
    audio: int = 0,
    output: int = 100,
    thoughts: int = 0,
    tool: int = 0,
    queries: list[str] | None = None,
    chunks: list[str] | None = None,
) -> types.GenerateContentResponse:
    grounding = (
        types.GroundingMetadata(
            web_search_queries=queries,
            grounding_chunks=[
                types.GroundingChunk(web=types.GroundingChunkWeb(uri=u)) for u in chunks or []
            ],
        )
        if queries or chunks
        else None
    )
    details = [
        types.ModalityTokenCount(modality=types.MediaModality.TEXT, token_count=prompt - audio)
    ]
    if audio:
        details.append(
            types.ModalityTokenCount(modality=types.MediaModality.AUDIO, token_count=audio)
        )
    return types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(role="model", parts=[types.Part.from_text(text=text)]),
                finish_reason=finish,
                grounding_metadata=grounding,
            )
        ],
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=prompt,
            cached_content_token_count=cached,
            candidates_token_count=output,
            thoughts_token_count=thoughts,
            tool_use_prompt_token_count=tool,
            prompt_tokens_details=details,
        ),
    )


class FakeModels:
    def __init__(self, replies: list[types.GenerateContentResponse]) -> None:
        self.replies = replies
        self.calls: list[dict] = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return self.replies.pop(0)


class FakeClient:
    def __init__(self, replies: list[types.GenerateContentResponse]) -> None:
        self.models = FakeModels(replies)


@pytest.fixture
def fake(monkeypatch):
    recorded: list[tuple[str, str, gateway.Usage]] = []

    def install(replies, settings=None):
        client = FakeClient(list(replies))
        cfg = settings or gateway.TaskSettings(
            "extract_claims",
            "google",
            "gemini-3.5-flash-lite",
            "minimal",
            escalation_model="gemini-3.8-flash",
        )
        monkeypatch.setattr(gateway, "client", lambda: client)
        monkeypatch.setattr(gateway, "task_settings", lambda task: cfg)
        monkeypatch.setattr(
            gateway,
            "record_usage",
            lambda task, model, usage, ctx, ms: recorded.append((task, model, usage)),
        )
        return client.models, recorded

    return install


def test_parse_returns_the_structured_answer_and_records_usage(fake):
    models, recorded = fake([response(thoughts=40)])
    result = gateway.parse(
        "extract_claims", system="s", messages=[{"role": "user", "content": "hi"}], output=Answer
    )
    assert result.value == 7
    call = models.calls[0]
    assert call["model"] == "gemini-3.5-flash-lite"
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].response_json_schema["properties"]["value"]["type"] == "integer"
    assert call["config"].thinking_config.thinking_level == types.ThinkingLevel.MINIMAL
    assert recorded == [
        (
            "extract_claims",
            "gemini-3.5-flash-lite",
            gateway.Usage(input_tokens=1000, output_tokens=140),
        )
    ]


def test_escalation_uses_the_stronger_model_and_its_thinking_levels(fake):
    models, _ = fake([response()])
    gateway.parse(
        "extract_claims",
        system="s",
        messages=[{"role": "user", "content": "hi"}],
        output=Answer,
        escalate=True,
    )
    assert models.calls[0]["model"] == "gemini-3.8-flash"
    # Flash has no "minimal" level; it gets "low".
    assert models.calls[0]["config"].thinking_config.thinking_level == types.ThinkingLevel.LOW


def test_escalation_without_a_stronger_model_is_refused(fake):
    fake([], gateway.TaskSettings("suggest_wording", "google", "gemini-3.5-flash-lite", "low"))
    assert not gateway.can_escalate("suggest_wording")
    with pytest.raises(gateway.TaskDisabled):
        gateway.parse("suggest_wording", system="s", messages=[], output=Answer, escalate=True)


def test_cut_off_and_invalid_answers_are_output_errors(fake):
    fake([response('{"value": 7', types.FinishReason.MAX_TOKENS), response('{"value": "x"}')])
    for _ in range(2):
        with pytest.raises(gateway.ModelOutputError):
            gateway.parse("extract_claims", system="s", messages=[], output=Answer)


def test_safety_blocks_are_refusals(fake):
    fake([response("", types.FinishReason.SAFETY)])
    with pytest.raises(gateway.ModelRefusal):
        gateway.parse("extract_claims", system="s", messages=[], output=Answer)


def test_disabled_tasks_are_refused(fake):
    fake(
        [],
        gateway.TaskSettings(
            "verify_claim", "google", "gemini-3.5-flash-lite", "low", enabled=False
        ),
    )
    with pytest.raises(gateway.TaskDisabled):
        gateway.parse("verify_claim", system="s", messages=[], output=Answer)


def test_messages_become_gemini_contents():
    contents = gateway._contents(
        [
            {"role": "user", "content": [gateway.pdf(b"%PDF-1.7"), "read it"]},
            {"role": "assistant", "content": "{}"},
            {"role": "user", "content": "again"},
        ]
    )
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert contents[0].parts[0].inline_data.mime_type == "application/pdf"
    assert contents[0].parts[1].text == "read it"


def test_usage_separates_cache_audio_tools_and_searches():
    usage = gateway.usage_of(
        response(
            prompt=5000,
            cached=1000,
            audio=2000,
            output=300,
            thoughts=200,
            tool=700,
            queries=["a", "b"],
        )
    )
    assert usage == gateway.Usage(
        input_tokens=2700,
        audio_tokens=2000,
        cache_read_tokens=1000,
        output_tokens=500,
        search_queries=2,
    )
    # Some answers report the search results without the query list: still a billed search.
    assert gateway.usage_of(response(chunks=["https://x"])).search_queries == 1


def test_cost_per_model_including_search_and_price_changes():
    lite = gateway.cost_usd(
        "gemini-3.5-flash-lite",
        gateway.Usage(input_tokens=1_000_000, output_tokens=1_000_000, cache_read_tokens=1_000_000),
    )
    assert lite == Decimal("2.83")
    search = gateway.cost_usd("gemini-3.5-flash-lite", gateway.Usage(search_queries=10))
    assert search == Decimal("0.14")
    audio = gateway.cost_usd("gemini-3.1-flash-lite", gateway.Usage(audio_tokens=1_000_000))
    assert audio == Decimal("0.50")
    flash = gateway.Usage(input_tokens=1_000_000, output_tokens=1_000_000)
    assert gateway.cost_usd("gemini-3.8-flash", flash, date(2026, 12, 31)) == Decimal("4.50")
    assert gateway.cost_usd("gemini-3.8-flash", flash, date(2027, 1, 1)) == Decimal("9.00")
