# Worker tools: Telegram bot, test corpus, evaluation

## Telegram bot

`isnad_worker/telegram/`:

| Module | Role |
|---|---|
| `client.py` | Bot API over HTTP: retries, flood-control waits, 403 as `BotBlocked`, token never in logs or errors |
| `messages.py` | Everything the bot says, Arabic and English, and the summary/progress formatting (HTML parse mode, escaped) |
| `bot.py` | Linking, intake, commands, progress edits, summaries, alerts |
| `notify.py` | Job handlers `telegram_check_done` and `deliver_alerts` (run by the pipeline worker) |
| `__main__.py` | The bot process: long polling in development, webhook registration in production |

Flow:

1. A member opens Settings → Link Telegram; the web app calls `create_telegram_link_token()` and
   shows `t.me/<bot>?start=<token>`. The bot hashes the token (sha256, as stored), checks expiry
   and single use, and writes `telegram_links`. One Telegram account belongs to one user.
2. Messages from linked members become checks (`channel = 'telegram'`) in their newsroom: text,
   a link (a message that is only a URL), voice notes, audio, video, video notes, PDF/Word/text
   files. Media is limited to 20 MB (the Bot API's download limit) and goes to the `media`
   bucket. The newsroom's Telegram policy, its monthly limit and a per-user rate limit
   (10 checks per 10 minutes) apply.
3. The bot replies with a progress message and edits it as the check's stage changes (a loop in
   the bot process reads processing Telegram checks every few seconds).
4. When the check finishes (or fails), the pipeline enqueues `telegram_check_done`; the worker
   edits the progress message and sends the summary: verdict counts, each number with its source
   and suggested wording, an "open report" button, and "send to editor" for journalists.
5. Buttons and workflow actions run as the member: the bot sets `request.jwt.claims` and
   `role authenticated` in its transaction, so `send_for_review` and friends enforce the same
   rules as in the web app.

Every update is recorded in `telegram_updates` first, so a retried webhook or a restarted poller
never handles one twice. Group chats are ignored. Links to the report are buttons only when
`SITE_URL` is public (Telegram rejects localhost buttons); locally they're printed in the text.

Run locally: `make bot` (polling with the development bot from `../credentials/telegram.env`).
Commands are registered in Arabic (default) and English on start.

## Test corpus

`sample-data/manifest.json` lists official UAE documents (`documents`), labelled claims from UAE
outlets (`claims`) and media links (`media`). The document files live in `sample-data/documents/corpus/`
(~50 MB). Each claim has its `expected_verdict` and a `target`: the labelled number
as written in `text_ar`.

`make corpus` (`python -m isnad_worker.seed documents`) stores each document under the trusted
source that publishes it (by host, then tier, outlet type and language), and reads it into
figures with the registry's ingestion; verified figures with a catalog indicator are approved.
Re-running is cheap: unchanged files map to their stored version. Options: `--review`,
`--force`, `--reverify` (re-check stored figures against improved text reading, no model calls),
`--only id,id`, `--concurrency N`. `ISNAD_CORPUS_DIR` points at another corpus folder.

What the reading does with official files:

- PDFs: text by layout block, Arabic lines rebuilt right to left from word positions; long
  documents are read on their most relevant pages (up to 40, 20 per model call); quotes are
  checked against the page, tolerating split lam-alef ligatures, letter-spaced infographics and
  moved punctuation.
- Spreadsheets: each cell as the sheet shows it (rounded to its number format, percent cells
  ×100), so figures keep their published precision.
- Web pages: the largest `<article>` (or `<main>`), even inside a `<header>` or an ASP.NET
  `<form>`; versions are compared by their text, so a page whose bytes change on every fetch
  isn't a new version.

## Evaluation

`make eval` (`python -m isnad_worker.eval`) runs every labelled claim through the real check
pipeline as a text check in the internal `isnad-eval` newsroom (`newsrooms.internal = true`, left
out of product statistics), finds the claim whose span covers the target number, and compares its
verdict with the label (`different_context` → context, `no_source` → none; a number extracted
as not checkable counts as none).

Metrics on `eval_runs.metrics`: accuracy, per-verdict precision/recall/F1, the confusion matrix,
risk counts (false reassurance: a wrong or out-of-context number shown as matching; false alarm;
unsupported number given a source), evidence-verified rate, right-document rate, abstention
reasons, cost and latency. Per-claim results are on `eval_runs.results`.

| Option | Use |
|---|---|
| `--limit N`, `--only claim-001,…` | a subset |
| `--no-discovery` | registry only (no searching official sites) |
| `--recheck RUN_ID` | re-run comparison on a finished run's checks (same extracted claims): isolates rule and registry changes from extraction variance |
| `--rescore RUN_ID` | score a finished run again after a label fix (no model calls) |

A full run costs about $9 and takes 15–45 minutes depending on concurrency.
