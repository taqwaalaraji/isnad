"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, Input } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/provider";

import { type AuthState, sendMagicLink, signInWithPassword } from "./actions";

export function SignInForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<"link" | "password">("link");
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(sendMagicLink, {});
  const [passwordState, passwordAction, passwordPending] = useActionState<AuthState, FormData>(signInWithPassword, {});
  const state = mode === "link" ? linkState : passwordState;
  const errorKey = state.error ? (`auth.errors.${state.error === "generic" ? "linkInvalid" : state.error}` as const) : null;

  return (
    <div>
      <Image src="/brand/isnad-logo-arabic-color.svg" alt={t("common.appName")} width={96} height={36} className="mb-8 dark:hidden" priority />
      <Image src="/brand/isnad-logo-arabic-reversed.svg" alt={t("common.appName")} width={96} height={36} className="mb-8 hidden dark:block" priority />
      <h1 className="text-2xl font-bold">{t("auth.welcome")}</h1>
      <p className="mt-2 text-sm text-muted">{t("auth.welcomeSub")}</p>

      {linkError && !state.error && (
        <div className="mt-6">
          <FieldError>{t("auth.errors.linkInvalid")}</FieldError>
        </div>
      )}

      <form action={mode === "link" ? linkAction : passwordAction} className="mt-8 space-y-4" noValidate>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label={t("auth.email")} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            required
            defaultValue={state.email}
            placeholder={t("auth.emailPlaceholder")}
            aria-invalid={state.error === "emailInvalid" || undefined}
          />
        </Field>
        {mode === "password" && (
          <Field label={t("auth.password")} htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required minLength={8} />
          </Field>
        )}
        {errorKey && <FieldError>{t(errorKey)}</FieldError>}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          icon={mode === "link" ? "mail" : "key"}
          loading={mode === "link" ? linkPending : passwordPending}
        >
          {mode === "link" ? t("auth.sendLink") : t("auth.signIn")}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-border" />
        {t("common.or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        variant="secondary"
        className="w-full"
        icon={mode === "link" ? "key" : "mail"}
        onClick={() => setMode(mode === "link" ? "password" : "link")}
      >
        {mode === "link" ? t("auth.withPassword") : t("auth.withLink")}
      </Button>

      {mode === "password" && (
        <p className="mt-4 text-center text-sm">
          <Link href={`/${locale}/reset-password`} className="text-accent hover:underline">
            {t("auth.forgotPassword")}
          </Link>
        </p>
      )}
      <p className="mt-6 text-center text-xs text-subtle">{t("auth.terms")}</p>
    </div>
  );
}
