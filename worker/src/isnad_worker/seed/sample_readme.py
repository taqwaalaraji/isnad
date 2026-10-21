"""Writes sample-data/README.md and sample-data/inputs/ from the manifest and the exported demo data, so
the list of test material always matches what the seed restores.

    python -m isnad_worker.seed readme      (also part of `make seed-export`)
"""

from __future__ import annotations

import gzip
import json
import logging
import re
from pathlib import Path

from isnad_worker.seed.catalog import SAMPLE_DATA, SEED_DATA

log = logging.getLogger("isnad.seed")

# English file names for the inputs of the demo text checks (titles are Arabic).
INPUT_NAMES = {
    "خبر: السياحة والسكان في الإمارات": "tourism-and-population-uae",
    "مسودة خبر: زوار دبي في 2025": "draft-dubai-visitors-2025",
    "مقال: حصاد السياحة والفنادق في 2025": "tourism-and-hotels-2025",
    "مسودة تقرير: التجارة الخارجية غير النفطية": "draft-non-oil-foreign-trade",
    "تقرير: اقتصاد أبوظبي في 2025": "abu-dhabi-economy-2025",
    "رصد: سوق العقارات في دبي": "dubai-real-estate-market",
    "خبر: حركة المسافرين في مطارات الدولة": "uae-airport-passengers",
    "خبر: سكان أبوظبي والقطاع المصرفي": "abu-dhabi-population-and-banking",
    "زوار أبوظبي ودبي ونزلاء الفنادق": "abu-dhabi-dubai-visitors-and-hotel-guests",
}
PUBLISHERS = {
    "sky-news-arabia": "Sky News Arabia",
    "cnn-business-arabic": "CNN Business Arabic",
    "dubai-police": "Dubai Police (podcast)",
}
VERDICTS = {"match": "مطابق", "differs": "مختلف", "context": "سياق مختلف", "none": "لا مصدر"}


def _cell(text: object) -> str:
    return re.sub(r"\s+", " ", str(text or "")).replace("|", "\\|").strip()


