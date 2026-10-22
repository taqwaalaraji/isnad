# Isnad Documentation

How Isnad works for the people who use it, and how it is built and run. The documents are numbered in reading order; each ends with links to the previous and next one.

![How Isnad works: send content, agents and code check each number, a card of evidence per number, the editor decides](img/overview.png)

## [Product docs](product/README.md)

What Isnad does and how each role uses it.

| # | Document | Covers |
|---|---|---|
| 01 | [Overview](product/01-overview.md) | What Isnad does; numbers, verdicts, the chain, source tiers, evidence, the registry, the isnad note, the public evidence page |
| 02 | [Roles and permissions](product/02-roles-and-permissions.md) | Newsroom and platform roles, who sees which check, who can do what |
| 03 | [Guide for journalists](product/03-guide-journalist.md) | Starting a check, reading the results, fixing the transcript, sending for review, the registry, briefs, alerts, Telegram, settings |
| 04 | [Guide for editors](product/04-guide-editor.md) | Reviewing each number, approving, publishing, verdicts in practice, statuses |
| 05 | [Guide for newsroom admins](product/05-guide-newsroom-admin.md) | Members and desks, policies, private sources, activity and usage |
| 06 | [Guide for curators and platform admins](product/06-guide-curator.md) | The Isnad console: sources, inbox, figure review, catalog, proposals, newsrooms, models, system |
| 07 | [Glossary](product/07-glossary.md) | Arabic and English terms as the interface uses them |

## [Technical docs](technical/README.md)

How Isnad is built, tested, run and deployed.

| # | Document | Covers |
|---|---|---|
| 01 | [Architecture](technical/01-architecture.md) | Components, data flow, the job queue, realtime, storage, the AI gateway and model choices |
| 02 | [Data model](technical/02-data-model.md) | Tables by area, check statuses, the shared-registry and newsroom-private rule, text normalization |
| 03 | [The check pipeline](technical/03-pipeline.md) | Lifecycle, job modes, preparing and transcription, extraction, comparison, discovery, evidence, verifier, wording, chain, failures, cost |
| 04 | [The Isnad Registry](technical/04-registry.md) | Catalog, source tiers, document versions, figure extraction, review, revisions and alerts, watching, private sources, Ask Isnad |
| 05 | [The worker](technical/05-worker.md) | Modules, job kinds, configuration, seeds, devtools |
| 06 | [Worker tools](technical/06-worker-tools.md) | The Telegram bot, the test corpus, the evaluation harness |
| 07 | [The web app](technical/07-web-app.md) | Layout, routes, rendering patterns, Supabase clients, i18n, design system, environment variables |
| 08 | [Security](technical/08-security.md) | Sign-in, invitations, roles, row-level security, workflow functions, storage, safe fetching, secrets, headers, Telegram |
| 09 | [Testing](technical/09-testing.md) | Automated checks, test and demo data, evaluation runs, manual verification |
| 10 | [Local development](technical/10-local-development.md) | Run Isnad on your computer: tools, a Gemini key, a Telegram bot, first run, make targets, local services |
| 11 | [Deployment](technical/11-deployment.md) | One VM: Supabase, settings and secrets, first start, checks, backups and restore, upgrades |

## Diagrams and screenshots

The diagrams are in [img/](img/):

| Diagram | Used in |
|---|---|
| [How Isnad works](img/overview.png) | [Overview](product/01-overview.md) |
| [Verdicts](img/verdicts.png) | [Overview](product/01-overview.md), [Guide for editors](product/04-guide-editor.md) |
| [Roles](img/roles.png) | [Roles and permissions](product/02-roles-and-permissions.md), [Security](technical/08-security.md) |
| [A check's life](img/check-lifecycle.png) | [Guide for editors](product/04-guide-editor.md), [The check pipeline](technical/03-pipeline.md) |
| [The registry](img/registry.png) | [Guide for curators](product/06-guide-curator.md), [The Isnad Registry](technical/04-registry.md) |
| [Architecture](img/architecture.png) | [Architecture](technical/01-architecture.md) |
| [Data model](img/data-model.png) | [Data model](technical/02-data-model.md) |
| [The check pipeline](img/pipeline.png) | [The check pipeline](technical/03-pipeline.md) |
| [Deployment](img/deployment.png) | [Deployment](technical/11-deployment.md) |

Every screen of the product, from the demo data: [screenshots](../screenshots/README.md).

---

[Product docs →](product/README.md)
