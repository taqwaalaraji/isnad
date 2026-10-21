"""Speech-to-text with Gemini Transcribe: verbatim words with timings and speakers, as segments.

Recordings longer than 10 minutes are cut into parts at quiet moments (a request of 25 minutes was
dropped by the server; word timings and speakers are limited to 30), and the parts' timings are
shifted back onto the whole recording.
"""

from __future__ import annotations

import itertools
import logging
import re
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from isnad_worker.ai import gateway
from isnad_worker.jobs import PermanentError
from isnad_worker.pipeline import media

log = logging.getLogger("isnad.transcribe")

MAX_PART_MS = 10 * 60 * 1000
# Where to look for a quiet moment before each cut.
CUT_WINDOW_MS = 60_000
PART_ATTEMPTS = 3
# The model detects the language itself (MSA, Gulf, Levantine and code-switching); Egyptian
# Arabic is the one variant it takes as a hint.
LANGUAGE_HINTS = {"egyptian": ["ar-EG"]}

_SENTENCE_END = (".", "؟", "?", "!", "…")
_CLAUSE_END = ("،", ",", "؛", ";", ":")
_OFFSET = re.compile(r"^(\d+(?:\.\d+)?)s$")


@dataclass
class Word:
    text: str
    start_ms: int
    end_ms: int
    confidence: float | None = None
    speaker: str | None = None


@dataclass
class Segment:
    text: str
    start_ms: int
    end_ms: int
    words: list[Word] = field(default_factory=list)
    speaker: str | None = None


def cut_points(
    duration_ms: int, quiet: list[tuple[int, int]], max_ms: int = MAX_PART_MS
) -> list[int]:
    """Boundaries (0 … duration) of parts at most `max_ms` long, cut in the middle of a pause."""
    points = [0]
    while duration_ms - points[-1] > max_ms:
        target = points[-1] + max_ms
        middles = [
            (s + e) // 2 for s, e in quiet if target - CUT_WINDOW_MS <= (s + e) // 2 <= target
        ]
        points.append(max(middles) if middles else target)
    return [*points, duration_ms]


def _ms(offset: Any) -> int | None:
    """ "12.300s" → 12300."""
    if offset is None:
        return None
    m = _OFFSET.match(str(offset).strip())
    return int(float(m.group(1)) * 1000) if m else None


def words_of(interaction: Any, shift_ms: int = 0, length_ms: int | None = None) -> list[Word]:
    """The answer's words in reading order, with times on the whole recording. Times never go
    backwards and stay inside the part, so lines built from them are in order across parts."""
    words: list[Word] = []
    floor, ceiling = shift_ms, shift_ms + length_ms if length_ms is not None else None
    for step in getattr(interaction, "steps", None) or []:
        for content in getattr(step, "content", None) or []:
            for note in getattr(content, "annotations", None) or []:
                if getattr(note, "type", None) != "word_info" or not getattr(note, "text", None):
                    continue
                start = _ms(note.start_offset)
                end = _ms(note.end_offset)
                start = max(floor, start + shift_ms if start is not None else floor)
                end = max(start, end + shift_ms if end is not None else start)
                if ceiling is not None:
                    start, end = min(start, ceiling), min(end, ceiling)
                words.append(
                    Word(
                        text=note.text.strip(),
                        start_ms=start,
                        end_ms=end,
                        speaker=getattr(note, "speaker", None),
                    )
                )
                floor = start
    return words


def _speaker_labels(words: list[Word]) -> None:
    """spk:0 → S1. A recording with one voice gets no labels."""
    found = list(dict.fromkeys(w.speaker for w in words if w.speaker))
    labels = {s: f"S{i}" for i, s in enumerate(found, start=1)} if len(found) > 1 else {}
    for w in words:
        w.speaker = labels.get(w.speaker or "")


def segments_from_words(
    words: list[Word], *, pause_ms: int = 1200, min_ms: int = 4000, max_ms: int = 20_000
) -> list[Segment]:
    """Sentence-sized segments: cut at sentence ends, speaker changes and long pauses."""
    segments: list[Segment] = []
    current: list[Word] = []

    def close() -> None:
        if current:
            segments.append(
                Segment(
                    " ".join(w.text for w in current),
                    current[0].start_ms,
                    current[-1].end_ms,
                    list(current),
                    current[0].speaker,
                )
            )
            current.clear()

    for word in words:
        if current and (
            word.speaker != current[0].speaker or word.start_ms - current[-1].end_ms >= pause_ms
        ):
            close()
        current.append(word)
        length = word.end_ms - current[0].start_ms
        if (
            (word.text.endswith(_SENTENCE_END) and length >= min_ms)
            or (word.text.endswith(_CLAUSE_END) and length >= max_ms)
            or length >= max_ms + 10_000
        ):
            close()
    close()
    return segments


