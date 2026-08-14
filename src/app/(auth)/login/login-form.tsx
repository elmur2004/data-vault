"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signInAction, type FormState } from "@/server/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, null);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ink">{t("signIn")}</h1>
        <p className="text-sm text-ink-60">{t("signInHint")}</p>
      </div>

      {state?.error ? (
        <p role="alert" className="bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-text">
          {t("invalidCredentials")}
        </p>
      ) : null}

      <input type="hidden" name="next" value={next ?? ""} />

      <Field id="email" label={t("email")} error={state?.fieldErrors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          invalid={Boolean(state?.fieldErrors?.email)}
        />
      </Field>

      <Field id="password" label={t("password")} error={state?.fieldErrors?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(state?.fieldErrors?.password)}
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? t("signingIn") : t("signIn")}
      </Button>

      <p className="text-xs text-ink-60">{t("noSignup")}</p>
    </form>
  );
}
