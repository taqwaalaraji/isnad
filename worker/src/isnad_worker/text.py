"""Arabic text normalization and number parsing.

`normalize` must stay in sync with the SQL function `public.normalize_ar`.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

# ─── Normalization ────────────────────────────────────────────────────────────

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬٪", "01234567890123456789.,%")
_LETTERS = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ـ": None})
_DIACRITICS = re.compile("[ً-ٰٟ]")
_SPACES = re.compile(r"\s+")
# Typographic variants that should not break a verbatim match.
_PUNCT = str.maketrans(
    {
        **dict.fromkeys(["\u00ab", "\u00bb", "\u201c", "\u201d", "\u201e"], '"'),
        **dict.fromkeys(["\u2018", "\u2019"], "'"),
        **dict.fromkeys(["\u2013", "\u2014", "\u2212", "\u2010"], "-"),
        "\u00a0": " ",
        # Invisible direction marks and joiners
        **dict.fromkeys(["\u200b", "\u200c", "\u200d", "\u200e", "\u200f", "\ufeff"], None),
        "\u060c": ",",
        "\u061b": ";",
        "\u061f": "?",
    }
)


def western_digits(text: str) -> str:
    """Arabic-Indic and Persian digits and separators → ASCII, leaving letters alone."""
    return text.translate(_DIGITS)


def normalize(text: str | None) -> str:
    """Matching form: unified letters and digits, no diacritics or tatweel, lowercase."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text)
    text = text.translate(_DIGITS).translate(_LETTERS)
    text = _DIACRITICS.sub("", text)
    return text.lower()


def normalize_for_match(text: str | None) -> str:
    """`normalize`, plus unified punctuation and collapsed whitespace, for verbatim checks."""
    text = normalize(text).translate(_PUNCT)
    return _SPACES.sub(" ", text).strip()


def contains_verbatim(haystack: str | None, needle: str | None) -> bool:
    """True when `needle` appears in `haystack` after normalization (the quote check)."""
    n = normalize_for_match(needle)
    if not n:
        return False
    return n in normalize_for_match(haystack)


# ─── PDF text in visual order ─────────────────────────────────────────────────
# PDF text layers store Arabic in visual (left-to-right) order: words come out reversed on each
# line, two-column pages share a line separated by wide gaps, and the lam-alef ligature (لا, لأ)
# is often split into "ال". These readings put such text back in logical order for quote checks.

_COLUMN_GAP = re.compile(r" {3,}|\t+")
_ARABIC_LETTER = re.compile(r"[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff]")
_LATIN_LETTER = re.compile(r"[A-Za-z]")


def is_rtl(text: str) -> bool:
    """Mostly Arabic script (more Arabic letters than Latin ones)."""
    return len(_ARABIC_LETTER.findall(text)) > len(_LATIN_LETTER.findall(text))


def _logical_segments(line: str) -> list[str]:
    """A visual-order line → its column segments in reading order, each in logical word order."""
    segments = [s.strip() for s in _COLUMN_GAP.split(line) if s.strip()]
    if not segments or not is_rtl(line):
        return segments
    return [" ".join(reversed(seg.split())) if is_rtl(seg) else seg for seg in reversed(segments)]


def pdf_readings(page_text: str) -> list[str]:
    """Candidate logical-order readings of one PDF page: as extracted, line by line, by column."""
    lines = [_logical_segments(line) for line in page_text.splitlines()]
    readings = [page_text, " ".join(" ".join(segs) for segs in lines if segs)]
    columns = max((len(segs) for segs in lines), default=0)
    if columns > 1:
        by_column = [" ".join(segs[c] for segs in lines if len(segs) > c) for c in range(columns)]
        readings.append(" ".join(by_column))
    return readings


_PDF_PUNCT = re.compile(r"[.,;:!?%\"'()\[\]«»\-]")
_MIN_PDF_MATCH = 6


def fold_pdf(text: str) -> str:
    """A match key that survives PDF text layers.

    Infographics space letters apart ("ا لسكا ن"), the lam-alef ligature comes out as "ال" in
    either order, and bidi reordering moves % signs, decimal points and full stops. Dropping
    alefs, spaces and punctuation leaves the letter and digit sequence, which still has to match
    in order. Used only as the fallback check for PDFs; the figure's value is checked separately.
    """
    folded = _PDF_PUNCT.sub("", normalize_for_match(text))
    return re.sub(r"[\sا]+", "", folded)