def _load_gz(name: str):
    path = SEED_DATA / name
    if not path.exists():
        return None
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def write() -> Path:
    manifest = json.loads((SAMPLE_DATA / "manifest.json").read_text(encoding="utf-8"))
    snapshot = _load_gz("registry_snapshot.json.gz") or {"documents": [], "versions": []}
    checks = _load_gz("demo_checks.json.gz") or []
    sources = {
        s["slug"]: s.get("name_ar") or s.get("name_en") or s["slug"]
        for s in json.loads((SEED_DATA / "sources.json").read_text(encoding="utf-8")).get(
            "sources", []
        )
    }

    newsroom_checks = [e["check"] for e in checks if e["check"]["newsroom"] != "isnad-eval"]
    eval_checks = len(checks) - len(newsroom_checks)
    used_in: dict[str, list[str]] = {}
    for e in checks:
        if e.get("media") and e["media"].get("fixture"):
            used_in.setdefault(f"media/{e['media']['fixture']}", []).append(e["check"]["title"])

    # Inputs of the text checks, as files; link checks are listed with their URL.
    inputs_dir = SAMPLE_DATA / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)
    inputs = []
    for c in newsroom_checks:
        if c["input_kind"] == "text" and c.get("input_text"):
            name = INPUT_NAMES.get(c["title"]) or f"check-{c['id'][:8]}"
            (inputs_dir / f"{name}.txt").write_text(
                c["input_text"].strip() + "\n", encoding="utf-8"
            )
            inputs.append((f"inputs/{name}.txt", c))
        elif c["input_kind"] == "link" and c.get("input_url"):
            inputs.append((c["input_url"], c))

    lines = [
        "# Sample data",
        "",
        "The material Isnad was built and tested with: real Arabic news clips and podcasts, the official UAE",
        "documents behind their numbers, the texts and links submitted as checks, and 60 labelled claims from",
        "UAE outlets for the evaluation. `make seed-demo` loads the demo from it exactly as it was recorded.",
        "",
        "> **Rights.** The clips belong to their publishers (Sky News Arabia, CNN Business Arabic, Dubai Police)",
        "> and the documents to the government bodies that published them. They are included only so the",
        "> prototype can be tested and its demo reproduced; they are not covered by this repository's licence.",
        "",
        "## Layout",
        "",
        "| Folder | What |",
        "|---|---|",
        "| `media/video/`, `media/audio/` | The clips checked in the demo (`date_publisher_topic`) |",
        "| `documents/corpus/` | Official documents read into the registry by the seed (the test corpus) |",
        "| `documents/discovered/` | Official documents the search agent found and stored during checks (`date_source_id-version`) |",
        "| `inputs/` | The texts submitted as text checks |",
        "| `manifest.json` | Machine-readable list: documents with checksums and key figures, labelled claims, media links |",
        "",
        "How each part is used:",
        "",
        "| Command | Uses |",
        "|---|---|",
        "| `make seed-demo` | The registry snapshot with these documents' stored copies, and the demo checks with these clips |",
        "| `make corpus` | Reads `documents/corpus/` into the registry again (model calls) |",
        "| `make eval` | Scores the pipeline on the labelled claims in `manifest.json` (model calls) |",
        "| `make seed-showcase` | Builds the demo checks again through the real pipeline (model calls) |",
        "| `make media` | Downloads the clips again from the publishers (to refresh one) |",
        "",
        f"## Clips ({sum(1 for m in manifest['media'] if m.get('file'))})",
        "",
        "| File | Title | Publisher | Date | Length | Original | Demo checks |",
        "|---|---|---|---|---|---|---|",
    ]
    for m in manifest["media"]:
        if not m.get("file"):
            continue
        lines.append(
            f"| [`{Path(m['file']).name}`]({m['file']}) | {_cell(m['title'])} | {PUBLISHERS.get(m['platform'], m['platform'])} "
            f"| {m['published_at']} | {m['duration']} | [link]({m['page_url']}) | {_cell(' · '.join(used_in.get(m['file'], [])))} |"
        )
    lines += [
        "",
        f"## Text and link checks ({len(inputs)})",
        "",
        "| Input | Check | Newsroom | Author |",
        "|---|---|---|---|",
    ]
    for ref, c in inputs:
        shown = f"[`{Path(ref).name}`]({ref})" if ref.startswith("inputs/") else f"[link]({ref})"
        lines.append(f"| {shown} | {_cell(c['title'])} | {c['newsroom']} | {c['author'] or ''} |")
    lines += [
        "",
        (
            f"Media checks: {sum(1 for c in newsroom_checks if c['input_kind'] in ('video', 'audio'))}; "
            f"evaluation checks (one per labelled claim and run, in the internal `isnad-eval` newsroom): {eval_checks}."
        ),
        "",
        f"## Official documents: test corpus ({sum(1 for d in manifest['documents'] if d.get('file'))})",
        "",
        "| File | Title | Published | Original |",
        "|---|---|---|---|",
    ]
    for d in manifest["documents"]:
        if not d.get("file"):
            continue
        lines.append(
            f"| [`{Path(d['file']).name}`]({d['file']}) | {_cell(d['title_ar'])}<br>{_cell(d['title_en'])} "
            f"| {d.get('published_at') or ''} | [link]({d.get('landing_url') or d['url']}) |"
        )
    files_by_doc: dict[str, list[str]] = {}
    for v in snapshot["versions"]:
        if (v.get("file") or "").startswith("documents/discovered/"):
            files_by_doc.setdefault(v["document_id"], []).append(v["file"])
    discovered = [d for d in snapshot["documents"] if d["id"] in files_by_doc]
    lines += [
        "",
        f"## Official documents: found by the search agent ({len(discovered)})",
        "",
        "Stored during demo checks, from official websites only; the registry snapshot links each to its figures.",
        "",
        "| File | Title | Source | Published | Original |",
        "|---|---|---|---|---|",
    ]
    for d in sorted(discovered, key=lambda x: (x["source_slug"], x["published_at"] or "")):
        names = " ".join(f"[`{Path(f).name}`]({f})" for f in files_by_doc[d["id"]])
        lines.append(
            f"| {names} | {_cell(d['title'])} | {_cell(sources.get(d['source_slug'], d['source_slug']))} "
            f"| {d['published_at'] or ''} | [link]({d['url']}) |"
        )
    lines += [
        "",
        f"## Labelled claims ({len(manifest['claims'])})",
        "",
        "Real sentences from UAE outlets, each labelled with the verdict an editor would reach and the evidence.",
        "",
        "| Id | Claim | Outlet | Expected |",
        "|---|---|---|---|",
    ]
    for c in manifest["claims"]:
        lines.append(
            f"| {c['id']} | {_cell(c['text_ar'])} | {_cell(c.get('outlet'))} | {VERDICTS.get(c.get('expected_verdict'), _cell(c.get('expected_verdict')))} |"
        )
    others = [m for m in manifest["media"] if not m.get("file")]
    lines += [
        "",
        f"## Other clips considered ({len(others)})",
        "",
        "Links reviewed while choosing the test clips (not downloaded).",
        "",
        "| Title | Platform | Date | Link |",
        "|---|---|---|---|",
    ]
    for m in others:
        lines.append(
            f"| {_cell(m['title'])} | {m['platform']} | {m['published_at']} | [link]({m['page_url']}) |"
        )
    out = SAMPLE_DATA / "README.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info(
        "sample data README: %d clips, %d inputs, %d discovered documents",
        len(used_in),
        len(inputs),
        len(discovered),
    )
    return out
