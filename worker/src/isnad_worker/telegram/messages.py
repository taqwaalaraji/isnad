"""What the bot says, in Arabic and English, and the formatting of summaries and progress.

Texts use Telegram's HTML parse mode, so anything taken from user content or the database is
escaped here. Wording follows the web app's dictionary (verdict names, stages, failures).
"""

from __future__ import annotations

from html import escape
from urllib.parse import urlparse

# Bot API limit for files a bot can download.
MAX_FILE_BYTES = 20 * 1024 * 1024

VERDICT_MARK = {"match": "🟢", "context": "🟠", "differs": "🔴", "none": "⚪"}
VERDICT_ORDER = ("match", "differs", "context", "none")

TEXTS: dict[str, dict[str, str]] = {
    "ar": {
        "welcome": "مرحباً {name}، رُبط حسابك بـ{newsroom}.\nأرسل نصاً أو رابطاً أو تسجيلاً صوتياً أو مقطعاً قصيراً، وسأتحقق من الأرقام فيه.",
        "size_hint": "للملفات الأكبر من 20 ميغابايت استخدم التطبيق، أو أرسل رابط المادة.",
        "not_linked": "هذا البوت لأعضاء غرف الأخبار في إسناد فقط. اطلب دعوة من مدير غرفتك، ثم اربط حسابك من الإعدادات ← ربط تيليجرام.",
        "link_invalid": "رابط الربط غير صالح أو انتهت صلاحيته. أنشئ رابطاً جديداً من الإعدادات ← ربط تيليجرام.",
        "link_taken": "حساب تيليجرام هذا مربوط بمستخدم آخر في إسناد. افصله أولاً من ذلك الحساب.",
        "no_newsroom": "لا توجد غرفة أخبار فعّالة لحسابك. تواصل مع مدير غرفتك.",
        "telegram_disabled": "استقبال المواد عبر تيليجرام غير مفعّل في {newsroom}.",
        "limit_reached": "بلغت غرفتك الحد الشهري للتحققات.",
        "rate_limited": "أرسلت مواد كثيرة خلال دقائق. انتظر قليلاً ثم أعد المحاولة.",
        "too_large": "الملف أكبر من 20 ميغابايت. استخدم التطبيق أو أرسل رابط المادة.",
        "unsupported": "لا أستطيع التحقق من هذا النوع بعد. أرسل نصاً أو رابطاً أو تسجيلاً صوتياً أو مقطعاً أو ملف PDF/Word.",
        "text_short": "النص قصير جداً. أرسل فقرة فيها أرقام، أو رابط المادة.",
        "received": "استلمت {what}. جارٍ التحقق؛ سأرسل الملخّص هنا عند الانتهاء.",
        "what_text": "النص",
        "what_link": "الرابط",
        "what_audio": "التسجيل",
        "what_video": "المقطع",
        "what_document": "الملف",
        "stage_queued": "في الانتظار…",
        "stage_preparing": "جارٍ تحضير المحتوى…",
        "stage_transcribing": "جارٍ تفريغ الصوت…",
        "stage_extracting": "جارٍ استخراج الأرقام…",
        "stage_checking": "جارٍ التحقق: {checked} من {total} أرقام",
        "done_line": "✓ اكتمل التحقق",
        "failed_line": "تعذّر إكمال التحقق.",
        "summary_title": "اكتمل التحقق · {title}",
        "summary_count": "{n} أرقام في المحتوى:",
        "summary_none": "لم أجد أرقاماً يمكن التحقق منها في هذا المحتوى.",
        "summary_more": "و{n} أرقام أخرى في التقرير.",
        "suggested": "الصياغة المقترحة",
        "open_report": "فتح التقرير",
        "send_editor": "إرسال إلى المحرر",
        "report_link": "التقرير: {url}",
        "sent_editor": "أُرسل التحقق إلى المحررين للمراجعة.",
        "action_failed": "تعذّر تنفيذ الطلب: {reason}",
        "help": "<b>إسناد</b> يعيد كل رقم في المحتوى إلى مصدره الرسمي.\n\nأرسل:\n• نص خبر أو تصريح\n• رابط مادة منشورة\n• تسجيلاً صوتياً أو مقطعاً (حتى 20 ميغابايت)\n• ملف PDF أو Word\n\nالأوامر:\n/checks آخر تحققاتك\n/alerts التنبيهات\n/desk غرفة الأخبار والقسم\n/unlink فصل الحساب\n/help هذه الرسالة",
        "checks_title": "آخر تحققاتك:",
        "checks_empty": "لا تحققات بعد. أرسل نصاً أو رابطاً للبدء.",
        "alerts_title": "التنبيهات غير المقروءة:",
        "alerts_empty": "لا تنبيهات جديدة.",
        "desk": "غرفة الأخبار: {newsroom}\nالقسم: {desk}\nالدور: {role}",
        "desk_none": "بلا قسم",
        "desk_choose": "تصل موادك إلى {newsroom}. اختر غرفة أخرى:",
        "desk_switched": "ستصل موادك الآن إلى {newsroom}.",
        "unlinked": "فُصل حسابك. يمكنك ربطه من جديد من الإعدادات ← ربط تيليجرام.",
        "alert_open": "فتح",
        "role_journalist": "صحفي",
        "role_editor": "محرر",
        "role_admin": "مدير",
        "status_processing": "قيد المعالجة",
        "status_awaiting_review": "بانتظار المراجعة",
        "status_in_review": "قيد المراجعة",
        "status_escalated": "محال",
        "status_approved": "معتمد",
        "status_published": "منشور",
        "status_archived": "مؤرشف",
        "status_failed": "تعذّر",
        "verdict_match": "مطابق للمصدر",
        "verdict_context": "سياق مختلف",
        "verdict_differs": "مختلف عن المصدر",
        "verdict_none": "لم يُعثر على مصدر",
        "failure_file_missing": "لم نجد الملف المرفوع. أرسله مرة أخرى.",
        "failure_no_audio": "لا يحتوي الملف على مسار صوتي.",
        "failure_too_long": "المقطع أطول من الحد المسموح (ساعتان).",
        "failure_speech_unavailable": "خدمة تفريغ الصوت غير متاحة الآن. حاول لاحقاً أو أرسل النص مباشرة.",
        "failure_no_speech": "لم نتعرف على كلام في هذا المقطع.",
        "failure_no_text": "لم نجد نصاً يمكن قراءته في هذا المحتوى.",
        "failure_link_video": "روابط الفيديو غير مدعومة بعد. أرسل المقطع نفسه كملف.",
        "failure_link_failed": "تعذّر فتح الرابط. تأكد أنه متاح للعامة.",
        "failure_link_unsupported": "نوع المحتوى في هذا الرابط غير مدعوم.",
        "failure_generic": "حدث خطأ أثناء المعالجة. حاول مرة أخرى.",
        "alert_figure_revised": "تعديل رقم رسمي",
        "alert_new_release": "إصدار جديد",
        "alert_new_figure": "رقم جديد",
        "alert_review_requested": "طلب مراجعة",
        "alert_check_ready": "اكتمل التحقق",
        "alert_check_escalated": "إحالة",
        "cmd_checks": "آخر تحققاتك",
        "cmd_alerts": "التنبيهات",
        "cmd_desk": "غرفة الأخبار والقسم",
        "cmd_unlink": "فصل الحساب",
        "cmd_help": "طريقة الاستخدام",
    },
    "en": {
        "welcome": "Hi {name}, your account is now linked to {newsroom}.\nSend text, a link, a voice note or a short clip, and I'll check the numbers in it.",
        "size_hint": "For files over 20 MB use the web app, or send a link to the piece.",
        "not_linked": "This bot is for Isnad newsroom members only. Ask your newsroom admin for an invitation, then link your account from Settings → Link Telegram.",
        "link_invalid": "This link is invalid or has expired. Create a new one from Settings → Link Telegram.",
        "link_taken": "This Telegram account is linked to another Isnad user. Unlink it there first.",
        "no_newsroom": "Your account has no active newsroom. Contact your newsroom admin.",
        "telegram_disabled": "{newsroom} doesn't accept content through Telegram.",
        "limit_reached": "Your newsroom has reached its monthly check limit.",
        "rate_limited": "You've sent a lot in the last few minutes. Wait a little and try again.",
        "too_large": "The file is over 20 MB. Use the web app or send a link to the piece.",
        "unsupported": "I can't check this kind of message yet. Send text, a link, a voice note, a clip, or a PDF/Word file.",
        "text_short": "That text is too short. Send a paragraph with numbers, or a link to the piece.",
        "received": "Got {what}. Checking now; I'll send the summary here when it's done.",
        "what_text": "the text",
        "what_link": "the link",
        "what_audio": "the recording",
        "what_video": "the clip",
        "what_document": "the file",
        "stage_queued": "Queued…",
        "stage_preparing": "Preparing the content…",
        "stage_transcribing": "Transcribing…",
        "stage_extracting": "Finding the numbers…",
        "stage_checking": "Checking: {checked} of {total} numbers",
        "done_line": "✓ Check complete",
        "failed_line": "This check couldn't be completed.",
        "summary_title": "Check complete · {title}",
        "summary_count": "{n} numbers in the content:",
        "summary_none": "I found no checkable numbers in this content.",
        "summary_more": "and {n} more numbers in the report.",
        "suggested": "Suggested wording",
        "open_report": "Open report",
        "send_editor": "Send to editor",
        "report_link": "Report: {url}",
        "sent_editor": "The check was sent to the editors for review.",
        "action_failed": "That didn't work: {reason}",
        "help": "<b>Isnad</b> traces every number in media content back to its official source.\n\nSend:\n• the text of a story or statement\n• a link to a published piece\n• a voice note or clip (up to 20 MB)\n• a PDF or Word file\n\nCommands:\n/checks your recent checks\n/alerts alerts\n/desk newsroom and desk\n/unlink unlink your account\n/help this message",
        "checks_title": "Your recent checks:",
        "checks_empty": "No checks yet. Send text or a link to start.",
        "alerts_title": "Unread alerts:",
        "alerts_empty": "No new alerts.",
        "desk": "Newsroom: {newsroom}\nDesk: {desk}\nRole: {role}",
        "desk_none": "No desk",
        "desk_choose": "Your content goes to {newsroom}. Choose another newsroom:",
        "desk_switched": "Your content now goes to {newsroom}.",
        "unlinked": "Your account is unlinked. You can link it again from Settings → Link Telegram.",
        "alert_open": "Open",
        "role_journalist": "Journalist",
        "role_editor": "Editor",
        "role_admin": "Admin",
        "status_processing": "Processing",
        "status_awaiting_review": "Awaiting review",
        "status_in_review": "In review",
        "status_escalated": "Escalated",
        "status_approved": "Approved",
        "status_published": "Published",
        "status_archived": "Archived",
        "status_failed": "Failed",
        "verdict_match": "Matches source",
        "verdict_context": "Different context",
        "verdict_differs": "Differs from source",
        "verdict_none": "No source found",
        "failure_file_missing": "We couldn't find the uploaded file. Send it again.",
        "failure_no_audio": "The file has no audio track.",
        "failure_too_long": "The clip is longer than the limit (two hours).",
        "failure_speech_unavailable": "Transcription isn't available right now. Try later, or send the text instead.",
        "failure_no_speech": "We didn't recognise any speech in this clip.",
        "failure_no_text": "We couldn't find readable text in this content.",
        "failure_link_video": "Video links aren't supported yet. Send the clip itself as a file.",
        "failure_link_failed": "We couldn't open the link. Make sure it's publicly available.",
        "failure_link_unsupported": "The content type at this link isn't supported.",
        "failure_generic": "Something went wrong while processing. Try again.",
        "alert_figure_revised": "Official figure revised",
        "alert_new_release": "New release",
        "alert_new_figure": "New figure",
        "alert_review_requested": "Review requested",
        "alert_check_ready": "Check complete",
        "alert_check_escalated": "Escalated",
        "cmd_checks": "Your recent checks",
        "cmd_alerts": "Alerts",
        "cmd_desk": "Newsroom and desk",
        "cmd_unlink": "Unlink your account",
        "cmd_help": "How to use the bot",
    },
}

