"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { signInInput } from "@/lib/validation/employee";
import { setPasswordFromToken } from "./activate";
import { isAppError } from "@/lib/errors";

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | null;

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (e) {
    // Deliberately identical for "no such account" and "wrong password": never reveal
    // which addresses have accounts.
    if (e instanceof APIError) return { error: "INVALID_CREDENTIALS" };
    throw e;
  }

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/forms");
}

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function setPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const { setPasswordInput } = await import("@/lib/validation/employee");
  const parsed = setPasswordInput.safeParse({ token, password, confirm });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  let email: string;
  try {
    ({ email } = await setPasswordFromToken(parsed.data.token, parsed.data.password));
  } catch (e) {
    if (isAppError(e)) return { error: e.message };
    throw e;
  }

  // Sign them straight in — one action, not "now go and log in".
  await auth.api.signInEmail({
    body: { email, password: parsed.data.password },
    headers: await headers(),
  });

  redirect("/forms");
}