def contains_in_pdf_page(page_text: str, needle: str, *, min_length: int = _MIN_PDF_MATCH) -> bool:
    folded = fold_pdf(needle)
    if len(folded) < min_length:
        return False
    return any(folded in fold_pdf(r) for r in pdf_readings(page_text))


def find_span(haystack: str, needle: str) -> tuple[int, int] | None:
    """Locate `needle` in `haystack` tolerating normalization differences.

    Returns character offsets into the original `haystack`, or None.
    """
    if not needle:
        return None
    direct = haystack.find(needle)
    if direct >= 0:
        return direct, direct + len(needle)

    # Build the normalized haystack with a map back to original offsets.
    norm_chars: list[str] = []
    index_map: list[int] = []
    previous_space = False
    for i, ch in enumerate(haystack):
        piece = normalize(ch).translate(_PUNCT)
        for c in piece:
            if c.isspace():
                if previous_space:
                    continue
                c = " "
                previous_space = True
            else:
                previous_space = False
            norm_chars.append(c)
            index_map.append(i)
    norm_haystack = "".join(norm_chars)
    norm_needle = normalize_for_match(needle)
    pos = norm_haystack.find(norm_needle)
    if pos < 0 or not norm_needle:
        return None
    start = index_map[pos]
    end = index_map[pos + len(norm_needle) - 1] + 1
    return start, end


# ─── Numbers ──────────────────────────────────────────────────────────────────

SCALES: dict[str, Decimal] = {
    "one": Decimal(1),
    "thousand": Decimal(1_000),
    "million": Decimal(1_000_000),
    "billion": Decimal(1_000_000_000),
    "trillion": Decimal(1_000_000_000_000),
}

_SCALE_WORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^(تريليون|ترليون|trillion|tn)"), "trillion"),
    (re.compile(r"^(مليار|مليارات|ملياري|بليون|billion|bn|b\b)"), "billion"),
    (re.compile(r"^(مليون|ملايين|مليوني|million|mn|m\b|mln)"), "million"),
    (re.compile(r"^(الف|الاف|الفين|الفان|thousand|k\b)"), "thousand"),
]

_PERCENT = re.compile(r"^(%|بالمئه|بالمائه|في المئه|في المائه|بالميه|percent|per cent|pct)")
_NUMERIC = re.compile(r"(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d+))?")


@dataclass(frozen=True)
class ParsedNumber:
    value: Decimal  # as written, at its scale (5.1 for "5.1 مليون")
    scale: str  # one | thousand | million | billion | trillion
    decimals: int  # digits after the decimal point, as written
    is_percent: bool
    text: str  # the matched text, in the original string
    start: int
    end: int

    @property
    def base_value(self) -> Decimal:
        return self.value * SCALES[self.scale]