FAILURE_CODES = (
    "file_missing",
    "no_audio",
    "too_long",
    "speech_unavailable",
    "no_speech",
    "no_text",
    "link_video",
    "link_failed",
    "link_unsupported",
)

COMMANDS = ("checks", "alerts", "desk", "unlink", "help")


def lang(locale: str | None) -> str:
    return "en" if locale == "en" else "ar"


def t(locale: str | None, key: str, **values: object) -> str:
    text = TEXTS[lang(locale)].get(key) or TEXTS["ar"][key]
    return text.format(**values) if values else text


def command_list(locale: str) -> list[dict]:
    return [{"command": c, "description": t(locale, f"cmd_{c}")} for c in COMMANDS]


def failure(locale: str | None, error: str | None) -> str:
    code = next((c for c in FAILURE_CODES if (error or "").startswith(c)), "generic")
    return t(locale, f"failure_{code}")


def is_public_url(url: str) -> bool:
    """Telegram rejects buttons that point at local addresses."""
    host = (urlparse(url).hostname or "").lower()
    return (
        bool(host) and host not in ("localhost", "127.0.0.1", "::1") and not host.endswith(".local")
    )


def report_url(site_url: str, locale: str | None, check_id: str) -> str:
    return f"{site_url.rstrip('/')}/{lang(locale)}/checks/{check_id}"


