import { z } from "zod";
import { companyEnum, httpUrl, listParams, optionalText } from "./common";

export const sheetTypeEnum = z.enum(["LEADS", "EMPLOYEES", "DATA", "CAMPAIGN_LEADS"]);

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
  .transform((v) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!));
  });

/**
 * BR-02 / AC-03 — a sheet has exactly one of a URL or an uploaded file, never both and
 * never neither.
 *
 * Expressed as a discriminated union so the *type* makes the invalid states
 * unrepresentable, rather than validating them away afterwards. Re-checked in the
 * server action and again by a Postgres CHECK constraint.
 */
const sheetBase = z.object({
  name: z.string().trim().min(1, "Give the sheet a name.").max(160),
  dateCreated: dateOnly,
  company: companyEnum,
  type: sheetTypeEnum,
  notes: optionalText(5000),
  /**
   * BR-03 — a manually entered count requires its as-of date. For uploads both are
   * computed, so the client sends neither.
   */
  lastRecordCount: z.coerce.number().int().min(0).max(100_000_000).nullish(),
  lastRecordCountAsOf: dateOnly.nullish(),
});

export const sheetInput = z
  .discriminatedUnion("storageMode", [
    sheetBase.extend({
      storageMode: z.literal("LINK"),
      url: httpUrl,
    }),
    sheetBase.extend({
      storageMode: z.literal("FILE"),
      // The file arrives as multipart; this carries the StoredFile id after upload.
      fileId: z.string().min(1, "Choose a file to upload."),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.lastRecordCount != null && !value.lastRecordCountAsOf) {
      ctx.addIssue({
        code: "custom",
        path: ["lastRecordCountAsOf"],
        message: "Add the date this count was accurate — a bare number nobody can date is not useful.",
      });
    }
  });

export type SheetInput = z.infer<typeof sheetInput>;

/** FR-S07 — sort by name, date created and record count. */
export const SHEET_SORTS = ["name", "dateCreated", "lastRecordCount", "createdAt"] as const;

export const sheetListParams = listParams.extend({
  type: sheetTypeEnum.optional().catch(undefined),
});

export type SheetListParams = z.infer<typeof sheetListParams>;
