import { z } from "zod";
import { companyEnum, httpUrl, listParams, optionalText } from "./common";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
  .transform((v) => {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!));
  });

/** FR-T02 — name, assignee, deadline, optional description. Company optional (D-05). */
export const taskInput = z.object({
  employeeId: z.string().min(1, "Choose who this is for."),
  name: z.string().trim().min(1, "Give the task a name.").max(200),
  description: optionalText(10_000),
  company: companyEnum.nullish(),
  // D-06 — date only. No time of day, by decision.
  deadline: dateOnly,
});

export type TaskInput = z.infer<typeof taskInput>;

/**
 * The result panel's payload (FR-T04). Any one of these satisfies the gate (BR-05);
 * this schema does not require any of them, because the gate is enforced server-side
 * in complete.ts where it can be checked against what is already stored.
 */
export const resultPayload = z.object({
  resultText: z.string().max(20_000).nullish(),
  fileIds: z.array(z.string().min(1)).max(20).optional(),
  links: z
    .array(
      z.object({
        url: httpUrl,
        label: z.string().trim().max(160).nullish(),
      }),
    )
    .max(20)
    .optional(),
});

export type ResultPayloadInput = z.infer<typeof resultPayload>;

/** FR-T13 — filter by status, overdue and deadline range. */
export const taskListParams = listParams.extend({
  employeeId: z.string().optional().catch(undefined),
  status: z.enum(["OPEN", "COMPLETED"]).optional().catch(undefined),
  overdue: z.coerce.boolean().optional().catch(undefined),
  from: dateOnly.optional().catch(undefined),
  to: dateOnly.optional().catch(undefined),
});

export type TaskListParams = z.infer<typeof taskListParams>;
