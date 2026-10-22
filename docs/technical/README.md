# Technical Docs

How Isnad is built and operated. Each document describes what exists in the code today; update it in the same change that changes the behavior.

| # | Document | Covers |
|---|---|---|
| 01 | [Architecture](01-architecture.md) | Components, data flow, the job queue, realtime, storage, the AI gateway and model choices |
| 02 | [Data model](02-data-model.md) | Tables by area, check statuses, the shared-registry and newsroom-private rule, text normalization |
| 03 | [The check pipeline](03-pipeline.md) | Lifecycle, job modes, preparing and transcription, extraction, comparison, discovery, evidence, verifier, wording, chain, failures, cost |
| 04 | [The Isnad Registry](04-registry.md) | Catalog, source tiers, document versions, figure extraction, review, revisions and alerts, watching, private sources, Ask Isnad |
| 05 | [The worker](05-worker.md) | Modules, job kinds, configuration, seeds, devtools |
| 06 | [Worker tools](06-worker-tools.md) | The Telegram bot, the test corpus, the evaluation harness |
| 07 | [The web app](07-web-app.md) | Layout, routes, rendering patterns, Supabase clients, i18n, design system, environment variables |
| 08 | [Security](08-security.md) | Sign-in, invitations, roles, row-level security, workflow functions, storage, safe fetching, secrets, headers, Telegram |
| 09 | [Testing](09-testing.md) | Automated checks, test and demo data, evaluation runs, manual verification |
| 10 | [Local development](10-local-development.md) | Run Isnad on your computer: tools, a Gemini key, a Telegram bot, first run, make targets, local services |
| 11 | [Deployment](11-deployment.md) | One VM: Supabase, settings and secrets, first start, checks, backups and restore, upgrades |

To run Isnad on your computer, start with [10-local-development.md](10-local-development.md). New to the code? Read 01 to 04 first. Product documentation (features, roles, guides, glossary) is in [product docs](../product/README.md).

---

[← Glossary](../product/07-glossary.md) · [Documentation](../README.md) · [Architecture →](01-architecture.md)
