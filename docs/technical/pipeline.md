# The Check Pipeline

A check is one submission: a video, an audio clip, a document, a link or pasted text. The `process_check` job (`worker/src/isnad_worker/pipeline/check.py`) turns it into numbers with verdicts and evidence. An editor then reviews them.

## Lifecycle

| Status | Meaning | Who moves it |
|---|---|---|
| `processing` | The worker is running (stages below) | Created by `createCheck`; also set by a re-check or a transcript correction |
| `awaiting_review` | Results ready, nothing decided yet | Worker (`_finish`) |
| `in_review` | At least one decision was made | `decide_claim`, `approve_matches`, `send_for_review` (from approved) |
| `escalated` | At least one number is escalated | Recomputed by `refresh_check_counts` after decisions |
| `approved` | Every checkable number decided, none escalated | `approve_check` |
| `published` | Publication recorded; public evidence page live | `publish_check` |
| `failed` | Processing stopped with a reason code | Worker (`_fail`) |
| `archived` | Hidden from lists; cancels processing | `archive_check` |

Stages while processing (`checks.stage`): `queued` → `preparing` → `transcribing` (media only) → `extracting` → `checking` → `done`. `checks.progress` holds timings (`<stage>_started_at`), `claims_total`, `claims_checked`, `transcribed_ms` and, for media, `transcript_source` (`captions` when the clip's own captions were used).

A new check is also limited by the newsroom's `monthly_check_limit`, checked in the `createCheck` server action.

## Job modes

| Mode | Started by | Does |
|---|---|---|
| `full` | New check (trigger); retry of a check that failed before it had any text | Prepare → extract → check |
| `recheck` | `request_recheck` | Deletes results, resets decisions to pending, checks every number again against today's registry. Keeps the transcript and claims. |
| `segment` | `update_segment` (a corrected transcript line) | Re-extracts and re-checks that segment only; other numbers keep their results |
| `claim` | `request_claim_search` | Checks one number again with web search allowed; the check stays in review |

## 1. Preparing

| Input | What happens |
|---|---|
| Video, audio | Download the original from Storage; `ffprobe` (must have audio, at most 2 hours); extract 16 kHz mono FLAC; make a web copy (H.264/AAC MP4 at most 1280 px wide, or AAC M4A) and a poster; compute a waveform; write the `media` row. Then transcribe (below). |
| Document | PDF (text per page), DOCX, HTML or plain text read into paragraphs. A PDF without a text layer fails with `no_text`. |
| Link | Video platforms (YouTube, TikTok, Instagram, X) are refused with `link_video`. Otherwise the page is downloaded safely ([security.md](security.md#fetching-from-the-internet-ssrf)) and read: HTML pages through a readability-style main-content pick that drops link-heavy blocks such as menus; PDFs and DOCX by type. The page title replaces a title that was just the URL. |
| Text | Split into paragraphs. |

Each paragraph or transcript line becomes a `segments` row.

### Transcription

1. **Caption track first.** If the clip carries a text caption track (`mov_text`, `subrip`, `webvtt`, `ass`), the worker extracts it and uses the cues as segments. No speech-to-text is called.
2. **Otherwise Gemini 3.5 Transcribe** (`pipeline/transcribe.py`), verbatim, with word timings and speaker labels. The audio is sent as mono 16 kHz Opus through the Gemini Files API (deleted after the call). The model detects the language itself (MSA, Gulf, Levantine, code-switching); Egyptian Arabic is passed as an `ar-EG` hint. Recordings longer than 10 minutes are cut into parts at a pause (ffmpeg `silencedetect`, within 60 seconds before each cut) and the parts' timings shifted back; a 25-minute request was dropped by the server. A part is retried twice after a dropped connection, a server error or a rate limit; a rejected request fails the check with `speech_unavailable`. Word times keep reading order and stay inside their part. Speaker labels are per part, so on recordings over 10 minutes the same voice can get a different label after a cut. Words become sentence-sized lines: a line ends at a sentence mark after 4 seconds, at a comma after 20, at a change of speaker, or at a pause of 1.2 seconds. Speakers are labelled S1, S2, … when there is more than one voice.

If the key is missing or the API rejects the request, the check fails with `speech_unavailable`; rate limits are retried.

## 2. Extracting numbers

`pipeline/extract.py`:

- **Code picks the lines first:** only segments with a number (digits, Arabic or English number words, fractions such as «نصف»), the segment before each (where what is measured is often said) and the first two segments (where an article names the authority, the emirate and the period) go to the model.
- Segments go to the model in batches of 60, each line prefixed with its index, time or page, and speaker. The system prompt lists the catalog's indicators and entities so the model can return their slugs.
- For each number the model returns the exact span, entity, indicator, value, scale, unit, decimals, qualifier, period, geography, breakdown, claim type, attribution, and whether it is checkable (forecasts and opinions are not).
- **Code anchors the span.** The span must exist verbatim (after normalization) in its segment, or another segment of the batch; otherwise the claim is dropped.
- **Escalation:** segments where a span wasn't found, or where a statistic-looking number (a percent, a scale word, decimals, or 1,000 and more that isn't a year) has no claim, are reread by the escalation model, alone. Its claims replace the cheap ones for those segments. An answer that doesn't parse sends the whole batch to the escalation model.
- **Code re-reads the number** from the span (digits, or spoken Arabic numbers in transcripts), but only a number that agrees with the model's reading (the same digits, or within a factor of two): a year in digits next to a spoken amount («اثنين تريليون ... 2026») is not the claim's number. A compound number («61 ألفاً و578») keeps the model's full reading when its remainder is in the text. Otherwise the model's reading is the fallback.
- Timings for media come from word timings, or are estimated from the span's position in the line.
- Indicators and entities are resolved by slug, then by trigram similarity on names and aliases (≥ 0.35).

Claims are stored in reading order. Uncheckable claims are kept and shown separately with their reason.

## 3. Checking each number

For every checkable claim (four at a time, numbers mapped to a known indicator first):

### Registry lookup and comparison

Candidates are approved figures for the claim's indicator, from the shared registry and the newsroom's private sources. `pipeline/compare.py` applies fixed rules, no model involved:

- **Measure:** a growth claim is only compared with growth figures, a share with shares, and so on.
- **Tolerance:** the range of official values consistent with how both numbers were rounded (half a unit of the last digit, at the stated scale). "About" (نحو, حوالي) widens it to at least ±3%. "More than", "at least", "less than" and "up to" become one-sided bounds.
- **Period:** equal (±3 days), wider, narrower, overlapping, disjoint, or unspecified.
- **Scope:** geography and breakdown must match. Breakdowns are compared whatever their language or wording ("China" and «الصين», "Emiratis" and «المواطنين»; `compare.BREAKDOWN_GROUPS`), but a group never matches its negation («غير المواطنين») or a total.
- **Unit:** percent, currency (AED, USD, …) or count must agree.

| Verdict | Rule |
|---|---|
| `match` | The value is within tolerance for the same period, scope and unit |
| `context` | The value is within tolerance, but for a different period, scope or unit |
| `differs` | An official figure exists for the same period and scope, and the value is outside tolerance |
| `none` | No figure confirms or contradicts it (the closest figure, if any, is shown for context) |

A claim without a period is read against the latest current figure for its scope; if its number is instead the official figure for an earlier period, the verdict is `context` (period), since the claim most likely cites that figure as if it were current. `differing_fields` lists what differs (`value`, `period`, `scope`, `unit`).

### Discovery (web search on official domains)

When the registry has no answer, discovery (`pipeline/discovery.py`, task `discover_source`) runs in two steps:

1. **Search.** Code writes the question: the statistic, the place and the period, with a `site:` filter for the four best-ranked producers and the two best relays (tier 3: WAM, the emirate's media office); the relays are always on the allowlist. Sources are ranked by entity match, topic, emirate or federal level, then tier. Flash-Lite runs it with Google Search grounding. Only the pages the search really returned (resolved from Google's redirect links) are kept, filtered to `allowed_domains` (up to 60 domains of active sources), without bare home pages, at most three. The question asks for the figure with citations, not for links: asked for links only, the model answers from memory without searching. A call that didn't search is asked once more.
2. **Read.** Code downloads each candidate itself (re-checking the allowlist after redirects) and extracts its text. A short document is read whole; a long one keeps its pages or paragraphs that mention the indicator, the claim's numbers or the period's years (up to 40,000 characters). Flash-Lite returns the figure and a verbatim quote; when its figure disagrees with the claim by more than 2% (which would make the claim `differs`), Flash reads the same passages again, since the cheap model sometimes takes a related number from the page. Code accepts the figure only if the quote and value are really in the downloaded copy; a quote copied imperfectly is replaced by the document's own sentence that holds the value and most of the quote's words. WAM articles (rendered in the browser) are read through WAM's article API. Some producers block automated downloads (FCSC, Dubai DET and the Central Bank answer 403; ADREC's certificate had expired in October 2026): their figures are found through the relays that republish them (WAM, the media offices). Only then is the copy stored as a document version (`fetched_via = discovery`).

The figure is saved as **pending**: it is evidence for this check, and joins the shared registry only after a curator approves it.

Searches are budgeted: at most `DISCOVERY_PER_CHECK` numbers per check (default 8) trigger a search. The rest get `comparison.search = "skipped"`; the check page shows "Not searched yet" with a **Search official sources** button that calls `request_claim_search` (job mode `claim`).

### Verbatim evidence check

Before any figure is shown as evidence, `evidence.check_evidence` re-verifies it against the stored document version: a spreadsheet cell must hold the value (at its stated scale or in base units); a PDF table quote must appear on its page; a text quote must appear in the document text. A figure that fails is dropped, and the claim becomes `none`.

### Verifier

For `match`, `context` and `differs` with evidence, a second model call (`verify_claim`) independently checks that the evidence measures the same thing as the claim. It returns `agrees`, a note in Arabic and English, and a confidence. It can't change the verdict. It judges the claim's own words (the span), not the extracted fields. A `differs` verdict is verified by the escalation model directly (a wrong "your number is wrong" is the costliest mistake); for the others, when the cheap verifier objects or has low confidence, the escalation model reads the same evidence and its reading stands. If it disagrees or has low confidence, the result gets `needs_review = true`, and `approve_matches` leaves that number for a person.

### Suggested wording

- `match`: a template sentence from the evidence: indicator, place, value, period label, and the publisher ("…، وفق …").
- `context`, `differs`: the model rewrites the sentence holding the claim (`suggest_wording`) with the official value. Code checks every number in the rewrite: it must be the evidence value, a year, a number from the period label, or a number from the original sentence that isn't the claim's own. Otherwise the template is used.

Values are written from the figure with normalized units (`%`, AED, USD, or the counted thing). Period labels are generated from the dates (e.g. «الربع الثالث 2025», «يناير–أغسطس 2025»).

### Chain

`claim_results.chain` lists the nodes: the official document (publisher, value, period, tier) → a relay named in the content (e.g. "قالت مصادر رسمية") → this content (value, period, what changed). The chain is **connected** only when there is verified evidence from a tier 1 or tier 2 source; otherwise it is **broken**.

`earlier_figures` lists superseded figures for the same indicator, period and scope (the revision history).

## 4. Finishing

`_finish` sets `stage = done`, `status = awaiting_review`, recomputes the counters, creates a `check_ready` alert for the creator, and queues a Telegram summary for checks that came from Telegram.

## Failures

`CheckError` codes are stored in `checks.error` (as `code` or `code: detail`) and shown translated on the check page:

| Code | Meaning |
|---|---|
| `file_missing` | The uploaded file isn't in Storage |
| `no_audio` | The file has no audio track |
| `too_long` | Longer than two hours |
| `speech_unavailable` | Speech-to-text isn't configured or was refused |
| `no_speech` | No speech recognized |
| `no_text` | No readable text |
| `link_video` | A video-platform link (download and upload the clip instead) |
| `link_failed` | The link couldn't be fetched |
| `link_unsupported` | The link's content type isn't supported |

Other errors retry (up to 3 attempts); after the last one the check fails with `internal: <ErrorType>`. **Try again** on a failed check calls `request_recheck`; a check that failed before it had any text runs the full pipeline again.

## Cancellation

Archiving a processing check cancels it. The worker checks the status before each stage (`_set_stage`), before each number, and when finishing, and stops without overwriting the archived status.

## Cost

Every model call is recorded in `usage_events` with the check id. Typical costs observed in testing: extraction $0.10–0.30 per check, verifier about $0.01 per number, discovery $0.05–0.20 per searched number.
