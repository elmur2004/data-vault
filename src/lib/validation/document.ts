import { z } from "zod";
import { companyEnum, listParams, optionalText } from "./common";

/** D-04 — closed at the §6.1 nine. This list drives the filter, so it cannot stay open. */
export const documentTypeEnum = z.enum([
  "CONTRACT",
  "PROPOSAL",
  "INVOICE",
  "REPORT",
  "PRESENTATION",
  "BRAND_ASSET",
  "LEGAL",
  "HR",
  "OTHER",
]);

export const documentInput = z.object({
  name: z.string().trim().min(1, "Give the document a name.").max(160),
  // D-07 — optional. A required description produces a column of one-word entries.
  description: optionalText(5000),
  company: companyEnum,
  type: documentTypeEnum,
  fileId: z.string().min(1, "Choose a file to upload."),
});

export type DocumentInput = z.infer<typeof documentInput>;

/** FR-D07 — sort by name and date added. */
export const DOCUMENT_SORTS = ["name", "createdAt", "type"] as const;

export const documentListParams = listParams.extend({
  type: documentTypeEnum.optional().catch(undefined),
});

export type DocumentListParams = z.infer<typeof documentListParams>;
