# Local Development and Operations Notes

## Prerequisites

- Docker (running), Node.js 22+, Python 3.12 with [uv](https://docs.astral.sh/uv/), the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), and `ffmpeg` (`brew install uv supabase/tap/supabase ffmpeg`).
- Provider keys in a `credentials/` folder next to the repository (or the folder in `ISNAD_CREDENTIALS_DIR`), in any `*.env` files, for example `gemini.env` (`GEMINI_API_KEY`) and `telegram.env` (`TELEGRAM_BOT_TOKEN`). The folder is outside git; `make env` copies only those two keys into the env files. Viewing the demo needs neither.

## First run

```bash
make setup      # npm install in web/, uv sync in worker/
make db         # start local Supabase
make env        # write web/.env.local and worker/.env
make db-reset   # migrations + base seed + demo data
make dev        # web, worker API, pipeline worker and Telegram bot together
```

Then sign in at http://localhost:3000 with a demo account ([09-testing.md](09-testing.md#demo-data)).

## Make targets

| Target | What it does |
|---|---|
| `make help` | List targets |
| `make setup` | Install web and worker dependencies |
| `make db` / `make db-stop` | Start / stop local Supabase |
| `make db-reset` | Recreate the database from migrations, then `make seed` and `make seed-demo` |
| `make seed` | Base seed: catalog (topics, indicators, entities, sources); idempotent |
| `make seed-demo` | Demo data as recorded: accounts, registry with stored documents, checks with clips, alerts, activity, usage, briefs, evaluation runs; idempotent, no model calls |
| `make seed-export` | Write the demo data (`worker/seed_data/*.json.gz`, `sample-data/documents/discovered/`, `sample-data/README.md`, `sample-data/inputs/`) from the local database |
| `make seed-showcase` | Demo checks from the test corpus and clips, processed again by the running worker (model calls) |
| `make env` | Write `web/.env.local` and `worker/.env` (mode 600) from the running Supabase and `../credentials`; keeps a stable `INTERNAL_API_TOKEN`, takes the bot's username from Telegram (`getMe`); prints names only. It rewrites both files, so keys added by hand belong in `../credentials` |
| `make types` | Regenerate `web/src/lib/database.types.ts` after a schema change (formatted with `oxfmt`) |
| `make web` | Next.js dev server on :3000 |
| `make api` | Worker API on :8000 (auto-reload) |
| `make worker` | Pipeline worker |
| `make bot` | Telegram bot (long polling; needs `TELEGRAM_BOT_TOKEN`) |
| `make dev` | `web`, `api`, `worker` and `bot` in parallel |
| `make media` | Download the clips in `sample-data/manifest.json` again from the publishers |
| `make corpus` | Read the corpus documents into the registry (model calls) |
| `make eval` | Evaluate the pipeline on the labelled claims (model calls) |
| `make smoke` | Every page as every demo role, against the running app |
| `make screenshots` | Product screenshots in `screenshots/` from the running app with the demo data (`web/scripts/screenshots.mjs`) |
| `make test` | Worker tests and lint, web lint and type check |

New migrations go in `supabase/migrations/` with a timestamped name; apply them with `make db-reset` (or `psql -f` on a running database), then run `make types`.

## Local services

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Worker API | http://localhost:8000 (`/health`; `/internal/ask` for Ask Isnad; `/telegram/webhook` in webhook mode) |
| Telegram bot | long polling (`make bot`) |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (auth emails: magic links, invitations, password resets) | http://127.0.0.1:54324 |

## Gemini API

Every model task, transcription included, uses one Gemini API key (Google AI Studio → API keys, on a project with billing enabled). Without it, checks fail at extraction and media checks with `speech_unavailable`; clips with an embedded caption track still get their transcript. Models per task, and when the stronger one is used, are in [01-architecture.md](01-architecture.md#ai-gateway); platform admins change them under **Console → Quality and models**. Google Search grounding includes 5,000 free queries a month; past that each query costs $0.014 (`usage_events` records every query at that rate, so recorded costs are an upper bound).

**Rate limits.** Each model has its own limits on the project's tier (Google AI Studio → Rate limit). On Tier 1, Gemini 3.5 Transcribe allows 10 requests a minute, 10,000 tokens a minute and 100 requests a day; a clip uses one request per 10-minute part, and one part can exceed the per-minute tokens. The client retries rate-limit errors, so a check over the limit waits and can then fail. Raise the tier before heavy use of audio and video checks.

## Things to know

- **Supabase config changes** (`supabase/config.toml`: site URL, redirect URLs, email templates) only apply after `supabase stop && supabase start` from the repo folder.
- **One worker per code version.** After pulling worker changes, stop the old worker (Ctrl+C, or a second Ctrl+C to skip waiting for running jobs) before starting the new one. Jobs left running by a killed worker go back to the queue after `JOB_TIMEOUT_MINUTES`.
- **After a database reset**, browser sessions belong to users that no longer exist; the app signs them out automatically (`/auth/session-ended`).
- **Testing in a hidden or background browser tab:** React reveals streamed page sections on the next animation frame, which a background tab doesn't get, so buttons in those sections stay inert until the tab is shown. It isn't a bug in the app.
- **Costs:** model usage is recorded per newsroom and check in `usage_events` and visible in the console (**Quality and models**: by day and task, and per check; **Newsrooms**: this month's cost) and to newsroom admins (**Activity and usage**).
- **Media retention:** uploaded clips are deleted after each newsroom's retention period (default 90 days) by the daily cleanup job; results, transcripts and decisions stay.

Deployment to a server is described separately in [11-deployment.md](11-deployment.md).

---

[← Testing](09-testing.md) · [Documentation](../README.md) · [Deployment →](11-deployment.md)
