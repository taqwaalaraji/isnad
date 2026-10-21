"""Download the real test clips listed in sample-data/manifest.json (`media` entries with a `file_url`).

The clips are real Arabic broadcasts and podcasts with UAE statistics, used by the showcase and the
demo checks. They are kept in sample-data/media/ (the publishers' copyright; see sample-data/README.md);
this fetches them again from the publishers, for example to refresh one. Run with `make media`.

    uv run python -m isnad_worker.devtools.test_media [--only media-016,media-017]
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import httpx2 as httpx

from isnad_worker.jobs import PermanentError
from isnad_worker.pipeline import content

ROOT = Path(__file__).resolve().parents[4] / "sample-data"
MANIFEST = ROOT / "manifest.json"
MAX_BYTES = 150 * 1024 * 1024
MEDIA_TYPES = ("audio/", "video/", "application/octet-stream", "binary/octet-stream")


def _playable(path: Path) -> bool:
    """ffprobe finds an audio stream (the file is media, not an error page)."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=False, stdin=subprocess.DEVNULL,
    )  # fmt: skip
    return out.returncode == 0 and "audio" in out.stdout


def fetch(entry: dict) -> str:
    dest = ROOT / entry["file"]
    if dest.exists():
        return "present"
    dest.parent.mkdir(parents=True, exist_ok=True)
    download = content.download(entry["file_url"], max_bytes=MAX_BYTES)
    if not download.content_type.startswith(MEDIA_TYPES):
        raise PermanentError(f"not a media file ({download.content_type or 'no content type'})")
    partial = dest.with_suffix(dest.suffix + ".part")
    partial.write_bytes(download.content)
    if not _playable(partial):
        partial.unlink()
        raise PermanentError("the download has no audio stream")
    partial.rename(dest)
    return f"downloaded {len(download.content) / 1e6:.1f} MB"


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m isnad_worker.devtools.test_media")
    parser.add_argument("--only", default="", help="comma-separated manifest media ids")
    args = parser.parse_args()
    only = {x for x in args.only.split(",") if x}
    entries = [
        m
        for m in json.loads(MANIFEST.read_text(encoding="utf-8"))["media"]
        if m.get("file_url") and m.get("file") and (not only or m["id"] in only)
    ]
    failed = 0
    for entry in entries:
        try:
            print(f"{entry['id']} {Path(entry['file']).name}: {fetch(entry)}")
        except (PermanentError, OSError, httpx.HTTPError) as exc:
            failed += 1
            print(f"{entry['id']} {Path(entry['file']).name}: failed — {exc}")
    if failed:
        raise SystemExit(f"{failed} of {len(entries)} clips failed")


if __name__ == "__main__":
    main()