def _usage(interaction: Any, seconds: float) -> gateway.Usage:
    u = getattr(interaction, "usage", None)
    if u is None:
        return gateway.Usage(audio_seconds=seconds)
    audio = sum(
        m.tokens or 0
        for m in u.input_tokens_by_modality or []
        if str(m.modality).lower().endswith("audio")
    )
    return gateway.Usage(
        input_tokens=max(0, (u.total_input_tokens or 0) - audio),
        audio_tokens=audio,
        output_tokens=u.total_output_tokens or 0,
        audio_seconds=seconds,
    )


def _wait_until_active(client: Any, uploaded: Any, timeout_s: float = 120) -> Any:
    deadline = time.monotonic() + timeout_s
    while str(getattr(uploaded, "state", "")).endswith("PROCESSING"):
        if time.monotonic() > deadline:
            raise RuntimeError("the uploaded audio is still processing")
        time.sleep(2)
        uploaded = client.files.get(name=uploaded.name)
    if str(getattr(uploaded, "state", "")).endswith("FAILED"):
        raise PermanentError("The audio couldn't be read for transcription.")
    return uploaded


def _transcribe_part(
    clip: Path,
    *,
    model: str,
    languages: list[str],
    shift_ms: int,
    seconds: float,
    ctx: gateway.CallContext,
) -> list[Word]:
    client = gateway.client()
    started = time.monotonic()
    uploaded = client.files.upload(file=str(clip), config={"mime_type": "audio/ogg"})
    try:
        uploaded = _wait_until_active(client, uploaded)
        config: dict[str, Any] = {
            "mode": {
                "type": "verbatim",
                "diarization_mode": "speaker",
                "timestamp_granularities": ["word"],
            }
        }
        if languages:
            config["language_codes"] = languages
        interaction = client.interactions.create(
            model=model,
            input=[{"type": "audio", "uri": uploaded.uri, "mime_type": uploaded.mime_type}],
            generation_config={"transcription_config": config},
        )
    finally:
        try:
            client.files.delete(name=uploaded.name)
        except Exception:  # noqa: BLE001 - uploads expire on their own after 48 hours
            log.warning("couldn't delete the uploaded audio %s", uploaded.name)
    gateway.record_usage(
        "transcribe",
        model,
        _usage(interaction, seconds),
        ctx,
        int((time.monotonic() - started) * 1000),
    )
    if str(getattr(interaction, "status", "")).lower() in ("failed", "cancelled"):
        raise RuntimeError(f"transcription {interaction.status}")
    return words_of(interaction, shift_ms, int(seconds * 1000))


def _status(exc: Exception) -> int | None:
    # Files API errors carry `code`; the Interactions API's own error classes carry `status_code`.
    return getattr(exc, "code", None) or getattr(exc, "status_code", None)


def _with_retries[T](part: Callable[[], T]) -> T:
    """A part again after a dropped connection, a server error or a rate limit; a rejected
    request (a bad key, an unreadable file) fails the check at once."""
    for attempt in range(PART_ATTEMPTS):
        try:
            return part()
        except PermanentError:
            raise
        except Exception as exc:  # the SDK raises from two error hierarchies
            status = _status(exc)
            if isinstance(status, int) and 400 <= status < 500 and status != 429:
                raise PermanentError(f"Transcription was refused ({status}): {exc}"[:300]) from exc
            if attempt == PART_ATTEMPTS - 1:
                raise
            log.warning("transcription part failed (%s); trying again", exc)
            time.sleep(10 * (attempt + 1))
    raise AssertionError("unreachable")


def transcribe(
    audio: Path, *, check_id: str, newsroom_id: str, dialect: str, duration_ms: int
) -> list[Segment]:
    model = gateway.task_settings("transcribe").model
    ctx = gateway.CallContext(newsroom_id=newsroom_id, check_id=check_id)
    quiet = media.silences(audio) if duration_ms > MAX_PART_MS else []
    points = cut_points(duration_ms, quiet)
    words: list[Word] = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, (start, end) in enumerate(itertools.pairwise(points)):
            clip = media.speech_clip(
                audio, Path(tmp) / f"part{i}.ogg", start, end if end < duration_ms else None
            )
            words += _with_retries(
                lambda clip=clip, start=start, end=end: _transcribe_part(
                    clip,
                    model=model,
                    languages=LANGUAGE_HINTS.get(dialect, []),
                    shift_ms=start,
                    seconds=(end - start) / 1000,
                    ctx=ctx,
                )
            )
    _speaker_labels(words)
    return segments_from_words(words)
