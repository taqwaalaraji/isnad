/** Western digits, so a value can be found in Arabic-Indic text too. */
function westernDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10)).replace(/[\u066B]/g, ".").replace(/[\u066C]/g, ",");
}

/** The figure's number marked in its quote: a whole number only (never the "5" inside "19.59"). */
export function QuoteMark({ text, value }: { text: string; value?: string }) {
  if (!value) return <>{text}</>;
  const n = Number(value);
  const forms = new Set([value, String(n), n.toLocaleString("en-US", { maximumFractionDigits: 6 })]);
  const plain = westernDigits(text);
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?<![\\d.,])${escaped}(?![\\d]|[.,]\\d)`).exec(plain);
    if (match) {
      const i = match.index;
      return (
        <>
          {text.slice(0, i)}
          <mark className="num rounded-xs bg-highlight px-1 font-semibold text-text">{text.slice(i, i + form.length)}</mark>
          {text.slice(i + form.length)}
        </>
      );
    }
  }
  return <>{text}</>;
}