def to_decimal(value: str | float | Decimal | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _scale_after(text: str) -> tuple[str, int]:
    """Scale word right after a number, and how many characters it spans."""
    stripped = text.lstrip()
    skipped = len(text) - len(stripped)
    norm = normalize(stripped)
    for pattern, scale in _SCALE_WORDS:
        m = pattern.match(norm)
        if m:
            return scale, skipped + len(m.group(0))
    return "one", 0


def _percent_after(text: str) -> int:
    stripped = text.lstrip()
    skipped = len(text) - len(stripped)
    m = _PERCENT.match(normalize(stripped))
    return skipped + len(m.group(0)) if m else 0


def find_numbers(text: str) -> list[ParsedNumber]:
    """Every digit-written number in the text, with scale words and percent signs attached."""
    western = western_digits(text)
    results: list[ParsedNumber] = []
    for m in _NUMERIC.finditer(western):
        whole, frac = m.group(1), m.group(2)
        # "1,234" is thousands; "5,1" (comma + not 3 digits) is a decimal comma.
        if (
            frac is not None
            and western[m.start(2) - 1] == ","
            and len(frac) == 3
            and "," not in whole
        ):
            whole, frac = whole + frac, None
        digits = whole.replace(",", "")
        number = Decimal(digits + ("." + frac if frac else ""))
        decimals = len(frac) if frac else 0
        end = m.end()
        pct = _percent_after(western[end:])
        if pct:
            results.append(
                ParsedNumber(
                    number, "one", decimals, True, text[m.start() : end + pct], m.start(), end + pct
                )
            )
            continue
        scale, used = _scale_after(western[end:])
        end += used
        results.append(
            ParsedNumber(number, scale, decimals, False, text[m.start() : end], m.start(), end)
        )
    return results


# Spoken Arabic numbers (from transcripts): "خمسة ملايين", "اثنا عشر بالمئة", "خمسة فاصلة واحد".
_UNITS = {
    "صفر": 0,
    "واحد": 1,
    "واحده": 1,
    "احد": 1,
    "اثنان": 2,
    "اثنين": 2,
    "اثنتان": 2,
    "اثنتين": 2,
    "اثنا": 2,
    "اثني": 2,
    "ثلاث": 3,
    "ثلاثه": 3,
    "اربع": 4,
    "اربعه": 4,
    "خمس": 5,
    "خمسه": 5,
    "ست": 6,
    "سته": 6,
    "سبع": 7,
    "سبعه": 7,
    "ثمان": 8,
    "ثماني": 8,
    "ثمانيه": 8,
    "تسع": 9,
    "تسعه": 9,
}
_TENS = {
    "عشر": 10,
    "عشره": 10,
    "عشرون": 20,
    "عشرين": 20,
    "ثلاثون": 30,
    "ثلاثين": 30,
    "اربعون": 40,
    "اربعين": 40,
    "خمسون": 50,
    "خمسين": 50,
    "ستون": 60,
    "ستين": 60,
    "سبعون": 70,
    "سبعين": 70,
    "ثمانون": 80,
    "ثمانين": 80,
    "تسعون": 90,
    "تسعين": 90,
}
_HUNDREDS = {
    "مئه": 100,
    "مائه": 100,
    "ميه": 100,
    "مئتان": 200,
    "مئتين": 200,
    "مائتان": 200,
    "مائتين": 200,
    "ميتين": 200,
    "ثلاثمئه": 300,
    "ثلاثمائه": 300,
    "اربعمئه": 400,
    "اربعمائه": 400,
    "خمسمئه": 500,
    "خمسمائه": 500,
    "ستمئه": 600,
    "ستمائه": 600,
    "سبعمئه": 700,
    "سبعمائه": 700,
    "ثمانمئه": 800,
    "ثمانمائه": 800,
    "تسعمئه": 900,
    "تسعمائه": 900,
}
_BIG = {
    "الف": 1_000,
    "الاف": 1_000,
    "الفان": 2_000,
    "الفين": 2_000,
    "مليون": 1_000_000,
    "ملايين": 1_000_000,
    "مليونان": 2_000_000,
    "مليونين": 2_000_000,
    "مليار": 1_000_000_000,
    "مليارات": 1_000_000_000,
    "ملياران": 2_000_000_000,
    "مليارين": 2_000_000_000,
}
# The unit each scale word counts in (dual forms like "مليونين" still count in millions).
_BIG_BASE = {
    w: (1_000 if v < 1_000_000 else 1_000_000 if v < 1_000_000_000 else 1_000_000_000)
    for w, v in _BIG.items()
}
_DECIMAL_WORDS = {"فاصله", "فاصل", "point"}


_NUMBER_WORDS = (
    set(_UNITS)
    | set(_TENS)
    | set(_HUNDREDS)
    | set(_BIG)
    | {"نصف", "ربع", "ثلث", "ضعف", "اضعاف", "بالمئه", "بالمائه"}
    | {"hundred", "thousand", "million", "billion", "trillion", "percent", "half", "double"}
)
_ANY_DIGIT = re.compile(r"\d")


def has_number(text: str) -> bool:
    """Whether the text holds a number, in digits or in words (so it may hold a claim)."""
    if _ANY_DIGIT.search(western_digits(text)):
        return True
    for token in normalize(text).lower().split():
        token = token.strip(".,،؛:!?؟()\"'")
        if token in _NUMBER_WORDS or (token[:1] in "وبل" and token[1:] in _NUMBER_WORDS):
            return True
    return False


def parse_spoken_number(phrase: str) -> Decimal | None:
    """Value of an Arabic number written in words, or None if it isn't one.

    Handles units, teens, tens, hundreds, thousands/millions/billions, the conjunction و,
    and spoken decimals ("خمسة فاصلة واحد" → 5.1). Percent words are ignored here.
    """
    tokens = [t for t in re.split(r"\s+", normalize(phrase)) if t]
    if not tokens:
        return None
    words: list[str] = []
    for t in tokens:
        if (
            t.startswith("و")
            and len(t) > 2
            and (t[1:] in _UNITS or t[1:] in _TENS or t[1:] in _HUNDREDS or t[1:] in _BIG)
        ):
            t = t[1:]
        if t in ("بالمئه", "بالمائه", "في", "المئه", "المائه", "بالميه", "%"):
            continue
        words.append(t)

    if any(w in _DECIMAL_WORDS for w in words):
        idx = next(i for i, w in enumerate(words) if w in _DECIMAL_WORDS)
        whole = parse_spoken_number(" ".join(words[:idx])) if idx else Decimal(0)
        frac_words = words[idx + 1 :]
        scale_word = None
        if frac_words and frac_words[-1] in _BIG:
            scale_word = frac_words.pop()
        frac = parse_spoken_number(" ".join(frac_words)) if frac_words else None
        if whole is None or frac is None:
            return None
        value = whole + Decimal("0." + str(int(frac)))
        if scale_word:
            value *= _BIG_BASE[scale_word]
        return value

    total = 0
    current = 0
    matched = False
    i = 0
    while i < len(words):
        w = words[i]
        if w in _UNITS:
            # Teens: "اثنا عشر", "ثلاثة عشر"
            if i + 1 < len(words) and words[i + 1] in ("عشر", "عشره"):
                current += _UNITS[w] + 10
                i += 2
                matched = True
                continue
            current += _UNITS[w]
        elif w in _TENS:
            current += _TENS[w]
        elif w in _HUNDREDS:
            current = (
                (current or 1) * _HUNDREDS[w] if _HUNDREDS[w] == 100 else current + _HUNDREDS[w]
            )
        elif w in _BIG:
            multiplier = _BIG[w]
            if w in ("الفان", "الفين", "مليونان", "مليونين", "ملياران", "مليارين"):
                total += multiplier
            else:
                total += (current or 1) * multiplier
            current = 0
        else:
            return None
        matched = True
        i += 1
    if not matched:
        return None
    return Decimal(total + current)


def decimals_of(value: Decimal) -> int:
    exponent = value.normalize().as_tuple().exponent
    return max(0, -exponent) if isinstance(exponent, int) else 0


def format_number(value: Decimal | float, decimals: int | None = None) -> str:
    """Western digits with thousands separators, keeping the given precision."""
    d = Decimal(str(value))
    places = decimals if decimals is not None else decimals_of(d)
    return f"{d:,.{places}f}"


# ─── Units and periods ───────────────────────────────────────────────────────

_UNIT_ALIASES = {
    "%": "%",
    "percent": "%",
    "percentage": "%",
    "pct": "%",
    "بالمئة": "%",
    "بالمائة": "%",
    "aed": "AED",
    "dirham": "AED",
    "dirhams": "AED",
    "درهم": "AED",
    "usd": "USD",
    "dollar": "USD",
    "dollars": "USD",
    "us dollar": "USD",
    "دولار": "USD",
}


def normalize_unit(unit: str | None) -> str:
    """One spelling per unit: '%', ISO currency codes, otherwise the counted thing in singular English."""
    u = re.sub(r"\s*\(.*?\)\s*", " ", (unit or "").strip()).strip()
    key = u.lower()
    if key in _UNIT_ALIASES:
        return _UNIT_ALIASES[key]
    if key.endswith("ies") and len(key) > 4:
        return key[:-3] + "y"
    if key.endswith("s") and not key.endswith("ss") and len(key) > 3:
        key = key[:-1]
    return {"people": "person", "persons": "person", "resident": "person"}.get(key, key)


_MONTHS_AR = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
]
_MONTHS_EN = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]
_QUARTERS_AR = ["الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"]
_HALVES_AR = ["النصف الأول", "النصف الثاني"]


def period_label(start: date | None, end: date | None, arabic: bool = True) -> str:
    """A readable label for a reporting period: a year, a half, a quarter, a month, or a month range."""
    if not start or not end:
        return ""
    months = _MONTHS_AR if arabic else _MONTHS_EN
    full_month_end = (end + timedelta(days=1)).day == 1
    if start.day != 1 or not full_month_end:
        return f"{start.isoformat()} – {end.isoformat()}"
    span = (end.year - start.year) * 12 + end.month - start.month + 1
    if start.year == end.year:
        year = start.year
        if span == 12:
            return str(year)
        if span == 6 and start.month in (1, 7):
            half = 0 if start.month == 1 else 1
            return f"{_HALVES_AR[half]} {year}" if arabic else f"H{half + 1} {year}"
        if span == 3 and start.month in (1, 4, 7, 10):
            quarter = (start.month - 1) // 3
            return f"{_QUARTERS_AR[quarter]} {year}" if arabic else f"Q{quarter + 1} {year}"
        if span == 1:
            return f"{months[start.month - 1]} {year}"
        return f"{months[start.month - 1]}–{months[end.month - 1]} {year}"
    return f"{months[start.month - 1]} {start.year} – {months[end.month - 1]} {end.year}"
