# Isnad — local development. Run `make help` for the list of targets.

.PHONY: help setup db db-stop db-reset seed seed-demo seed-export seed-showcase media corpus env types web api worker bot dev eval smoke test

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

setup: ## Install web and worker dependencies
	cd web && npm install
	cd worker && uv sync

db: ## Start local Supabase (Postgres, Auth, Storage, Realtime, Studio)
	supabase start

db-stop: ## Stop local Supabase
	supabase stop

db-reset: ## Recreate the local database from migrations, then load the base seed and the demo data
	supabase db reset
	$(MAKE) seed
	$(MAKE) seed-demo

seed: ## Base seed: topics, indicators, entities and official sources (every deployment; idempotent)
	cd worker && uv run python -m isnad_worker.seed base

seed-demo: ## Demo data as recorded: accounts, newsrooms, registry, checks, alerts, usage (no model calls; idempotent)
	cd worker && uv run python -m isnad_worker.seed demo-data

seed-export: ## Write the demo data and sample-data/README.md from the current local database
	cd worker && uv run python -m isnad_worker.seed export

seed-showcase: ## Demo checks from the test corpus and the real clips, processed by the running worker again (needs `make worker`; model calls)
	cd worker && uv run python -m isnad_worker.seed showcase

media: ## Download the clips listed in sample-data/manifest.json again from their publishers
	cd worker && uv run python -m isnad_worker.devtools.test_media

env: ## Write web/.env.local and worker/.env (local Supabase + keys from ../credentials)
	cd worker && uv run python -m isnad_worker.devtools.env

types: ## Regenerate TypeScript types from the local database schema
	supabase gen types typescript --local > web/src/lib/database.types.ts
	cd web && npx --yes oxfmt src/lib/database.types.ts

web: ## Run the Next.js app on http://localhost:3000
	cd web && npm run dev

api: ## Run the worker API on http://localhost:8000
	cd worker && uv run uvicorn isnad_worker.api:app --reload --port 8000

worker: ## Run the pipeline worker
	cd worker && uv run python -m isnad_worker.runner

bot: ## Run the Telegram bot (polling in development; needs TELEGRAM_BOT_TOKEN)
	cd worker && uv run python -m isnad_worker.telegram

dev: ## Run web, api, worker, and bot together (Ctrl+C stops all)
	$(MAKE) -j4 web api worker bot

corpus: ## Read the corpus documents in sample-data/ into the registry (costs model tokens)
	cd worker && uv run python -m isnad_worker.seed documents

eval: ## Evaluate the check pipeline on the labelled corpus claims (costs model tokens)
	cd worker && uv run python -m isnad_worker.eval

smoke: ## Request every page as each demo role against the running app (needs `make web` and the demo seed)
	cd web && node scripts/smoke.mjs

test: ## Run worker tests and lint, web lint and type check
	cd worker && uv run pytest && uv run ruff check . && uv run ruff format --check .
	cd web && npm run lint && npx tsc --noEmit
