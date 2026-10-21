# Local Development and Operations Notes

## Prerequisites

- Docker (running), Node.js 22+, Python 3.12 with [uv](https://docs.astral.sh/uv/), the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), and `ffmpeg` (`brew install uv supabase/tap/supabase ffmpeg`).
- Provider keys in a `credentials/` folder next to the repository, one `<provider>.env` per provider: `gemini.env` (`GEMINI_API_KEY`) and `telegram.env` (`TELEGRAM_BOT_TOKEN`). The folder is outside git; `make env` copies only those two keys into the env files.

## First run

```bash
make setup      # npm install in web/, uv sync in worker/
make db         # start local Supabase
make env        # write web/.env.local and worker/.env
make db-reset   # migrations + base seed + demo data
make dev        # web, worker API and pipeline worker together
```

Then sign in at http://localhost:3000 with a demo account ([testing.md](testing.md#demo-data)).

## Make targets

| Target | What it does |
|---|---|
| `make help` | List targets |
| `make setup` | Install web and worker dependencies |
| `make db` / `make db-stop` | Start / stop local Supabase |
| `make db-reset` | Recreate the database from migrations, then `make seed` and `make seed-demo` |
| `make seed` | Base seed: catalog (topics, indicators, entities, sources); idempotent |
| `make seed-demo` | Demo data as recorded: accounts, registry with stored documents, checks with clips, alerts, activity, usage, briefs, evaluation runs; idempotent, no model calls |
| `make seed-export` | Write the demo data (`worker/seed_data/*.json.gz`, `sample-data/documents/discovered/`, `sample-data/README.md`) from the local database |
| `make seed-showcase` | Demo checks from the test corpus and clips, processed again by the running worker (model calls) |
| `make env` | Write env files from the running Supabase and `../credentials` (prints names only) |
| `make types` | Regenerate `web/src/lib/database.types.ts` after a schema change |
| `make web` | Next.js dev server on :3000 |
| `make api` | Worker API on :8000 (auto-reload) |
| `make worker` | Pipeline worker |
| `make dev` | `web`, `api` and `worker` in parallel |
| `make test` | Worker tests and lint, web lint and type check |

New migrations go in `supabase/migrations/` with a timestamped name; apply them with `make db-reset` (or `psql -f` on a running database), then run `make types`.

## Local services

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Worker API | http://localhost:8000 (`/health`) |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (auth emails: magic links, invitations, password resets) | http://127.0.0.1:54324 |

## Gemini API

Every model task, transcription included, uses one Gemini API key (Google AI Studio → API keys, on a project with billing enabled). Without it, checks fail at extraction and media checks with `speech_unavailable`; clips with an embedded caption track still get their transcript. Models per task, and when the stronger one is used, are in [architecture.md](architecture.md#ai-gateway); platform admins change them under **Console → Quality and models**. Google Search grounding includes 5,000 free queries a month; past that each query costs $0.014.

## Things to know

- **Supabase config changes** (`supabase/config.toml`: site URL, redirect URLs, email templates) only apply after `supabase stop && supabase start` from the repo folder.
- **One worker per code version.** After pulling worker changes, stop the old worker (Ctrl+C, or a second Ctrl+C to skip waiting for running jobs) before starting the new one. Jobs left running by a killed worker go back to the queue after `JOB_TIMEOUT_MINUTES`.
- **After a database reset**, browser sessions belong to users that no longer exist; the app signs them out automatically (`/auth/session-ended`).
- **Testing in a hidden or background browser tab:** React reveals streamed page sections on the next animation frame, which a background tab doesn't get, so buttons in those sections stay inert until the tab is shown. It isn't a bug in the app.
- **Costs:** model usage is recorded per newsroom and check in `usage_events` and visible in the console (**System**, **Newsrooms**) and to newsroom admins (**Activity and usage**).
- **Media retention:** uploaded clips are deleted after each newsroom's retention period (default 90 days) by the daily cleanup job; results, transcripts and decisions stay.

Deployment to a server is described separately in [deployment.md](deployment.md).
