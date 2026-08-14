"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setPasswordAction, type FormState } from "@/server/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ActivateForm({
  token,
  fullName,
  email,
  purpose,
}: {
  token: string;
  fullName: string;
  email: string;
  purpose: "ACTIVATION" | "PASSWORD_RESET";
}) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(setPasswordAction, null);
  const activation = purpose === "ACTIVATION";

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ink">
          {activation ? t("activateTitle") : t("resetTitle")}
        </h1>
        <p className="text-sm text-ink-60">
          {activation ? t("activateHint", { name: fullName }) : t("resetHint")}
        </p>
      </div>

      {state?.error ? (
        <p role="alert" className="bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-text">
          {state.error}
        </p>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <Field id="account-email" label={t("email")}>
        {/* Shown, not editable — the link decides which account this is. */}
        <Input id="account-email" value={email} readOnly disabled autoComplete="username" />
      </Field>

      <Field
        id="password"
        label={t("newPassword")}
        hint={t("passwordHint")}
        error={state?.fieldErrors?.password}
        required
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          invalid={Boolean(state?.fieldErrors?.password)}
        />
      </Field>

      <Field
        id="confirm"
        label={t("confirmPassword")}
        error={state?.fieldErrors?.confirm}
        required
      >
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          invalid={Boolean(state?.fieldErrors?.confirm)}
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : activation ? t("setPasswordAndContinue") : t("resetAndContinue")}
      </Button>
    </form>
  );
}
