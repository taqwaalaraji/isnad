import "server-only";

import type { VersionContext } from "../queries";

export type CellGrid = {
  kind: "cell";
  sheet: string;
  columns: string[];
  rows: Array<{ number: number; cells: string[] }>;
  target: { row: number; column: string } | null;
};

export type TextPassage = { kind: "text"; page: number | null; before: string; match: string; after: string; found: boolean };

export type FigureContext = CellGrid | TextPassage | null;

type Location = { kind?: string; sheet?: string | null; cell?: string | null; page?: number | null };

const PASSAGE = 600;

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function columnLetters(index: number): string {
  let out = "";
  let n = index + 1;
  while (n) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** The part of a sheet around the cell: a few rows above and below, the label column, and nearby columns. */
function cellGrid(context: VersionContext, location: Location): CellGrid | null {
  const sheet = context.sheets.find((s) => s.sheet === location.sheet) ?? (context.sheets.length === 1 ? context.sheets[0] : undefined);
  if (!sheet) return null;
  const ref = /^([A-Z]{1,3})(\d+)$/.exec((location.cell ?? "").toUpperCase());
  const target = ref ? { column: ref[1], row: Number(ref[2]) } : null;
  const parsed = Object.entries(sheet.cells).map(([key, value]) => {
    const m = /^([A-Z]{1,3})(\d+)$/.exec(key);
    return m ? { col: columnIndex(m[1]), row: Number(m[2]), value } : null;
  });
  const cells = parsed.filter((c): c is { col: number; row: number; value: unknown } => c !== null);
  if (!cells.length) return null;
  const targetCol = target ? columnIndex(target.column) : 0;
  const targetRow = target?.row ?? 1;
  const firstRow = Math.max(1, targetRow - 8);
  const lastRow = targetRow + 4;
  const nearCols = new Set<number>([0]);
  for (let c = Math.max(0, targetCol - 4); c <= targetCol + 2; c++) nearCols.add(c);
  const usedCols = [...nearCols].filter((c) => cells.some((cell) => cell.col === c && cell.row >= firstRow && cell.row <= lastRow)).sort((a, b) => a - b);
  const byKey = new Map(cells.map((c) => [`${c.col}:${c.row}`, c.value]));
  const rows: CellGrid["rows"] = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const values = usedCols.map((c) => {
      const v = byKey.get(`${c}:${r}`);
      return v === undefined || v === null ? "" : String(v);
    });
    if (values.some(Boolean) || r === targetRow) rows.push({ number: r, cells: values });
  }
  return { kind: "cell", sheet: sheet.sheet, columns: usedCols.map(columnLetters), rows, target };
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find the quote in the text, tolerating whitespace differences; falls back to its opening words. */
function locate(text: string, quote: string): { start: number; end: number } | null {
  const words = quote.split(/[\s|]+/).filter(Boolean);
  for (const take of [words.length, Math.min(words.length, 8), Math.min(words.length, 4)]) {
    if (take < 2 && words.length > 1) continue;
    const pattern = words.slice(0, take).map(escape).join("[\\s|]+");
    if (!pattern) return null;
    const m = new RegExp(pattern, "u").exec(text);
    if (m) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

function passage(text: string, quote: string, page: number | null): TextPassage {
  const hit = locate(text, quote);
  if (!hit) return { kind: "text", page, before: text.slice(0, PASSAGE), match: "", after: "", found: false };
  const from = Math.max(0, hit.start - PASSAGE);
  const to = Math.min(text.length, hit.end + PASSAGE);
  return {
    kind: "text",
    page,
    before: (from > 0 ? "… " : "") + text.slice(from, hit.start),
    match: text.slice(hit.start, hit.end),
    after: text.slice(hit.end, to) + (to < text.length ? " …" : ""),
    found: true,
  };
}

/** What the reviewer sees beside a figure: the cell in its sheet, or the passage holding the quote. */
export function figureContext(context: VersionContext | undefined, location: Location, quote: string): FigureContext {
  if (!context) return null;
  if (location.kind === "cell") {
    const grid = cellGrid(context, location);
    if (grid) return grid;
  }
  const pageText = location.page && context.pages ? context.pages[location.page - 1] : undefined;
  if (pageText) {
    const onPage = passage(pageText, quote, location.page ?? null);
    if (onPage.found) return onPage;
  }
  const whole = passage(context.text, quote, location.page ?? null);
  return whole.found || !pageText ? whole : { ...whole, before: pageText.slice(0, PASSAGE) };
}
