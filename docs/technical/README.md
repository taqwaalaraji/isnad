# Technical Docs

How Isnad is built and operated. Each document describes what exists in the code today; update it in the same change that changes the behavior.

| Document | Covers |
|---|---|
| [architecture.md](architecture.md) | Components, data flow, job queue, realtime, storage, the AI gateway |
| [data-model.md](data-model.md) | Tables by area, statuses, the shared-registry vs newsroom-private rule, text normalization |
| [security.md](security.md) | Sign-in, invitations, roles, row-level security, workflow functions, storage access, safe fetching, secrets |
| [pipeline.md](pipeline.md) | How a check is processed: preparing, transcription, extraction, comparison, discovery, evidence, verifier, wording, chain, failures |
| [registry.md](registry.md) | Sources and tiers, document versions, figure extraction, review, revisions and alerts, watching, Ask Isnad |
| [web-app.md](web-app.md) | Routes, rendering patterns, server actions, realtime, i18n, design system, env vars |
| [worker.md](worker.md) | Modules, job kinds, configuration, seeds, devtools |
| [testing.md](testing.md) | Automated checks, test corpus, demo data, evaluation, manual verification |
| [operations.md](operations.md) | Local development: setup, make targets, services, the Gemini API, practical notes |
| [worker-tools.md](worker-tools.md) | Telegram bot, test corpus seeding, evaluation harness |
| [deployment.md](deployment.md) | Single-VM deployment, secrets, migrations, backups, upgrades |

Product documentation (features, roles, guides, glossary) is in [../product/](../product/).
