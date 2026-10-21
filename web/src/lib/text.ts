// Mirrors public.normalize_ar and the worker's isnad_worker.text.normalize (keep in sync).
const LETTERS: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه" };
const DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeAr(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input.normalize("NFKC")) {
    if (ch === "ـ") continue;
    const code = ch.charCodeAt(0);
    if ((code >= 0x064b && code <= 0x065f) || code === 0x0670) continue;
    const d = DIGITS.indexOf(ch);
    if (d >= 0) {
      out += String(d);
      continue;
    }
    const p = PERSIAN.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    if (ch === "٫") out += ".";
    else if (ch === "٬") out += ",";
    else if (ch === "٪") out += "%";
    else out += LETTERS[ch] ?? ch;
  }
  return out.toLowerCase();
}

/** Escape a user query for use inside a PostgREST ilike pattern. */
export function likePattern(query: string): string {
  return `%${normalizeAr(query).replace(/[%_,()\\]/g, " ").trim()}%`;
}
