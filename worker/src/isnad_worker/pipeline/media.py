"""Media preparation with ffmpeg: probe, audio for transcription, a web-playable copy, a poster, a waveform."""

from __future__ import annotations

import array
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from isnad_worker.jobs import PermanentError

# Subtitle codecs that carry text (bitmap subtitles such as dvd_subtitle can't be read).
TEXT_SUBTITLES = {"subrip", "mov_text", "webvtt", "ass", "ssa", "text"}


@dataclass(frozen=True)
class Probe:
    duration_ms: int
    has_video: bool
    has_audio: bool
    width: int | None
    height: int | None
    has_captions: bool = False


def _run(args: list[str], timeout: int = 1800) -> subprocess.CompletedProcess[bytes]:
    if not shutil.which(args[0]):
        raise PermanentError(f"{args[0]} is not installed on the worker")
    result = subprocess.run(
        args, capture_output=True, timeout=timeout, check=False, stdin=subprocess.DEVNULL
    )
    if result.returncode != 0:
        tail = result.stderr.decode(errors="replace")[-800:]
        raise PermanentError(f"{args[0]} failed: {tail}")
    return result


def probe(path: Path) -> Probe:
    out = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        timeout=120,
    )
    data = json.loads(out.stdout)
    streams = data.get("streams", [])
    video = next(
        (
            s
            for s in streams
            if s.get("codec_type") == "video" and s.get("disposition", {}).get("attached_pic") != 1
        ),
        None,
    )
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    captions = any(
        s.get("codec_type") == "subtitle" and s.get("codec_name") in TEXT_SUBTITLES for s in streams
    )
    duration = float(data.get("format", {}).get("duration") or 0)
    if not audio:
        raise PermanentError("The file has no audio track to transcribe.")
    return Probe(
        duration_ms=int(duration * 1000),
        has_video=video is not None,
        has_audio=True,
        width=int(video["width"]) if video else None,
        height=int(video["height"]) if video else None,
        has_captions=captions,
    )


def extract_audio(src: Path, dest: Path) -> Path:
    """16 kHz mono FLAC: what speech models expect, lossless and compact."""
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(src),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "flac",
            str(dest),
        ]
    )
    return dest


def speech_clip(src: Path, dest: Path, start_ms: int = 0, end_ms: int | None = None) -> Path:
    """A stretch of the recording as mono 16 kHz Opus (about 0.25 MB a minute) for transcription."""
    args = ["ffmpeg", "-y", "-v", "error", "-ss", f"{start_ms / 1000:.3f}"]
    if end_ms is not None:
        args += ["-to", f"{end_ms / 1000:.3f}"]
    args += ["-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "32k"]
    _run([*args, str(dest)])
    return dest


_SILENCE_START = re.compile(r"silence_start: (-?[\d.]+)")
_SILENCE_END = re.compile(r"silence_end: ([\d.]+)")


def silences(src: Path, *, noise_db: int = -35, min_seconds: float = 0.4) -> list[tuple[int, int]]:
    """Quiet stretches as (start_ms, end_ms), for cutting long recordings between words."""
    out = _run(
        [
            "ffmpeg",
            "-v",
            "info",
            "-nostats",
            "-i",
            str(src),
            "-af",
            f"silencedetect=noise={noise_db}dB:d={min_seconds}",
            "-f",
            "null",
            "-",
        ]
    )
    log = out.stderr.decode(errors="replace")
    starts = [max(0.0, float(x)) for x in _SILENCE_START.findall(log)]
    ends = [float(x) for x in _SILENCE_END.findall(log)]
    return [(int(s * 1000), int(e * 1000)) for s, e in zip(starts, ends, strict=False)]


def web_video(src: Path, dest: Path) -> Path:
    """H.264/AAC MP4 at most 1280 wide, with the index up front for fast seeking in the browser."""
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(src),
            "-vf",
            "scale='min(1280,iw)':-2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "26",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )
    return dest


def web_audio(src: Path, dest: Path) -> Path:
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(src),
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(dest),
        ]
    )
    return dest


def poster(src: Path, dest: Path, at_seconds: float) -> Path:
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-ss",
            f"{at_seconds:.2f}",
            "-i",
            str(src),
            "-frames:v",
            "1",
            "-vf",
            "scale='min(1280,iw)':-2",
            "-q:v",
            "4",
            str(dest),
        ]
    )
    return dest


def waveform(src: Path, points: int = 480) -> list[float]:
    """Peak amplitudes (0..1) for drawing an audio waveform."""
    out = _run(
        ["ffmpeg", "-v", "error", "-i", str(src), "-ac", "1", "-ar", "4000", "-f", "s16le", "-"],
        timeout=600,
    )
    samples = array.array("h")
    samples.frombytes(out.stdout[: len(out.stdout) - len(out.stdout) % 2])
    if not samples:
        return [0.0] * points
    size = max(1, len(samples) // points)
    peaks = []
    for i in range(0, len(samples), size):
        chunk = samples[i : i + size]
        peaks.append(max(abs(min(chunk)), abs(max(chunk))) / 32768)
    top = max(peaks) or 1.0
    return [round(p / top, 3) for p in peaks[:points]]


_SRT_TIME = re.compile(r"(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})")
_TAGS = re.compile(r"<[^>]+>|\{\\[^}]*\}")


def _ms(h: str, m: str, s: str, frac: str) -> int:
    return ((int(h) * 60 + int(m)) * 60 + int(s)) * 1000 + int(frac)


def parse_srt(text: str) -> list[dict]:
    """Caption cues as segments (start/end in ms, text without styling tags)."""
    cues = []
    for block in re.split(r"\r?\n\s*\r?\n", text.strip()):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        for i, line in enumerate(lines):
            m = _SRT_TIME.search(line)
            if not m:
                continue
            body = " ".join(_TAGS.sub("", t) for t in lines[i + 1 :]).strip()
            if body:
                cues.append(
                    {"start_ms": _ms(*m.groups()[:4]), "end_ms": _ms(*m.groups()[4:]), "text": body}
                )
            break
    return cues


def extract_captions(src: Path) -> list[dict]:
    """The clip's own first text caption track (newsrooms often deliver subtitled clips)."""
    out = _run(
        ["ffmpeg", "-v", "error", "-i", str(src), "-map", "0:s:0", "-f", "srt", "-"], timeout=300
    )
    return parse_srt(out.stdout.decode("utf-8", errors="replace"))
