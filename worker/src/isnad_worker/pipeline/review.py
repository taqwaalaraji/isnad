"""The second verification layer (an independent model check), the suggested wording, and the chain."""

from __future__ import annotations

import json
import logging
import re
from decimal import Decimal

from isnad_worker.ai import gateway
from isnad_worker.pipeline.models import VerifierResult, WordingResult
from isnad_worker.text import find_numbers, format_number

log = logging.getLogger("isnad.review")

SCALE_AR = {"thousand": "ألف", "million": "مليون", "billion": "مليار", "trillion": "تريليون"}
SCALE_EN = {
    "thousand": "thousand",
    "million": "million",
    "billion": "billion",
    "trillion": "trillion",
}
PLACE_AR = {
    "UAE": "الدولة",
    "Dubai": "دبي",
    "Abu Dhabi": "أبوظبي",
    "Sharjah": "الشارقة",
    "Ajman": "عجمان",
    "Ras Al Khaimah": "رأس الخيمة",
    "Fujairah": "الفجيرة",
    "Umm Al Quwain": "أم القيوين",
}
UNIT_AR = {
    "AED": "درهم",
    "USD": "دولار",
    "visitor": "زائر",
    "guest": "نزيل",
    "person": "نسمة",
    "passenger": "مسافر",
}


def figure_text(value: Decimal, scale: str, decimals: int, unit: str, arabic: bool = True) -> str:
    number = format_number(value, decimals)
    if unit == "%":
        return f"{number}%"
    words = (SCALE_AR if arabic else SCALE_EN).get(scale, "")
    unit_word = UNIT_AR.get(unit, "") if arabic else (unit if unit in ("AED", "USD") else "")
    return " ".join(p for p in (number, words, unit_word) if p)


def verifier(
    *,
    claim_sentence: str,
    claim_fields: dict,
    evidence: dict,
    verdict: str,
    differing_fields: list[str],
    ctx: gateway.CallContext,
) -> VerifierResult | None:
    content = json.dumps(
        {
            "claim": {"sentence": claim_sentence, **claim_fields},
            "evidence": evidence,
            "verdict": verdict,
            "differing_fields": differing_fields,
        },
        ensure_ascii=False,
        default=str,
        indent=1,
    )

    def ask(escalate: bool) -> VerifierResult:
        return gateway.parse(
            "verify_claim",
            system=gateway.prompt("verify_claim"),
            messages=[{"role": "user", "content": content}],
            output=VerifierResult,
            ctx=ctx,
            max_tokens=4000,
            escalate=escalate,
        )

    # "differs" tells a journalist their number is wrong: the stronger model checks it directly
    # (the cheap one agreed with mislabelled indicators). Matches are confirmed cheaply first.
    strong = gateway.can_escalate("verify_claim")
    try:
        result = ask(verdict == "differs" and strong)
    except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
        log.warning("verifier unavailable: %s", exc)
        return None
    if verdict == "differs" and strong:
        return result
    # An objection or a doubt goes to an editor, so the stronger model looks again first and its
    # reading stands.
    if (not result.agrees or result.confidence == "low") and strong:
        try:
            return ask(True)
        except (gateway.ModelRefusal, gateway.ModelOutputError) as exc:
            log.warning("stronger verifier unavailable: %s", exc)
    return result


def template_wording(
    *,
    arabic: bool,
    indicator: str,
    value_text: str,
    period: str,
    geography: str,
    source: str,
    claim_type: str,
) -> str:
    if arabic:
        place = PLACE_AR.get(geography, geography)
        if claim_type == "growth":
            return (
                f"سجّل {indicator} في {place} نمواً بنسبة {value_text} خلال {period}، وفق {source}."
            )
        return f"بلغ {indicator} في {place} {value_text} خلال {period}، وفق {source}."
    if claim_type == "growth":
        return f"{indicator} in {geography} grew {value_text} in {period}, according to {source}."
    return f"{indicator} in {geography} was {value_text} in {period}, according to {source}."


