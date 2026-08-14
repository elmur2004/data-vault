import "server-only";

/**
 * FR-S05 / AC-04 — how many records a sheet holds, counted from the file itself so
 * nobody has to keep the number up to date by hand.
 *
 * **Ambiguity A-1, decided.** skills/file-service says "populated rows on the first
 * worksheet, minus header row if present", and "if present" is a heuristic. The rule
 * used here, and surfaced in the UI so the number is explicable:
 *
 *   Row 1 is treated as a header when every non-empty cell in it is text **and** at
 *   least one cell in row 2 is not text. Otherwise every populated row is counted.
 *
 * A populated row is one with at least one non-empty cell. Blank rows anywhere are
 * ignored, so trailing whitespace in a spreadsheet does not inflate the count.
 *
 * **DV-05:** legacy `.xls` is accepted for storage but not counted — exceljs reads only
 * OOXML, and the maintained npm build of the alternative carries open advisories.
 * Those sheets keep a manual count, with an as-of date required (BR-03).
 */

export type RowCountResult = {
  count: number;
  headerDetected: boolean;
  /** Null when the format cannot be counted (legacy .xls) — the UI says why. */
  countable: boolean;
};

const isEmpty = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * "Looks like a value, not a label."
 *
 * This has to work for both XLSX, where a number arrives as a number, and CSV, where
 * *every* cell arrives as a string — so a purely type-based test would never fire on a
 * CSV and every counted CSV would be one row too high.
 */
function isValueLike(v: unknown): boolean {
  if (typeof v === "number" || typeof v === "boolean" || v instanceof Date) return true;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (s === "") return false;
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}([ T]|$)/.test(s)) return true; // ISO date
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) return true; // 12/07/2026
  if (/^-?\d+(\.\d+)?%$/.test(s)) return true;
  return false;
}

/** A label: non-empty text that does not read as a value. */
const isLabelLike = (v: unknown) => !isEmpty(v) && !isValueLike(v);

/**
 * Ambiguity A-1, decided: row 1 is a header when every non-empty cell in it reads as a
 * label **and** at least one cell in row 2 reads as a value.
 *
 * Known limitation, deliberately accepted: a sheet whose every column is free text
 * (names beside notes, say) has no value-like cell in row 2, so its first row counts
 * as data. Erring that way keeps a headerless list correct, and the alternative —
 * assuming a header whenever row 1 is text — silently undercounts every such file by
 * one. The UI states which way it read the sheet, so the number is always explicable.
 */
export function decideHeader(row1: unknown[], row2: unknown[] | undefined): boolean {
  const firstCells = row1.filter((c) => !isEmpty(c));
  if (firstCells.length === 0) return false;
  if (!firstCells.every(isLabelLike)) return false;
  if (!row2) return false;
  const secondCells = row2.filter((c) => !isEmpty(c));
  if (secondCells.length === 0) return false;
  return secondCells.some(isValueLike);
}

export function countRows(rows: unknown[][]): RowCountResult {
  const populated = rows.filter((r) => r.some((c) => !isEmpty(c)));
  if (populated.length === 0) return { count: 0, headerDetected: false, countable: true };

  const headerDetected = decideHeader(populated[0]!, populated[1]);
  return {
    count: headerDetected ? populated.length - 1 : populated.length,
    headerDetected,
    countable: true,
  };
}

/** Counts an XLSX. Streams the first worksheet only (§6.3.1). */
export async function countXlsx(buffer: Buffer): Promise<RowCountResult> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { count: 0, headerDetected: false, countable: true };

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(values.map((v) => cellToPrimitive(v)));
  });

  return countRows(rows);
}

/** exceljs cell values can be rich text, formulas or hyperlinks; reduce to a scalar. */
function cellToPrimitive(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((p) => p.text ?? "").join("");
    }
    if ("text" in o) return o.text;
    if ("result" in o) return o.result;
    if (v instanceof Date) return v;
    return JSON.stringify(v);
  }
  return v;
}

/** Counts a CSV, honouring quoted fields and any of the four common delimiters. */
export function countCsv(buffer: Buffer): RowCountResult {
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const records = parseCsv(text);
  return countRows(records);
}

/** Minimal RFC-4180 parse: quoted fields, escaped quotes, embedded newlines. */
function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  let best = ",";
  let bestCount = 0;
  for (const d of [",", ";", "\t", "|"]) {
    const count = sample.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Dispatch by the *detected* extension, never the filename (BR-04). */
export async function countRecords(
  buffer: Buffer,
  detectedExt: string,
): Promise<RowCountResult> {
  if (detectedExt === "xlsx") return countXlsx(buffer);
  if (detectedExt === "csv") return countCsv(buffer);
  // DV-05 — legacy .xls is stored but not counted.
  return { count: 0, headerDetected: false, countable: false };
}
