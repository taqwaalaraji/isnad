# Local Development

Everything needed to run Isnad on your own computer: the tools, the two optional keys (Gemini and a Telegram bot), the first run, and the day-to-day commands. Running it on a server is in [11-deployment.md](11-deployment.md); the `deploy/` folder is only for that.

## 1. Install the tools

| Tool | Why |
|---|---|
| [Docker](https://docs.docker.com/get-docker/), running | The local Supabase stack runs in containers |
| [Node.js](https://nodejs.org/) 22 or newer | The web app |
| [uv](https://docs.astral.sh/uv/) | The worker (it installs Python 3.12 by itself) |
| [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | Starts Postgres, Auth, Storage and Realtime locally |
| [ffmpeg](https://ffmpeg.org/download.html) | Prepares audio and video for transcription |

On macOS: `brew install uv supabase/tap/supabase ffmpeg` (and Node.js from nodejs.org or `brew install node`).

## 2. Get the code

```bash
git clone https://github.com/taqwaalaraji/isnad.git
cd isnad
```

## 3. Keys

Viewing the demo needs no keys. New checks, Ask Isnad and briefs need a Gemini API key; the Telegram bot needs a bot token. Your keys go in `credentials.env` at the root of the repository. Git ignores that file, so the keys are never committed. Create it from the template:

```bash
cp credentials.env.example credentials.env
```

It holds two lines; fill in the keys you have (how to get them is below):

```
GEMINI_API_KEY=…
TELEGRAM_BOT_TOKEN=…
```

`make env` (part of the first run below) copies them into `worker/.env`, printing names only, never values; if `credentials.env` doesn't exist yet, it creates it from the template with empty keys. When you add or change a key later, run `make env` again and restart `make dev`.

### Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/) and sign in with a Google account.
2. Go to [API keys](https://aistudio.google.com/apikey) and choose **Create API key**, in a new or an existing Google Cloud project.
3. Turn on billing for that project (in AI Studio, **Set up billing** next to the key). Isnad was built and measured on a paid project (Tier 1); its rate limits are under [Gemini API](#gemini-api) below. Set a budget alert in Google Cloud if you like: a check costs about five US cents on average.
4. Put it in `credentials.env`:

   ```
   GEMINI_API_KEY=your-key
   ```

5. If Isnad is already running, run `make env` and restart `make dev`.

Without a key the demo still works; new checks fail at the extraction step (clips without their own captions fail earlier, with "speech unavailable").

### Telegram bot (optional)

1. In Telegram, open [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Give it a display name (for example "Isnad Dev") and a username that ends in `bot` (for example `my_isnad_dev_bot`).
3. BotFather answers with the bot's token. Put it in `credentials.env`:

   ```
   TELEGRAM_BOT_TOKEN=123456:ABC…
   ```

4. Run `make env` (or the first run below). It copies the token to `worker/.env` and asks Telegram for the bot's username, which it writes to `web/.env.local` for the link on the settings page. Restart `make dev` if it was running.
5. In Isnad, open **Settings → Channels**, press **Open Telegram** (or scan the code) and press **Start** in the chat. Then send the bot a sentence with a number.

Use a bot made for development, not the production one: locally the bot reads its messages by long polling, which removes the webhook a production server set for the same token. Locally, links to reports appear as text, because Telegram refuses buttons that point to localhost. The bot answers private chats only. Without a token, `make dev` runs everything else and the bot process says Telegram is off.

## 4. First run

```bash
make setup      # npm install in web/, uv sync in worker/
make db         # start local Supabase (the first time downloads its Docker images)
make env        # write web/.env.local and worker/.env from the running Supabase and credentials.env
make db-reset   # migrations, then the base seed and the demo data (no model calls)
make dev        # web, worker API, pipeline worker and Telegram bot together; Ctrl+C stops them
```

Then open http://localhost:3000.

### What the seeds load

`make db-reset` runs both seeds; neither calls a model.

- **`make seed` (base):** the catalog every installation needs: 21 topics, 78 indicators, 97 UAE entities and 140 trusted official sources.
- **`make seed-demo` (demo data):** the demo exactly as it was recorded:
  - two newsrooms and their accounts (below);
  - the registry: 97 official documents (29 from the test corpus, 68 found by the search agent during checks) with their stored copies and 828 extracted figures;
  - 208 processed checks: 18 newsroom checks in realistic review states (newspaper articles, a link, and 8 real Arabic clips: broadcast reports and interviews, a minister's radio interview, the Dubai Police podcast; two published with public evidence pages) and 190 evaluation checks;
  - alerts, the activity log, model usage and cost, an interview brief and the evaluation runs.

The documents, clips and texts come from [sample-data/](../../sample-data/README.md), which lists every item with its original link. `make seed-export` writes the demo data again from your local database, and `make seed-showcase` builds more demo checks through the real pipeline (about $0.50 of model tokens; the worker must be running).

## 5. Demo accounts

Every demo account uses the password **`Isnad-Demo-2026!`** (also in `worker/seed_data/demo.json`). They are for local use: change them on any server other people can reach.

| Account | Role | Try |
|---|---|---|
| `omar@almadar.news` | Journalist, غرفة المدار | Start a check, read the numbers and their evidence, fix the transcript, send for review |
| `khaled@almadar.news` | Journalist, غرفة المدار | The same, with his own checks |
| `sara@almadar.news` | Editor, غرفة المدار | Decide on each number, approve, record publication, briefs |
| `laila@almadar.news` | Newsroom admin, غرفة المدار | Members and desks, policies, private sources, activity and usage |
| `rana@alufuq.ae` | Newsroom admin, صحيفة الأفق | A second newsroom: nothing of غرفة المدار is visible |
| `curator@isnad.ae` | Isnad curator | The console: sources, inbox, figure review, catalog, proposals |
| `admin@isnad.ae` | Isnad platform admin | The console, plus newsrooms, limits and model settings |

The [product guides](../product/README.md) walk through each role's screens.

## 6. Check that it works

1. Sign in at http://localhost:3000 with a demo account.
2. Sign-in links, invitations and password resets are emails: read them in Mailpit, http://127.0.0.1:54324.
3. With a Gemini key: **New check** → **Text**, paste «استقبلت دبي 19.59 مليون زائر دولي خلال عام 2025.» and start it. Within about a minute the check is awaiting review, with the number's verdict and its official source.
4. With a bot: link Telegram as above and send the same sentence to the bot; it replies with progress, then a summary.
5. `make test` runs the worker tests and lint, and the web lint and type check.

The other local addresses (Supabase Studio, Postgres, the worker API) are under [Local services](#local-services).

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
| `make env` | Write `web/.env.local` and `worker/.env` (mode 600) from the running Supabase and `credentials.env`; keeps a stable `INTERNAL_API_TOKEN`, takes the bot's username from Telegram (`getMe`); prints names only. It rewrites both files, so keys belong in `credentials.env`, not in the env files |
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

- **`make env` says local Supabase isn't running:** start it with `make db`. Supabase uses ports 54321 to 54324; stop other Supabase projects first (`supabase stop` in their folder).
- **The bot logs `getUpdates failed: 409`:** another process is reading the same bot (a second `make bot`, or a webhook set again by a server). Run one bot per token.
- **Supabase config changes** (`supabase/config.toml`: site URL, redirect URLs, email templates) only apply after `supabase stop && supabase start` from the repo folder.
- **One worker per code version.** After pulling worker changes, stop the old worker (Ctrl+C, or a second Ctrl+C to skip waiting for running jobs) before starting the new one. Jobs left running by a killed worker go back to the queue after `JOB_TIMEOUT_MINUTES`.
- **After a database reset**, browser sessions belong to users that no longer exist; the app signs them out automatically (`/auth/session-ended`).
- **Testing in a hidden or background browser tab:** React reveals streamed page sections on the next animation frame, which a background tab doesn't get, so buttons in those sections stay inert until the tab is shown. It isn't a bug in the app.
- **Costs:** model usage is recorded per newsroom and check in `usage_events` and visible in the console (**Quality and models**: by day and task, and per check; **Newsrooms**: this month's cost) and to newsroom admins (**Activity and usage**).
- **Media retention:** uploaded clips are deleted after each newsroom's retention period (default 90 days) by the daily cleanup job; results, transcripts and decisions stay.

---

[← Testing](09-testing.md) · [Documentation](../README.md) · [Deployment →](11-deployment.md)
