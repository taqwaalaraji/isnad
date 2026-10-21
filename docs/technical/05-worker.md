# The Worker

`worker/` is a Python 3.12 package (`isnad_worker`, managed with uv). It runs three processes:

- **Pipeline worker** — `python -m isnad_worker.runner` (`make worker`). Claims jobs from Postgres and runs them in a thread pool.
- **Worker API** — `uvicorn isnad_worker.api:app` (`make api`). FastAPI: `GET /health`, `POST /internal/ask` (Ask Isnad, protected by `Authorization: Bearer <INTERNAL_API_TOKEN>`) and `POST /telegram/webhook` (Telegram updates in webhook mode, checked against the `X-Telegram-Bot-Api-Secret-Token` header).
- **Telegram bot** — `python -m isnad_worker.telegram` (`make bot`). Long polling in development; in webhook mode it registers the webhook and runs the loop that edits each reply while a check progresses ([06-worker-tools.md](06-worker-tools.md)).

The worker connects to Postgres as the database owner, so row-level security doesn't apply to it; every rule it relies on is in its own code or in the SQL functions.

## Modules

| Module | Responsibility |
|---|---|
| `runner.py` | Worker threads, `LISTEN isnad_jobs`, the scheduler (stale-job recovery every minute, `watch_sources` every `WATCH_INTERVAL_HOURS`, daily `retention_cleanup` and job pruning), graceful shutdown |
| `jobs.py` | Queue primitives: handler registry, `enqueue`, `claim`, `complete`, `fail` with backoff, `recover_stale`, `prune`; `RetryableError` and `PermanentError` |
| `db.py` | Connection pool (thread-safe creation), `fetch_one`, `fetch_all`, `execute` (returns the row count), `transaction`, `json` |
| `storage.py` | Supabase Storage over REST with the secret key: upload, download, signed URLs, remove, list |
| `config.py` | Settings from the environment and `worker/.env` |
| `text.py` | Arabic normalization, verbatim matching (`find_span`, `contains_verbatim`), number parsing (digits with scale words and percent; spoken Arabic numbers), unit normalization, period labels |
| `ai/gateway.py` | The single entry point for model calls ([01-architecture.md](01-architecture.md#ai-gateway)) |
| `prompts/*.md` | System prompts: `extract_claims`, `verify_claim`, `suggest_wording`, `extract_figures`, `ask_registry` (the discovery reading and brief prompts are in their modules) |
| `pipeline/check.py` | The `process_check` job ([03-pipeline.md](03-pipeline.md)) |
| `pipeline/media.py` | ffmpeg/ffprobe: probe, audio extraction, web copies, poster, waveform, caption-track extraction (`parse_srt`) |
| `pipeline/transcribe.py` | Gemini 3.5 Transcribe through the Files and Interactions APIs: word timings and speakers, long recordings cut at pauses |
| `pipeline/content.py` | Paragraphs from text, PDF, DOCX and HTML (main-content extraction); safe downloads |
| `pipeline/extract.py` | Claim extraction, span anchoring, number re-reading, timings |
| `pipeline/catalog.py` | The indicator and entity catalog for prompts and name matching (cached 5 minutes) |
| `pipeline/compare.py` | Tolerance, period and scope relations, verdict rules |
| `pipeline/evidence.py` | Registry candidates, evidence verification against stored documents, earlier figures |
| `pipeline/discovery.py` | Google Search on allowed official domains, then reading the downloaded page; registers what it verifies |
| `pipeline/review.py` | Verifier, suggested wording, the chain |
| `registry/store.py` | Versioned document snapshots and text/table extraction |
| `registry/ingest.py` | The `ingest_document` job (figure extraction and verification) |
| `registry/intake.py` | The `register_document` job (console links and inbox uploads) |
| `registry/revisions.py` | The `figures_approved` job: supersede earlier figures, revision and follower alerts |
| `registry/watch.py` | `watch_sources`, `refetch_document`, `retention_cleanup` |
| `ask.py` | Ask Isnad |
| `briefs.py` | The `generate_brief` job |
| `evals.py` | The `run_eval` job (calls `isnad_worker.eval.harness`) |
| `telegram/notify.py` | `telegram_check_done` and `deliver_alerts` (call `isnad_worker.telegram.bot`) |
| `api.py` | The FastAPI app |
| `seed/` | Seed commands |
| `devtools/` | Local tooling |

## Job kinds

| Kind | Enqueued by | Handler |
|---|---|---|
| `process_check` | Trigger on `checks` insert; `request_recheck`; `update_segment`; `request_claim_search` | `pipeline/check.py` |
| `ingest_document` | Re-fetches, `register_document`, `retry_extraction` (`make corpus` runs ingestion in-process; `make seed-demo` restores figures without extracting) | `registry/ingest.py` |
| `register_document` | `add_source_document` (console) | `registry/intake.py` |
| `refetch_document` | `watch_sources`, `fetch_source_now` | `registry/watch.py` |
| `watch_sources` | Scheduler | `registry/watch.py` |
| `retention_cleanup` | Scheduler (daily) | `registry/watch.py` |
| `figures_approved` | `approve_figures` | `registry/revisions.py` |
| `deliver_alerts` | Revisions | `telegram/notify.py` |
| `telegram_check_done` | A Telegram check finished or failed | `telegram/notify.py` |
| `generate_brief` | Trigger on `briefs` insert; `regenerate_brief` | `briefs.py` |
| `run_eval` | Trigger on an `eval_runs` row inserted as `queued` (the console); `make eval` runs in-process | `evals.py` |

A worker only claims kinds it has a handler for, so workers of different versions can share a queue safely.

## Configuration

Read by `config.py` from the environment (or `worker/.env`):

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | local Supabase Postgres | Postgres connection |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | local | Storage and Auth admin |
| `SITE_URL` | `http://localhost:3000` | Links in messages |
| `INTERNAL_API_TOKEN` | — | Protects `/internal/*` |
| `GEMINI_API_KEY` | — | Gemini API: every model task, transcription included |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MODE` (`polling`/`webhook`/`off`), `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL` | `polling`; the URL defaults to `SITE_URL/telegram/webhook` | Telegram intake and delivery |
| `WORKER_CONCURRENCY` | 4 | Worker threads |
| `POLL_INTERVAL_SECONDS` | 5 | Fallback polling |
| `JOB_TIMEOUT_MINUTES` | 30 | When a running job counts as stale |
| `DISCOVERY_ENABLED` | true | Allow web search for unmatched numbers |
| `DISCOVERY_PER_CHECK` | 8 | Searched numbers per check |
| `WATCH_INTERVAL_HOURS` | 24 | How often sources are re-fetched |

Read directly from the environment by the tools: `ISNAD_CORPUS_DIR` (the corpus for `make corpus` and `make eval`, default `sample-data/`), `ISNAD_ADMIN_PASSWORD` (`seed admin`), `ISNAD_CREDENTIALS_DIR` (`make env`, default `../credentials`).

The worker needs `ffmpeg` and `ffprobe` on the path.

## Seeds

`python -m isnad_worker.seed <what>`:

| Command | Loads |
|---|---|
| `base` (default) = `catalog` | Topics, indicators, entities and sources from `seed_data/` (idempotent upserts); every deployment |
| `demo-data` | The demo as recorded, in order: `demo`, `registry`, `demo-checks`, `state` — never for production (known passwords) |
| `demo` | Demo staff and newsrooms from `seed_data/demo.json` (password in that file) |
| `registry` | `seed_data/registry_snapshot.json.gz`: every shared document (corpus and discovered), its versions with stored copies from `sample-data/documents/`, and figures; ids kept |
| `demo-checks` | `seed_data/demo_checks.json.gz`: every finished check with segments, claims, results, decisions, comments and publications; clips from `sample-data/media/`; creates the evaluation newsroom when missing; never re-queued |
| `state` | `seed_data/demo_state.json.gz`: newsroom settings, profile preferences, source health, alerts, activity log, usage events, briefs, evaluation runs, follows, invitations |
| `all` | `base`, then `demo-data` |
| `export` | `snapshot` + `demo-checks-export` (every finished check, or `--titles "a\|b"`) + `state-export` + `readme`, which writes `sample-data/README.md` and `sample-data/inputs/` (`make seed-export`) |
| `admin --email E --name N` | Creates or promotes the first platform admin on a new deployment; the password comes from `ISNAD_ADMIN_PASSWORD` or a prompt (12+ characters) |
| `documents` | The official documents of the test corpus into the registry, with automatic approval of verified figures (`--review` leaves them pending); model calls |
| `showcase` | Demo checks from `seed_data/showcase.json`: real newspaper claims grouped as drafts, and the clips in `sample-data/media/`. Needs the worker running; waits for processing, then applies review states (one published, escalations, matches approved, one sent for review), including checks the newsroom policy escalated. `--no-wait` only creates them. |

`make seed` runs `base`, `make seed-demo` runs `demo-data`, `make seed-export` runs `export`, `make seed-showcase` runs `showcase`.

## Devtools

| Command | What it does |
|---|---|
| `python -m isnad_worker.devtools.env` (`make env`) | Writes `web/.env.local` and `worker/.env` from `supabase status` and the provider keys in `../credentials/*.env`; keeps generated secrets stable; prints names only |
| `python -m isnad_worker.devtools.test_media [--only IDS]` (`make media`) | Downloads the real test clips listed in `sample-data/manifest.json` again (`media` entries with `file_url`) into `sample-data/media/` (the manifest `file`); checks each is a media file with an audio track; skips clips already present |

---

[← The Isnad Registry](04-registry.md) · [Documentation](../README.md) · [Worker tools →](06-worker-tools.md)
