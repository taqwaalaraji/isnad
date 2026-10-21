"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, Field, FieldError, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { acceptInvitation, sendInviteSignInLink, switchAccountForInvite } from "./actions";
import type { InvitationPreview } from "./types";

function NewsroomCard({ preview }: { preview: InvitationPreview }) {
  const { t, locale } = useI18n();
  const name = preview.newsroom_name ?? "";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-card">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-bold text-on-accent">{name.charAt(0)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">
            {[preview.invited_by && t("auth.invite.invitedBy", { name: preview.invited_by }), preview.created_at && formatRelative(preview.created_at, locale)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {preview.role && (
        <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
          {[t(`roles.${preview.role}`), preview.desk_name].filter(Boolean).join(" · ")}
        </span>
      )}
    </div>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div>
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-muted">
        <Icon name="mail" size={20} />
      </span>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      {children && <div className="mt-6 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function InviteView({
  token,
  preview,
  needsPassword,
  signedIn,
}: {
  token: string;
  preview: InvitationPreview;
  needsPassword: boolean;
  signedIn: boolean;
}) {
  const { t, locale } = useI18n();
  const name = preview.newsroom_name ?? "";

  if (preview.state === "invalid" || preview.state === "expired" || preview.state === "used") {
    const key = preview.state === "used" ? "auth.invite.used" : preview.state === "expired" ? "auth.invite.expired" : "auth.invite.invalid";
    return (
      <Notice title={preview.state === "used" ? t("auth.invite.usedTitle") : t("auth.invite.unavailableTitle")} body={t(key)}>
        {signedIn ? (
          <ButtonLink href={`/${locale}`} variant="primary" iconEnd="arrow-right">
            {t("auth.invite.openIsnad")}
          </ButtonLink>
        ) : (
          <ButtonLink href={`/${locale}/sign-in`} variant="primary">
            {t("auth.signIn")}
          </ButtonLink>
        )}
      </Notice>
    );
  }

  if (preview.state === "wrong_account") {
    return (
      <div className="space-y-6">
        <NewsroomCard preview={preview} />
        <Notice title={t("auth.invite.title", { newsroom: name })} body={t("auth.invite.wrongAccount")}>
          <form action={switchAccountForInvite.bind(null, token, locale)}>
            <Button type="submit" variant="primary" icon="logout">
              {t("auth.invite.switchAccount")}
            </Button>
          </form>
        </Notice>
      </div>
    );
  }

  if (preview.state === "signed_out") return <SignedOut token={token} preview={preview} />;

  return <AcceptForm token={token} preview={preview} needsPassword={needsPassword} />;
}

function SignedOut({ token, preview }: { token: string; preview: InvitationPreview }) {
  const { t, locale } = useI18n();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();
  const next = `/${locale}/invite/${token}`;
  return (
    <div className="space-y-6">
      <NewsroomCard preview={preview} />
      <div>
        <h1 className="text-2xl font-bold">{t("auth.invite.title", { newsroom: preview.newsroom_name ?? "" })}</h1>
        <p className="mt-2 text-sm text-muted">{t("auth.invite.signedOutBody", { email: preview.email ?? "" })}</p>
      </div>
      {sent ? (
        <p className="flex items-start gap-2 rounded-md bg-match-tint p-3 text-sm text-match-text">
          <Icon name="check" size={16} className="mt-0.5 shrink-0" />
          {t("auth.invite.linkSent")}
        </p>
      ) : (
        <Button
          variant="primary"
          icon="mail"
          className="w-full"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await sendInviteSignInLink(token, locale);
              if (res.ok) setSent(true);
              else setError(res.error);
            })
          }
        >
          {t("auth.invite.sendLink")}
        </Button>
      )}
      {error && <FieldError>{t(error)}</FieldError>}
      <p className="text-center text-sm text-muted">
        {t("auth.invite.havePassword")}{" "}
        <Link href={`/${locale}/sign-in?next=${encodeURIComponent(next)}`} className="font-medium text-accent hover:underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}

function AcceptForm({ token, preview, needsPassword }: { token: string; preview: InvitationPreview; needsPassword: boolean }) {
  const { t, locale } = useI18n();
  const [fullName, setFullName] = useState(preview.full_name ?? "");
  const [password, setPassword] = useState("");
  const [uiLocale, setUiLocale] = useState(locale);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <NewsroomCard preview={preview} />
      <div>
        <h1 className="text-2xl font-bold">{t("auth.invite.joinTitle", { newsroom: preview.newsroom_name ?? "" })}</h1>
        <p className="mt-2 text-sm text-muted">{needsPassword ? t("auth.invite.completeBody") : t("auth.invite.body", { newsroom: preview.newsroom_name ?? "", role: preview.role ? t(`roles.${preview.role}`) : "" })}</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!fullName.trim()) return setError("auth.invite.nameRequired");
          if (needsPassword && password.length < 8) return setError("auth.errors.passwordShort");
          startTransition(async () => {
            const res = await acceptInvitation({ token, fullName, password: needsPassword ? password : undefined, locale: uiLocale });
            if (res && !res.ok) setError(res.error);
          });
        }}
      >
        <Field label={t("settings.name")} htmlFor="full-name">
          <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
        </Field>
        <Field label={t("auth.email")} htmlFor="email">
          <Input id="email" value={preview.email ?? ""} dir="ltr" readOnly disabled />
        </Field>
        {needsPassword && (
          <Field label={t("auth.password")} htmlFor="password" hint={t("auth.passwordHint")}>
            <Input id="password" type="password" dir="ltr" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        )}
        <Field label={t("settings.language")} htmlFor="ui-locale">
          <Select id="ui-locale" value={uiLocale} onChange={(e) => setUiLocale(e.target.value === "en" ? "en" : "ar")}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Checkbox label={t("auth.invite.agree")} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        {error && <FieldError>{t(error)}</FieldError>}
        <Button type="submit" variant="primary" className="w-full" iconEnd="arrow-right" loading={pending} disabled={!agreed}>
          {t("auth.invite.join")}
        </Button>
      </form>
    </div>
  );
}
