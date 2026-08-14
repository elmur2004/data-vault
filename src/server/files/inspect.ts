import "server-only";
import { fileTypeFromBuffer } from "file-type";

/**
 * BR-04 / AC-06 — the file's type is decided by its bytes, never its extension.
 * A .txt renamed .pdf is rejected; so is a .xlsx that is really a zip of holiday photos.
 *
 * Two cases need more than magic bytes:
 *
 *  1. **OOXML** (xlsx/docx/pptx) are ZIP containers. `file-type` usually discriminates
 *     them, but when it falls back to `application/zip` we open the archive's own
 *     listing and look for the part prefix (`xl/`, `word/`, `ppt/`). Without this an
 *     arbitrary zip renamed .xlsx would pass, which is exactly what AC-06 forbids.
 *  2. **CSV and plain text have no magic bytes at all.** They get a deliberate sniff:
 *     must decode as text, must not contain NUL or a run of control bytes, and must
 *     show a consistent delimiter. Heuristic by nature — hence the unit tests.
 */

export type DetectedType = { mime: string; ext: string };

export const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
} as const;

export type AllowedExt = keyof typeof MIME;

/** Per-context allowlists (§10.3; task attachments per DF-03). */
export const ALLOWLIST = {
  sheet: ["xlsx", "xls", "csv"],
  document: ["pdf", "docx", "xlsx"],
  attachment: ["pdf", "docx", "xlsx", "pptx", "png", "jpg", "txt"],
} as const satisfies Record<string, readonly AllowedExt[]>;

export type UploadScope = keyof typeof ALLOWLIST;

/** ZIP local-file-header signature. */
function isZip(buf: Buffer) {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

/**
 * Reads the archive's stored path strings to decide which OOXML flavour it is.
 * Deliberately does not decompress — the part *names* are stored uncompressed in the
 * headers, which is all we need and cannot be used as a decompression bomb.
 */
function ooxmlFlavour(buf: Buffer): "xlsx" | "docx" | "pptx" | null {
  const text = buf.toString("latin1");
  if (!text.includes("[Content_Types].xml")) return null;
  if (text.includes("xl/")) return "xlsx";
  if (text.includes("word/")) return "docx";
  if (text.includes("ppt/")) return "pptx";
  return null;
}

/** Legacy BIFF compound-document header (.xls, .doc). */
function isCompoundDoc(buf: Buffer) {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return buf.length > 8 && sig.every((b, i) => buf[i] === b);
}

/**
 * Text sniff for CSV/TXT. Rejects anything binary. Returns "csv" when a consistent
 * delimiter appears on the first lines, otherwise "txt".
 */
function sniffText(buf: Buffer): "csv" | "txt" | null {
  const sample = buf.subarray(0, Math.min(buf.length, 64 * 1024));
  if (sample.includes(0)) return null; // NUL byte — binary

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(sample);
  } catch {
    // Not valid UTF-8; allow latin-1 text but reject if it looks like control soup.
    decoded = sample.toString("latin1");
    const control = [...decoded].filter(
      (ch) => ch.charCodeAt(0) < 9 || (ch.charCodeAt(0) > 13 && ch.charCodeAt(0) < 32),
    ).length;
    if (control / decoded.length > 0.01) return null;
  }

  const clean = decoded.replace(/^﻿/, "");
  if (clean.trim().length === 0) return null;

  const lines = clean.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0).slice(0, 20);
  if (lines.length === 0) return null;

  for (const delim of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => splitOutsideQuotes(l, delim).length);
    const first = counts[0] ?? 0;
    if (first > 1 && counts.every((c) => c === first)) return "csv";
  }
  return "txt";
}

/** Delimiter counting that ignores separators inside quoted fields. */
function splitOutsideQuotes(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * The real type of these bytes, or null when nothing recognisable is found.
 * `declaredName` is used only to disambiguate csv-vs-txt, never to accept a type.
 */
export async function detectType(buf: Buffer, declaredName = ""): Promise<DetectedType | null> {
  const byMagic = await fileTypeFromBuffer(buf);

  if (byMagic) {
    const ext = byMagic.ext as string;

    if (ext === "zip" || byMagic.mime === "application/zip") {
      const flavour = isZip(buf) ? ooxmlFlavour(buf) : null;
      if (flavour) return { mime: MIME[flavour], ext: flavour };
      return { mime: "application/zip", ext: "zip" };
    }

    // file-type may report OOXML directly — trust it, but confirm the container.
    if (ext === "xlsx" || ext === "docx" || ext === "pptx") {
      const flavour = ooxmlFlavour(buf);
      if (flavour && flavour !== ext) return { mime: MIME[flavour], ext: flavour };
      return { mime: MIME[ext as "xlsx" | "docx" | "pptx"], ext };
    }

    if (ext === "cfb" || byMagic.mime === "application/x-cfb") {
      // Legacy Office container. Treated as .xls only when that is what it claims;
      // .doc is not on any allowlist so it will be rejected downstream anyway.
      return { mime: MIME.xls, ext: "xls" };
    }

    if (ext === "jpg" || ext === "jpeg") return { mime: MIME.jpg, ext: "jpg" };
    if (ext === "png") return { mime: MIME.png, ext: "png" };
    if (ext === "pdf") return { mime: MIME.pdf, ext: "pdf" };

    return { mime: byMagic.mime, ext };
  }

  if (isCompoundDoc(buf)) return { mime: MIME.xls, ext: "xls" };

  // No magic bytes — the only legitimate candidates are csv and plain text.
  const text = sniffText(buf);
  if (!text) return null;
  if (text === "csv") return { mime: MIME.csv, ext: "csv" };
  // A ".csv" that parsed as prose is still text; callers decide if txt is allowed.
  return declaredName.toLowerCase().endsWith(".csv")
    ? { mime: MIME.csv, ext: "csv" }
    : { mime: MIME.txt, ext: "txt" };
}

export function isAllowed(scope: UploadScope, ext: string): boolean {
  return (ALLOWLIST[scope] as readonly string[]).includes(ext);
}

/** Human-readable allowlist for error messages ("Accepted here: PDF, DOCX, XLSX"). */
export function allowedLabel(scope: UploadScope): string {
  return ALLOWLIST[scope].map((e) => e.toUpperCase()).join(", ");
}
