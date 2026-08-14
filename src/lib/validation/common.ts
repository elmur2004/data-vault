import { z } from "zod";

/**
 * BR-01 — a form URL must be a well-formed http or https address.
 *
 * `new URL()` alone is too permissive: it happily accepts `ftp://x`, `javascript:…`
 * and `mailto:…`. AC-02 requires both `notaurl` and `ftp://x` to be rejected with a
 * field-level message, so the protocol is checked explicitly.
 */
export const httpUrl = z
  .string()
  .trim()
  .min(1, "Enter a web address.")
  .max(2048, "That address is too long.")
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a full web address, starting with http:// or https://",
      });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        message: `Only http and https addresses work here — this one starts with ${parsed.protocol.replace(":", "")}.`,
      });
    }
    if (!parsed.hostname) {
      ctx.addIssue({ code: "custom", message: "That address has no domain name." });
    }
  });

export const companyEnum = z.enum(["BYTEFORCE", "BSYSTEMS"]);

/** Optional free text that stores NULL rather than "" so filters stay honest. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/**
 * Shared list controls (R-3): pagination, sort and filtering happen in the database,
 * not in the browser. NFR-01 wants any table under 1.5 s at 2,000 rows, and the first
 * table built sets the pattern the other two inherit.
 */
export const PAGE_SIZE = 50;

export const listParams = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  perPage: z.coerce.number().int().min(1).max(200).catch(PAGE_SIZE),
  q: z.string().trim().max(200).optional().catch(undefined),
  company: companyEnum.optional().catch(undefined),
  sort: z.string().max(40).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  archived: z.coerce.boolean().catch(false),
});

export type ListParams = z.infer<typeof listParams>;

export type Page<T> = {
  rows: T[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
};

export function paginate(params: Pick<ListParams, "page" | "perPage">) {
  const take = params.perPage;
  const skip = (params.page - 1) * take;
  return { skip, take };
}

export function toPage<T>(rows: T[], total: number, params: Pick<ListParams, "page" | "perPage">): Page<T> {
  return {
    rows,
    total,
    page: params.page,
    perPage: params.perPage,
    pages: Math.max(1, Math.ceil(total / params.perPage)),
  };
}

/**
 * Turns a requested sort into a Prisma orderBy, refusing anything not on the module's
 * allowlist — a sort key is user input and must never reach the query unchecked.
 */
export function orderByFrom<T extends string>(
  sort: string | undefined,
  dir: "asc" | "desc",
  allowed: readonly T[],
  fallback: Record<string, "asc" | "desc">,
): Record<string, "asc" | "desc"> {
  if (sort && (allowed as readonly string[]).includes(sort)) return { [sort]: dir };
  return fallback;
}
