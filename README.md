# Isnad (إسناد)

Traces the numbers in Arabic media content back to their official sources: every claim gets its evidence, its chain, and an editor's decision.

## Layout

| Path | What it is |
|---|---|
| `web/` | Next.js app (TypeScript): screens, server actions, admin pages |
| `worker/` | Python: the processing pipeline worker, the Telegram bot, and a FastAPI app (Ask Isnad for the web app, the Telegram webhook) |
| `supabase/` | Local Supabase config, SQL migrations, email templates (the seed data is in `worker/seed_data/` and `sample-data/`) |
| `deploy/` | VM deployment: Dockerfiles, Compose next to self-hosted Supabase, Caddy, backups ([runbook](docs/technical/11-deployment.md)) |
| `docs/` | Product and technical documentation ([index](docs/README.md)) |
| `sample-data/` | The clips, official documents and texts the platform was tested with ([list](sample-data/README.md)) |
| `presentation/` | The submission video, the full walkthrough, the presentation and the brand identity ([list](presentation/README.md)) |
| `screenshots/` | The product's main screens with the demo data ([gallery](screenshots/README.md)) |
| `designs/` | Logos, icons and the product UI design in FigCraft ([guide](designs/README.md)) |

The database is the contract between `web/` and `worker/`: the web app writes rows, the worker picks them up and writes results back.

## Prerequisites

- Docker, running
- Node.js 22+
- [uv](https://docs.astral.sh/uv/) (it fetches Python 3.12), the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and ffmpeg: `brew install uv supabase/tap/supabase ffmpeg`

## First run

```bash
make setup      # install web and worker dependencies
make db         # start local Supabase (the first run downloads Docker images)
make env        # write web/.env.local and worker/.env (local Supabase + keys from ../credentials)
make db-reset   # build the database from migrations, then load the base seed and the demo data (no model calls)
make dev        # run web, api, worker, and the Telegram bot together
```

Open http://localhost:3000 and sign in with a demo account (below). There are two seeds:

- **`make seed` (base)**: the catalog every installation needs: 21 topics, 78 indicators, 97 UAE
  entities and 140 trusted official sources.
- **`make seed-demo` (demo data)**: the demo exactly as it was recorded, with no model calls:
  - the demo newsrooms and their 7 accounts;
  - the registry: 97 official documents (29 from the test corpus, 68 found by the search agent during
    checks) with their stored copies and 828 extracted figures;
  - 208 processed checks: 18 newsroom checks in realistic review states (newspaper articles, a link,
    and 8 checks of real Arabic clips: broadcast reports and interviews, a minister's radio interview,
    the Dubai Police podcast; two published with public evidence pages) and 190 evaluation checks;
  - alerts, the activity log, model usage and cost, an interview brief and the evaluation runs.

`make db-reset` runs both. The documents, clips and texts come from [sample-data/](sample-data/README.md),
which lists every item with its original link. `make seed-export` writes the demo data again from your
local database.

Viewing the demo needs no API key. To run new checks, put `GEMINI_API_KEY=…` in a `.env` file in a
`credentials/` folder next to the repository (for example `../credentials/gemini.env`) and run
`make env` again: it rewrites `worker/.env` and keeps only keys from that folder. The step-by-step
guide, including getting a Gemini key and creating a Telegram bot, is
[docs/technical/10-local-development.md](docs/technical/10-local-development.md).

For more demo checks, built from real newspaper claims and the real clips and processed by the real
pipeline (about $0.50 of model tokens, plus Google Search queries that the free monthly allowance
covers; the worker must be running):

```bash
make seed-showcase
```

## Demo accounts

All use the password in `worker/seed_data/demo.json` (local development only).

| Account | Role |
|---|---|
| `laila@almadar.news` | Newsroom admin, غرفة المدار |
| `sara@almadar.news` | Editor, غرفة المدار |
| `omar@almadar.news`, `khaled@almadar.news` | Journalists, غرفة المدار |
| `rana@alufuq.ae` | Newsroom admin, صحيفة الأفق |
| `curator@isnad.ae` | Isnad curator (console) |
| `admin@isnad.ae` | Isnad platform admin (console) |

## External services

| Service | Used for | Notes |
|---|---|---|
| Gemini API (Google AI Studio key) | every model task: transcription, extraction, verification, wording, source search (Google Search grounding), figure extraction, Ask Isnad, briefs | one key, `GEMINI_API_KEY`, on a project with billing; models per task in [docs/technical/01-architecture.md](docs/technical/01-architecture.md#ai-gateway) |
| Telegram Bot API | the bot | development bot by polling; webhook in production |

## Local services

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Worker API | http://localhost:8000 (`/health`, `/internal/ask`, `/telegram/webhook`) |
| Telegram bot | the development bot, by long polling (`make bot`) |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (auth emails) | http://127.0.0.1:54324 |

## Common tasks

```bash
make help                          # list all targets
make env                           # write web/.env.local and worker/.env (local Supabase + ../credentials)
make test                          # worker tests + lint, web lint + type check
make db-reset                      # rebuild the local database from migrations, base seed and demo data
make seed                          # base seed only: topics, indicators, entities, official sources
make seed-demo                     # demo data: accounts, registry, checks, alerts, usage (no model calls)
make seed-export                   # write the demo data and sample-data/README.md from the local database
make types                         # regenerate web/src/lib/database.types.ts after a schema change
make smoke                         # request every page as each demo role against the running app
make seed-showcase                 # more demo checks through the real pipeline (model cost)
make bot                           # run only the Telegram bot (polling)
make corpus                        # read the test corpus documents into the registry (model cost)
make media                         # download the clips again from their publishers
make screenshots                   # take the product screenshots in screenshots/ (app running)
make eval                          # evaluate the pipeline on the labelled corpus claims (model cost)
supabase migration new <name>      # create a new migration in supabase/migrations
```

## Documentation

The full, ordered index is in [docs/README.md](docs/README.md):

- [Product docs](docs/product/README.md): overview, roles and permissions, a guide per role, glossary.
- [Technical docs](docs/technical/README.md): architecture, data model, pipeline, registry, worker, web app, security, testing, operations, deployment.

## Team

- Idea and product: Taqwa Al-Araji
- Development: Ahmed Kadhim

## License

[GNU AGPL-3.0](LICENSE). You may use, change and share Isnad; if you run a modified version as a service, you must publish your changes under the same licence.
