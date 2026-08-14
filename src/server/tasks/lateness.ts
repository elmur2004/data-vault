import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays } from "date-fns";

/**
 * BR-07 / §9.4 — was this task late, and by how many whole days?
 *
 * D-06 fixed deadlines as calendar dates, evaluated in **Africa/Cairo**. A task is late
 * when it is completed after 23:59:59 on the deadline date, Cairo time. Completing on
 * the deadline day is on time (AC-11) — the generous reading, deliberately, because
 * this number becomes a performance record about a named person.
 *
 * Called exactly once per task, at completion, and the result is stored. There is no
 * recompute path: editing the deadline later must not rewrite history (AC-12).
 *
 * No `server-only` guard — this is pure arithmetic, unit-tested directly.
 */
export const LATENESS_TZ = "Africa/Cairo";

export type Lateness = { wasLate: boolean; daysLate: number };

export function computeLateness(
  /** A @db.Date column: Prisma hands it back as UTC midnight of the calendar date. */
  deadline: Date,
  /** Server time at the moment of completion (BR-06). */
  completedAt: Date,
): Lateness {
  // The instant of completion, expressed as a Cairo calendar date.
  const completedCairo = new TZDate(completedAt, LATENESS_TZ);

  // The deadline's calendar parts are read in UTC, because that is how a date-only
  // column is stored; reading them locally would shift the date west of Greenwich.
  const deadlineCairo = new TZDate(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate(),
    LATENESS_TZ,
  );

  const daysLate = Math.max(0, differenceInCalendarDays(completedCairo, deadlineCairo));
  return { wasLate: daysLate > 0, daysLate };
}
