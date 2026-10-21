import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import type { Translate } from "@/lib/i18n/translate";

import type { FigureExcerpt } from "./types";

// The excerpt is drawn as paper (white in both themes), so the mark uses fixed light colours.
const MARK = "rounded-xs bg-[#DDE3FF] px-0.5 font-semibold text-ink ring-1 ring-[#3355FF]/40";

function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/** Where a figure's number appears as a whole number in the text (never the "5" inside "19.59"). */
function findNumber(text: string, value: number | string): [number, number] | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const forms = new Set([String(value), String(n), n.toLocaleString("en-US", { maximumFractionDigits: 6 })]);
  const plain = westernDigits(text);
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?<![\\d.,])${escaped}(?![\\d]|[.,]\\d)`).exec(plain);
    if (match) return [match.index, match.index + form.length];
  }
  return null;
}

/** The quote marked in the text (or, failing that, the figure's number). */
export function markIn(text: string, quote: string, value: number | string): ReactNode {
  let range: [number, number] | null = null;
  const at = quote ? text.indexOf(quote) : -1;
  if (at >= 0) range = [at, at + quote.length];
  else {
    const head = quote.slice(0, 60);
    const headAt = head.length >= 20 ? text.indexOf(head) : -1;
    range = headAt >= 0 ? [headAt, headAt + head.length] : findNumber(text, value);
  }
  if (!range) return text;
  return (
    <>
      {text.slice(0, range[0])}
      <mark className={MARK} data-focus>
        {text.slice(range[0], range[1])}
      </mark>
      {text.slice(range[1])}
    </>
  );
}

function column(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function letters(index: number): string {
  let out = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

function cellText(value: string | number): string {
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : Number(value.toFixed(3)).toLocaleString("en-US", { maximumFractionDigits: 3 });
  return value;
}

/** The stored document around one figure, as the page or table it was read from. */
export function ExcerptView({ excerpt, quote, value, t }: { excerpt: FigureExcerpt; quote: string; value: number | string; t: Translate }) {
  if (excerpt.kind === "sheet") {
    const refs = Object.keys(excerpt.cells);
    const rows = [...new Set(refs.map((r) => Number(r.match(/\d+$/)?.[0])))].sort((a, b) => a - b);
    const cols = [...new Set(refs.map(column))].sort((a, b) => a - b);
    const focusRow = Number(excerpt.focus.match(/\d+$/)?.[0]);
    return (
      <div className="w-full overflow-x-auto rounded-md border border-border bg-surface" dir="ltr">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr className="bg-surface-sunken text-subtle">
              <th className="sticky left-0 z-[1] w-10 min-w-10 border-e border-border bg-surface-sunken px-2 py-1" />
              {cols.map((c) => (
                <th key={c} className={cn("num border-e border-border px-2 py-1 font-medium last:border-e-0", c === 1 && excerpt.focus.replace(/\d+$/, "") !== "A" && "sticky left-10 z-[1] bg-surface-sunken")}>
                  {letters(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r} className={cn("border-t border-border", r === focusRow && "bg-accent-soft/50", i > 0 && rows[i - 1] !== r - 1 && "border-t-2 border-t-border-strong")}>
                <th className="num sticky left-0 z-[1] w-10 min-w-10 border-e border-border bg-surface-sunken px-2 py-1 text-center font-medium text-subtle">{r}</th>
                {cols.map((c) => {
                  const ref = `${letters(c)}${r}`;
                  const v = excerpt.cells[ref];
                  const focus = ref === excerpt.focus;
                  // Column A usually holds the row labels: keep it in view while scrolling across.
                  const labels = c === 1 && excerpt.focus.replace(/\d+$/, "") !== "A";
                  return (
                    <td
                      key={ref}
                      dir="auto"
                      data-focus={focus || undefined}
                      className={cn(
                        "max-w-[260px] border-e border-border px-2 py-1.5 align-top whitespace-pre-wrap last:border-e-0",
                        labels && "sticky left-10 z-[1] max-w-[200px] bg-surface shadow-[1px_0_0_var(--border)]",
                        typeof v === "number" && "num text-end",
                        focus && "bg-highlight font-semibold text-text ring-2 ring-accent ring-inset",
                      )}
                    >
                      {v === undefined ? "" : cellText(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (excerpt.kind === "page") {
    return (
      <div className="rounded-sm bg-white px-6 py-6 text-[13px] leading-relaxed text-ink shadow-card sm:px-10" dir="auto">
        <p className="num mb-3 text-end text-xs text-[#7D839F]">{excerpt.page}</p>
        <div className="whitespace-pre-wrap">{markIn(excerpt.text, quote, value)}</div>
      </div>
    );
  }
  return (
    <div className="rounded-sm bg-white px-6 py-6 text-sm leading-loose text-ink shadow-card sm:px-10" dir="auto">
      {!excerpt.found && <p className="mb-3 rounded-sm bg-context-tint px-3 py-2 text-xs text-context-text">{t("registry.document.quoteNotFound")}</p>}
      <div className="whitespace-pre-wrap">
        {excerpt.truncated_start && "… "}
        {excerpt.found ? markIn(excerpt.text, quote, value) : excerpt.text}
        {excerpt.truncated_end && " …"}
      </div>
    </div>
  );
}
