# Testing

## Automated checks

`make test` runs everything below and must pass before a commit.

| Suite | Command | Covers |
|---|---|---|
| Worker unit tests | `cd worker && uv run pytest` | See below (156 tests: 138 test functions in 14 files, some parametrized) |
| Worker lint and format | `uv run ruff check .` and `uv run ruff format --check .` | Style, imports, common bugs (line length 100) |
| Web lint | `cd web && npm run lint` | ESLint with the Next.js and React Hooks rules (purity, effects) |
| Web types | `npx tsc --noEmit` | Includes the generated route types (`PageProps`) and typed dictionary keys; on a fresh clone run `npx next typegen` (or `next dev`/`next build`) once first |

Worker tests:

| File | What it checks |
|---|---|
| `tests/test_text.py` | Normalization matches the SQL rules; verbatim matching tolerates typography; spans map back to original offsets; digit and spoken-number parsing, decimal commas, scale words; number formatting; SRT caption parsing; period labels and unit normalization |
| `tests/test_compare.py` | The verdict rules: rounding tolerance, "about" and one-sided qualifiers, measure and scope mismatches, period relations, the latest-figure rule for claims without a period, preferring current figures over superseded ones |
| `tests/test_ask.py` | Ask Isnad's number verification (cited numbers, rounded restatements, computed rates rejected, unknown ids) and that the endpoint requires the internal token |
| `tests/test_api.py` | `/health`, and the Telegram webhook: requires the secret, accepts updates, off without a secret |
| `tests/test_cascade.py` | Cheap model first, escalation only when code rejects the answer |
| `tests/test_discovery.py` | The domain allowlist, the candidate cap, the search question |
| `tests/test_document_reading.py` | PDF text with Arabic lines right to left, HTML main-content extraction, WAM's article API |
| `tests/test_eval_scoring.py` | Evaluation scoring: verdict accuracy, false alarms, false reassurance |
| `tests/test_extract_numbers.py` | Code's reading of the digits against the model's |
| `tests/test_gemini_gateway.py` | The gateway: escalation, refusals, usage and cost recording |
| `tests/test_registry_precision.py` | Published precision and when a new figure is a revision |
| `tests/test_seed_documents.py` | Source by host, lookalike hosts refused, WAM files, dates |
| `tests/test_telegram.py` | The Bot API client's retries, messages, linking, the intake guard |
| `tests/test_transcribe.py` | Cutting at pauses, word timings, speakers, retries |

Outside `make test`, because they need the running app or model calls:

| Command | What it checks |
|---|---|
| `make smoke` | Signs in as each demo role and requests every page in Arabic and English: status codes, 404 where a role has no access, no error digests in the streamed HTML (213 pages) |
| `make eval` | The labelled claims through the real pipeline (model cost; below) |
| `make screenshots` | Takes the product screenshots in `screenshots/` from the running app |

There are no browser interaction tests yet; web flows are tested by hand (below).

## Test data

All in `sample-data/` ([sample-data/README.md](../../sample-data/README.md) lists every item with its original link):

| File | What it is |
|---|---|
| `manifest.json` | The UAE test corpus: 29 official documents (PDF, XLSX, HTML and WAM article JSON from statistics centres, ministries, the central bank, media offices and the land department; about 49 MB), 60 real claims from Emirati newspapers with the expected verdict and the official evidence quote (29 match, 9 context, 9 differs, 13 no source), 15 YouTube links mentioning 31 numbers (links only; nothing downloaded), and 7 real Arabic clips with direct file URLs (Sky News Arabia reports and interviews, a CNN Business Arabic interview with a minister, the Dubai Police podcast, a Sky News podcast) used for transcription tests and the media demo checks |
| `documents/corpus/` | The corpus documents (each with its URL and sha256 in the manifest) |
| `documents/discovered/` | The official documents the search agent found and stored during the demo checks (written by `make seed-export`) |
| `media/video/`, `media/audio/` | The real clips used by the media checks (`date_publisher_topic`). Publishers' copyright: included only to test the prototype and reproduce its demo; `make media` downloads them again |
| `inputs/` | The texts submitted as the demo text checks |

Every quote in the manifest was found verbatim in its file, and every claim text was found in a saved copy of its article.

## Demo data

- `make seed` — the base seed (catalog). `make seed-demo` — the demo data exactly as recorded (accounts, registry with stored documents, 208 checks with their clips, alerts, activity, usage, briefs, evaluation runs). Demo users (password in `worker/seed_data/demo.json`): `admin@isnad.ae` (platform admin), `curator@isnad.ae` (curator); newsroom «غرفة المدار» (`almadar`): `laila@almadar.news` (admin), `sara@almadar.news` (editor), `omar@almadar.news` and `khaled@almadar.news` (journalists); «صحيفة الأفق» (`alufuq`): `rana@alufuq.ae` (admin).
- `make seed-showcase` — the demo checks processed again by the real pipeline, with realistic review states ([05-worker.md](05-worker.md#seeds)).

## Evaluation runs

Staff start an evaluation from the console (**Quality and models** → run the test set): the `eval_runs` row is inserted as `queued`, which queues `run_eval`, and the worker runs `isnad_worker.eval.harness.run`. `make eval` (`python -m isnad_worker.eval`) runs the same harness in-process: the labelled claims of `sample-data/manifest.json` become text checks in the internal `isnad-eval` newsroom, go through `process_check`, and are scored into `eval_runs` ([06-worker-tools.md](06-worker-tools.md)).

## Manual verification (current state)

Tested in the browser against the local stack, in Arabic and English, light and dark, at desktop and 375 px widths:

- Text check end to end (5 numbers: match, match, differs, differs, forecast flagged as not checkable), and the full review: approve matches, edit wording, keyboard navigation (j/k), approve check, record publication, public evidence page.
- Video upload through the form; a clip's own caption track used instead of transcription; caption overlay, timeline markers, click-to-seek, follow playback, pause at each issue.
- Real clips through the full pipeline (October 2026): four Sky News Arabia videos (1:21 to 14:46, MSA, Gulf and Levantine speech), a minister's radio interview, the Dubai Police podcast and a podcast with inserted ads; speakers separated, numbers transcribed as spoken, about $0.0055 a minute of transcription. A 28.6-minute recording is cut into three parts at pauses.
- Audio without captions transcribed by Gemini 3.5 Transcribe (word timings), live updates, retry.
- Link checks on newspaper articles; cancelling a processing check; the per-check search budget and "search official sources" on demand.
- Registry pages and Ask Isnad; newsroom admin (invitations end to end through the local mail inbox, members, policies, private sources, activity export); settings; alerts; briefs; the console pages and their permission edges.

Live model runs (October 2026, Gemini): a seven-number text check ($0.0098, one Flash call for a verifier objection), a check needing source search ($0.02, one Google Search query; the Sharjah population was found on u.ae and verified verbatim), and an audio check transcribed by Gemini 3.5 Transcribe.

---

[← Security](08-security.md) · [Documentation](../README.md) · [Local development →](10-local-development.md)
