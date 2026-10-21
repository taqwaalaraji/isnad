# Testing

## Automated checks

`make test` runs everything below and must pass before a commit.

| Suite | Command | Covers |
|---|---|---|
| Worker unit tests | `cd worker && uv run pytest` | See below (48 tests) |
| Worker lint and format | `uv run ruff check .` and `uv run ruff format --check .` | Style, imports, common bugs (line length 100) |
| Web lint | `cd web && npm run lint` | ESLint with the Next.js and React Hooks rules (purity, effects) |
| Web types | `npx tsc --noEmit` | Includes typed routes and typed dictionary keys |

Worker tests:

| File | What it checks |
|---|---|
| `tests/test_text.py` | Normalization matches the SQL rules; verbatim matching tolerates typography; spans map back to original offsets; digit and spoken-number parsing, decimal commas, scale words; number formatting; SRT caption parsing; period labels and unit normalization |
| `tests/test_compare.py` | The verdict rules: rounding tolerance, "about" and one-sided qualifiers, measure and scope mismatches, period relations, the latest-figure rule for claims without a period, preferring current figures over superseded ones |
| `tests/test_ask.py` | Ask Isnad's number verification (cited numbers, rounded restatements, computed rates rejected, unknown ids) and that the endpoint requires the internal token |
| `tests/test_api.py` | `/health` |

There are no automated browser tests yet; web flows are tested by hand (below).

## Test data

All in `testdata/` (the downloaded files under `testdata/files/` are git-ignored):

| File | What it is |
|---|---|
| `manifest.json` | The UAE test corpus: 29 official documents (PDF, XLSX, HTML and WAM article JSON from statistics centres, ministries, the central bank, media offices and the land department; about 49 MB), 60 real claims from Emirati newspapers with the expected verdict and the official evidence quote (29 match, 9 context, 9 differs, 13 no source), 15 YouTube links mentioning 31 numbers (links only; nothing downloaded), and 7 real Arabic clips with direct file URLs (Sky News Arabia reports and interviews, a CNN Business Arabic interview with a minister, the Dubai Police podcast, a Sky News podcast) used for transcription tests and the media demo checks |
| `files/documents/` | The corpus documents (re-download from the URLs in the manifest; each has a sha256) |
| `files/media/real/` | The real clips, downloaded with `make media`. Publishers' content without an open licence: local testing only, never committed or redistributed |

Every quote in the manifest was found verbatim in its file, and every claim text was found in a saved copy of its article.

## Demo data

- `make seed` — catalog plus demo accounts. Demo users (password in `worker/seed_data/demo.json`): `admin@isnad.ae` (platform admin), `curator@isnad.ae` (curator); newsroom «غرفة المدار» (`almadar`): `laila@almadar.news` (admin), `sara@almadar.news` (editor), `omar@almadar.news` and `khaled@almadar.news` (journalists); «صحيفة الأفق» (`alufuq`): `rana@alufuq.ae` (admin).
- `make seed-showcase` — nine demo checks processed by the real pipeline, with realistic review states ([worker.md](worker.md#seeds)).

## Evaluation runs

Staff start an evaluation from the console (**Quality and models** → run the test set). Inserting an `eval_runs` row queues `run_eval`, whose handler calls `isnad_worker.eval.harness.run`. **That harness module isn't in this branch yet**, so a run fails with an import error until it lands.

## Manual verification (current state)

Tested in the browser against the local stack, in Arabic and English, light and dark, at desktop and 375 px widths:

- Text check end to end (5 numbers: match, match, differs, differs, forecast flagged as not checkable), and the full review: approve matches, edit wording, keyboard navigation (j/k), approve check, record publication, public evidence page.
- Video upload through the form; a clip's own caption track used instead of transcription; caption overlay, timeline markers, click-to-seek, follow playback, pause at each issue.
- Real clips through the full pipeline (October 2026): four Sky News Arabia videos (1:21 to 14:46, MSA, Gulf and Levantine speech), a minister's radio interview, the Dubai Police podcast and a podcast with inserted ads; speakers separated, numbers transcribed as spoken, about $0.0055 a minute of transcription. A 28.6-minute recording is cut into three parts at pauses.
- Audio without captions transcribed by Gemini 3.5 Transcribe (word timings), live updates, retry.
- Link checks on newspaper articles; cancelling a processing check; the per-check search budget and "search official sources" on demand.
- Registry pages and Ask Isnad; newsroom admin (invitations end to end through the local mail inbox, members, policies, private sources, activity export); settings; alerts; briefs; the console pages and their permission edges.

Live model runs (October 2026, Gemini): a seven-number text check ($0.0098, one Flash call for a verifier objection), a check needing source search ($0.02, one Google Search query; the Sharjah population was found on u.ae and verified verbatim), and an audio check transcribed by Gemini 3.5 Transcribe.
