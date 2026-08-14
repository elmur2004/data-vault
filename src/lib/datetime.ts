import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/**
 * BR-15 / NFR-09: timestamps are stored UTC and displayed in Africa/Cairo.
 * Formatting to Cairo happens here and nowhere else — no component calls
 * toLocaleString() with its own timezone.
 */
export const DISPLAY_TZ = process.env.DISPLAY_TZ ?? "Africa/Cairo";

/** A timestamp (createdAt, completedAt) rendered in Cairo: "12 Jul 2026, 14:30". */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return format(new TZDate(d, DISPLAY_TZ), "d MMM yyyy, HH:mm");
}

/**
 * A calendar date (@db.Date — deadline, dateCreated, lastRecordCountAsOf) rendered
 * as "12 Jul 2026".
 *
 * Prisma returns @db.Date as a Date at UTC midnight. Reading it back with the local
 * timezone would shift it a day west of Greenwich, so the UTC parts are read directly.
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return format(
    new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    "d MMM yyyy",
  );
}

/** For <input type="date">: the UTC calendar parts as yyyy-MM-dd. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

/** Parse a yyyy-MM-dd form value into the UTC-midnight Date a @db.Date column expects. */
export function fromDateInputValue(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/**
 * Today's calendar date in Cairo, as UTC midnight — comparable with a @db.Date column.
 * Used for the live overdue check on OPEN tasks (FR-T09) and for
 * lastRecordCountAsOf (AC-04). Distinct from the stored wasLate of completed tasks.
 */
export function todayInCairo(now: Date = new Date()): Date {
  const cairo = new TZDate(now, DISPLAY_TZ);
  return new Date(Date.UTC(cairo.getFullYear(), cairo.getMonth(), cairo.getDate()));
}

/**
 * FR-T09: an OPEN task is overdue when today in Cairo is past its deadline date.
 * Computed live, never conflated with the frozen wasLate written at completion (BR-07).
 */
export function isOverdue(deadline: Date, now: Date = new Date()): boolean {
  return todayInCairo(now).getTime() > todayInCairo(deadline).getTime();
}
