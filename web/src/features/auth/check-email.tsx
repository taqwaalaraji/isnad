"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";

import { type AuthState, resendMagicLink } from "./actions";

export function CheckEmail({ email, next }: { email: string; next?: string }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(resendMagicLink, {});
  return (
    <div>
      <span className="mb-6 inline-flex size-12 items-center justify-center rounded-md bg-accent-soft text-accent">
        <Icon name="mail" size={24} />
      </span>
      <h1 className="text-2xl font-bold">{t("auth.checkEmailTitle")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("auth.checkEmailBody")}
        <bdi dir="ltr" className="font-medium text-text">
          {email}
        </bdi>
      </p>
      <p className="mt-2 text-xs text-subtle">{t("auth.checkEmailHint")}</p>
      <form action={action} className="mt-8 space-y-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next ?? ""} />
        {state.error && <FieldError>{t(`auth.errors.${state.error === "generic" ? "linkInvalid" : state.error}`)}</FieldError>}
        {state.sent && <p className="text-sm text-match-text">{t("auth.resent")}</p>}
        <Button type="submit" variant="secondary" className="w-full" icon="refresh" loading={pending}>
          {t("auth.resend")}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href={`/${locale}/sign-in`} className="text-accent hover:underline">
          {t("auth.useDifferentEmail")}
        </Link>
      </p>
    </div>
  );
}
