import { describe, expect, it } from "vitest";
import { computeLateness } from "./lateness";

/**
 * AC-10, AC-11 and the boundaries around them.
 *
 * .agents/rules/20-verification.md names `computeLateness` as the one piece of pure
 * logic that must be unit-tested, because it produces a performance record about a
 * named person and an off-by-one here is an argument with an employee.
 *
 * Egypt observes DST in August, so Cairo is UTC+3 for these cases.
 */

/** A @db.Date column as Prisma returns it: UTC midnight of that calendar date. */
const deadline = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("AC-10 — a task finished three days after its deadline", () => {
  it("is late by 3", () => {
    // 13 Aug 14:00 Cairo = 11:00 UTC
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-08-13T11:00:00Z"))).toEqual({
      wasLate: true,
      daysLate: 3,
    });
  });
});

describe("AC-11 — the on-time boundary", () => {
  it("23:30 on the deadline day, Cairo, is on time", () => {
    // 23:30 Cairo on 10 Aug = 20:30 UTC on 10 Aug
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-08-10T20:30:00Z"))).toEqual({
      wasLate: false,
      daysLate: 0,
    });
  });

  it("23:59:59 on the deadline day is still on time", () => {
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-08-10T20:59:59Z"))).toEqual({
      wasLate: false,
      daysLate: 0,
    });
  });

  it("finishing early is on time, never negative", () => {
    const early = computeLateness(deadline("2026-08-10"), new Date("2026-08-01T09:00:00Z"));
    expect(early).toEqual({ wasLate: false, daysLate: 0 });
  });

  it("finishing at the very start of the deadline day is on time", () => {
    // 00:05 Cairo on 10 Aug = 21:05 UTC on 9 Aug
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-08-09T21:05:00Z"))).toEqual({
      wasLate: false,
      daysLate: 0,
    });
  });
});

describe("the midnight boundary", () => {
  it("00:10 Cairo on the day after the deadline is late by 1", () => {
    // 00:10 Cairo on 11 Aug = 21:10 UTC on 10 Aug
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-08-10T21:10:00Z"))).toEqual({
      wasLate: true,
      daysLate: 1,
    });
  });

  it("the UTC-versus-Cairo trap: 21:30 UTC on the deadline day is already tomorrow in Cairo", () => {
    // 21:30 UTC on 10 Aug = 00:30 Cairo on 11 Aug — late, even though UTC still says
    // the deadline day. Evaluating this in UTC would wrongly call it on time.
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-08-10T21:30:00Z"))).toEqual({
      wasLate: true,
      daysLate: 1,
    });
  });

  it("20:59 UTC on the deadline day is still the deadline day in Cairo", () => {
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-08-10T20:59:00Z")).wasLate).toBe(
      false,
    );
  });
});

describe("other boundaries worth pinning", () => {
  it("counts across a month end", () => {
    expect(computeLateness(deadline("2026-08-30"), new Date("2026-09-02T09:00:00Z")).daysLate).toBe(3);
  });

  it("counts across a year end", () => {
    expect(computeLateness(deadline("2026-12-31"), new Date("2027-01-02T09:00:00Z")).daysLate).toBe(2);
  });

  it("counts across the leap day", () => {
    expect(computeLateness(deadline("2028-02-28"), new Date("2028-03-01T09:00:00Z")).daysLate).toBe(2);
  });

  it("works in winter, when Cairo is UTC+2", () => {
    // 22:30 UTC on 10 Jan = 00:30 Cairo on 11 Jan (UTC+2) — late by 1.
    expect(computeLateness(deadline("2026-01-10"), new Date("2026-01-10T22:30:00Z")).daysLate).toBe(1);
    // 21:30 UTC on 10 Jan = 23:30 Cairo on 10 Jan — on time.
    expect(computeLateness(deadline("2026-01-10"), new Date("2026-01-10T21:30:00Z")).daysLate).toBe(0);
  });

  it("a long overrun counts every whole day", () => {
    expect(computeLateness(deadline("2026-08-10"), new Date("2026-09-10T09:00:00Z")).daysLate).toBe(31);
  });
});