def progress(locale: str | None, stage: str, progress_data: dict | None, what: str) -> str:
    data = progress_data or {}
    head = t(locale, "received", what=t(locale, f"what_{what}"))
    if stage == "checking" and data.get("claims_total"):
        line = t(
            locale,
            "stage_checking",
            checked=data.get("claims_checked", 0),
            total=data["claims_total"],
        )
    else:
        line = t(locale, f"stage_{stage}") if f"stage_{stage}" in TEXTS["ar"] else ""
    return f"{head}\n<i>{escape(line)}</i>" if line else head


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def summary(
    locale: str | None,
    *,
    title: str,
    counts: dict[str, int],
    claims: list[dict],
    max_claims: int = 8,
) -> str:
    """The result message: verdict counts, then each number with its verdict and the fix."""
    lines = [f"<b>{escape(t(locale, 'summary_title', title=_clip(title, 80)))}</b>"]
    total = sum(counts.get(v, 0) for v in VERDICT_ORDER)
    if not total:
        lines.append(t(locale, "summary_none"))
        return "\n".join(lines)
    lines.append(t(locale, "summary_count", n=total))
    for verdict in VERDICT_ORDER:
        if counts.get(verdict):
            lines.append(
                f"{VERDICT_MARK[verdict]} {counts[verdict]} {t(locale, f'verdict_{verdict}')}"
            )
    shown = claims[:max_claims]
    if shown:
        lines.append("")
    for claim in shown:
        verdict = claim.get("verdict") or "none"
        source = claim.get("source")
        line = f"{VERDICT_MARK[verdict]} «{escape(_clip(claim['span'], 140))}»"
        if source:
            line += f"\n    <i>{escape(_clip(source, 90))}</i>"
        if verdict in ("differs", "context") and claim.get("wording"):
            line += f"\n    ↳ {escape(_clip(claim['wording'], 220))}"
        lines.append(line)
    if len(claims) > max_claims:
        lines.append(t(locale, "summary_more", n=len(claims) - max_claims))
    return "\n".join(lines)
