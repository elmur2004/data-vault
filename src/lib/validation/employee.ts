import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

/** SPEC §5.1 field constraints, shared by the client form and the server action. */
export const employeeInput = z.object({
  fullName: z.string().trim().min(1, "Enter the employee's full name.").max(120),
  email: z.email("Enter a valid email address.").max(160).transform((v) => v.trim().toLowerCase()),
  jobTitle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : null)),
  // Null means both companies (§5.1).
  company: z.enum(["BYTEFORCE", "BSYSTEMS"]).nullable().optional().default(null),
});

export type EmployeeInput = z.infer<typeof employeeInput>;

export const setPasswordInput = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Both passwords must match.",
    path: ["confirm"],
  });

export const signInInput = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
