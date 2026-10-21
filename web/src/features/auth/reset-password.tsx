"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, Input } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";

import { type AuthState, requestPasswordReset, updatePassword } from "./actions";

export function RequestReset() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <div>
      <h1 className="text-2xl font-bold">{t("auth.resetTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("auth.resetBody")}</p>
      <form action={action} className="mt-8 space-y-4">
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required defaultValue={state.email} />
        </Field>
        {state.error && <FieldError>{t(`auth.errors.${state.error === "generic" ? "linkInvalid" : state.error}`)}</FieldError>}
        {state.sent && <p className="text-sm text-match-text">{t("auth.resent")}</p>}
        <Button type="submit" variant="primary" className="w-full" icon="mail" loading={pending}>
          {t("auth.sendReset")}
        </Button>
      </form>
    </div>
  );
}

export function NewPassword() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <div>
      <h1 className="text-2xl font-bold">{t("auth.newPasswordTitle")}</h1>
      <form action={action} className="mt-8 space-y-4">
        <Field label={t("auth.newPassword")} htmlFor="password" hint={t("auth.passwordHint")}>
          <Input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" minLength={8} required />
        </Field>
        {state.error && <FieldError>{t(`auth.errors.${state.error === "generic" ? "linkInvalid" : state.error}`)}</FieldError>}
        <Button type="submit" variant="primary" className="w-full" loading={pending}>
          {t("common.save")}
        </Button>
      </form>
    </div>
  );
}
