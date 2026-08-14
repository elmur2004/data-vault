import { describe, expect, it } from "vitest";
import { countCsv, countRows, decideHeader } from "./row-count";

/**
 * FR-S05 / AC-04 and ambiguity A-1 — the header heuristic.
 *
 * This decides the number every sheet row displays, so the rule is pinned down by
 * tests rather than left to "if present".
 */

describe("A-1 — when is row 1 a header?", () => {
  it("treats an all-text first row as a header when row 2 has non-text", () => {
    expect(decideHeader(["name", "count"], ["Nour", 12])).toBe(true);
  });

  it("does not treat row 1 as a header when row 2 is also all text", () => {
    // Two rows of names is data, not a header plus a record.
    expect(decideHeader(["name", "email"], ["Nour", "nour@x.test"])).toBe(false);
  });

  it("does not treat a numeric first row as a header", () => {
    expect(decideHeader([1, 2, 3], [4, 5, 6])).toBe(false);
  });

  it("does not treat a lone row as a header", () => {
    expect(decideHeader(["name", "count"], undefined)).toBe(false);
  });
});

describe("countRows", () => {
  it("counts data rows, excluding a detected header", () => {
    const result = countRows([
      ["name", "count"],
      ["Nour", 12],
      ["Omar", 8],
    ]);
    expect(result).toEqual({ count: 2, headerDetected: true, countable: true });
  });

  it("counts every row when there is no header", () => {
    const result = countRows([
      ["Nour", "nour@x.test"],
      ["Omar", "omar@x.test"],
    ]);
    expect(result.count).toBe(2);
    expect(result.headerDetected).toBe(false);
  });

  it("ignores blank rows anywhere, so trailing whitespace does not inflate the count", () => {
    const result = countRows([
      ["name", "count"],
      ["Nour", 12],
      ["", ""],
      ["Omar", 8],
      [null, null],
      ["   ", ""],
    ]);
    expect(result.count).toBe(2);
  });

  it("an empty sheet counts zero", () => {
    expect(countRows([]).count).toBe(0);
    expect(countRows([["", ""]]).count).toBe(0);
  });
});

describe("countCsv", () => {
  it("AC-04: an N-row CSV with a header reports N", () => {
    const csv = Buffer.from(
      ["name,count", ...Array.from({ length: 40 }, (_, i) => `person${i},${i}`)].join("\n"),
    );
    const result = countCsv(csv);
    expect(result.count).toBe(40);
    expect(result.headerDetected).toBe(true);
  });

  it("handles quoted fields containing the delimiter", () => {
    const csv = Buffer.from('name,notes,score\n"Hassan, Nour",fine,3\n"Fathy, Omar",ok,4\n');
    expect(countCsv(csv).count).toBe(2);
  });

  it("handles embedded newlines inside quotes", () => {
    const csv = Buffer.from('name,notes,score\n"Nour","line one\nline two",1\n"Omar","single",2\n');
    expect(countCsv(csv).count).toBe(2);
  });

  it("handles escaped quotes", () => {
    const csv = Buffer.from('name,quote,score\nNour,"she said ""hello""",1\nOmar,"plain",2\n');
    expect(countCsv(csv).count).toBe(2);
  });

  it("handles semicolon delimiters and CRLF endings", () => {
    const csv = Buffer.from("name;count\r\nNour;3\r\nOmar;4\r\n");
    expect(countCsv(csv).count).toBe(2);
  });

  it("strips a UTF-8 BOM", () => {
    const csv = Buffer.from("﻿name,count\nNour,3\nOmar,4\n");
    const result = countCsv(csv);
    expect(result.count).toBe(2);
    expect(result.headerDetected).toBe(true);
  });

  it("counts a headerless CSV in full", () => {
    const csv = Buffer.from("Nour,nour@x.test\nOmar,omar@x.test\nSalma,salma@x.test\n");
    expect(countCsv(csv).count).toBe(3);
  });

  it("recognises a header when the data column is a date rather than a number", () => {
    const csv = Buffer.from("name,signed\nNour,2026-07-12\nOmar,2026-07-14\n");
    const result = countCsv(csv);
    expect(result.headerDetected).toBe(true);
    expect(result.count).toBe(2);
  });

  it("A-1 limitation, documented: an all-text sheet counts its first row as data", () => {
    // No value-like cell exists anywhere, so nothing distinguishes a label row from a
    // data row. Counting it is the safer error — see decideHeader's comment.
    const csv = Buffer.from("name,notes\nNour,fine\nOmar,ok\n");
    const result = countCsv(csv);
    expect(result.headerDetected).toBe(false);
    expect(result.count).toBe(3);
  });
});
