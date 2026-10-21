# Guide for Curators and Platform Admins

Isnad staff run the shared registry and the platform from the **Isnad console** («منصة إسناد», `/console`). Curators (أمين السجل) look after sources and figures; platform admins (مشرف المنصة) also manage newsrooms and models. Staff never see newsroom content, only counts and costs.

## Official sources

**Official sources** («المصادر الرسمية»):

- The list shows each source's tier, health, last fetch, and document and figure counts, with filters and search.
- **Add source** («إضافة مصدر»): entity, Arabic and English names, tier, domains, access methods, topics, update frequency and the first document link. Isnad only fetches and searches on a source's domains, so check the site, its domains and its terms of use first. News agencies must be tier 3; a first document must be on the source's domains.
- Open a source to edit or pause it, or press **Fetch now** («اجلب الآن») to re-fetch its watched documents.

Tiers: 1 Origin (produces the statistic), 2 Issuer (publishes its own numbers), 3 Relay (relays others' numbers). See [overview.md](overview.md#source-tiers).

## Inbox

**Inbox** («صندوق الوارد»): **Upload file** («رفع ملف») adds an official document (PDF, Excel, CSV, Word or HTML) to a source, or add one by link. Isnad stores it as published with its fingerprint and extracts its figures. The list shows each document version's extraction status; **Retry extraction** («إعادة الاستخراج») is offered for failed documents and documents that produced no figures.

## Figure review

**Figure review** («مراجعة الأرقام») is the queue of pending figures, from document extraction and from searches made while checking.

For each figure you see the quote highlighted in its document (the passage, the PDF page or the spreadsheet cells around it) and its fields: indicator, value, scale, unit, period, geography, breakdown, measure.

| Key | Action |
|---|---|
| `j` / `k` | Next / previous figure |
| `a` | Approve («اعتماد») |
| `e` | Correct the fields, then **Save correction** («حفظ التصحيح») |
| `r` | Reject («رفض»), with an optional reason |

**Reject the whole file** («رفض الملف كاملاً») rejects every pending figure of a document. A figure needs an indicator before it can be approved. Correcting a value clears its "verified" mark.

Approving a figure makes it available to every newsroom. If it replaces an earlier figure for the same indicator, period and scope, the earlier one is kept as history, and newsrooms that published the old value get a revision alert.

## Catalog

**Catalog** («الفهرس»): topics, indicators (with aliases, unit kind and topic) and entities. Aliases help Isnad match the way journalists name things. **New indicator** («مؤشر جديد»), **New entity** («جهة جديدة»).

## Proposals

**Proposals** («الاقتراحات»):

- **Sources proposed by newsrooms**: **Accept** («قبول») makes the source shared and active for every newsroom; **Reject** («رفض») marks it rejected. Your note is saved with the decision.
- **Proposed indicators**: figures the extractor couldn't map to an existing indicator. Create the indicator and assign it, or dismiss the proposal.

## Newsrooms (platform admins)

**Newsrooms** («غرف الأخبار») lists every newsroom with members, checks this month, and model cost. Platform admins create a newsroom (name, slug, and the first admin, who gets an invitation), set its monthly check limit, and suspend or reactivate it. Curators see this page read-only.

## Quality and models

**Quality and models** («الجودة والنماذج»):

- **Model settings** per task (claim extraction, verification, source search, figure extraction, wording, Ask Isnad, briefs, transcription): model, thinking level, escalation model (asked again only when code checks reject the first answer), maximum output, and on/off for optional tasks. Only platform admins can change them; changes apply within a minute. Extraction and speech-to-text can't be switched off.
- **Evaluation runs**: **Run the test set** («تشغيل الاختبار») runs the labelled test claims through the pipeline and reports accuracy per verdict, rejected quotes, cost and time.

## System

**System** («النظام»): the job queue by status and kind, recent failures with their error, **Retry** («إعادة») or **Cancel** («إلغاء») a job, model usage and cost by task and day, and the worker's latest activity.
