import { z } from "zod";
import { companyEnum, httpUrl, listParams, optionalText } from "./common";

/** SPEC §6.2 / FR-F02. Shared by the client form and the server action. */
export const formInput = z.object({
  name: z.string().trim().min(1, "Give the form a name.").max(160),
  url: httpUrl,
  company: companyEnum,
  notes: optionalText(5000),
  /** FR-F08 is a warning, not a block — the client re-submits with this set. */
  acknowledgeDuplicate: z.coerce.boolean().optional().default(false),
});

export type FormInput = z.infer<typeof formInput>;

/** FR-F06 — sort by name and date added. FR-F07 — search name and notes. */
export const FORM_SORTS = ["name", "createdAt", "company"] as const;

export const formListParams = listParams;