_SENTENCE_END = re.compile(r"[.!?؟\n]+(?=\s|$)")


def sentence_around(text: str, start: int | None, end: int | None) -> str:
    """The sentence holding the claim span, so a rewrite touches only that sentence."""
    if start is None or end is None or not text:
        return text
    begin = 0
    for m in _SENTENCE_END.finditer(text):
        if m.end() <= start:
            begin = m.end()
        elif m.start() >= end:
            return text[begin : m.end()].strip()
    return text[begin:].strip()


def _allowed_numbers(
    evidence_value: Decimal, decimals: int, period_label: str, sentence: str, span: str
) -> set[Decimal]:
    allowed = {
        evidence_value,
        evidence_value.quantize(Decimal(10) ** -decimals) if decimals else evidence_value,
    }
    for n in find_numbers(period_label):
        allowed.add(n.value)
    claimed = {n.value for n in find_numbers(span) if not 1900 <= n.value <= 2100}
    # Years, and other numbers of the sentence that aren't the claim's own (other claims), may stay.
    for n in find_numbers(sentence):
        if 1900 <= n.value <= 2100 or n.value not in claimed:
            allowed.add(n.value)
    return allowed


def polished_wording(
    *,
    sentence: str,
    span: str,
    template: str,
    evidence_value: Decimal,
    decimals: int,
    period_label: str,
    source_name: str,
    differing_fields: list[str],
    ctx: gateway.CallContext,
) -> str:
    """Rewrite the original sentence with the corrected number; fall back to the template if any
    number in the rewrite isn't backed by the evidence."""
    content = json.dumps(
        {
            "original_sentence": sentence,
            "evidence": {
                "value": format_number(evidence_value, decimals),
                "period": period_label,
                "source": source_name,
            },
            "fields_to_correct": differing_fields or ["none (add attribution only)"],
        },
        ensure_ascii=False,
    )
    try:
        result = gateway.parse(
            "suggest_wording",
            system=gateway.prompt("suggest_wording"),
            messages=[{"role": "user", "content": content}],
            output=WordingResult,
            ctx=ctx,
            max_tokens=2000,
        )
    except (gateway.ModelRefusal, gateway.ModelOutputError):
        return template
    wording = result.wording.strip()
    allowed = _allowed_numbers(evidence_value, decimals, period_label, sentence, span)
    tolerance = Decimal("0.5") * Decimal(10) ** -decimals
    numbers = find_numbers(wording)
    if not numbers:
        return template
    for n in numbers:
        if abs(n.value - evidence_value) <= tolerance or n.value in allowed:
            continue
        log.info("wording rejected: %s isn't backed by the evidence", n.text)
        return template
    return wording


def chain_nodes(
    *,
    verdict: str,
    evidence: dict | None,
    attribution: str | None,
    claim_label: str,
    claim_value_text: str,
    claim_period: str | None,
    differing_fields: list[str],
) -> list[dict]:
    """Official document → (relay named in the content) → this content."""
    nodes: list[dict] = []
    if evidence:
        nodes.append(
            {
                "kind": "official",
                "label_ar": evidence["source_name_ar"],
                "label_en": evidence["source_name_en"],
                "value": evidence["value_text"],
                "period": evidence["period_label"],
                "tier": evidence["tier"],
            }
        )
    else:
        nodes.append(
            {"kind": "unknown", "label_ar": "لا وثيقة أصلية", "label_en": "No original document"}
        )
    if attribution and (not evidence or evidence["source_name_ar"] not in attribution):
        nodes.append({"kind": "relay", "label_ar": attribution, "label_en": attribution})
    nodes.append(
        {
            "kind": "content",
            "label_ar": claim_label,
            "label_en": claim_label,
            "value": claim_value_text,
            "period": claim_period,
            "changes": differing_fields,
        }
    )
    return nodes
