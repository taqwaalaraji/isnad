"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import {
  changePassword,
  createTelegramLink,
  saveLocale,
  saveNotificationPrefs,
  saveProfile,
  signOutOtherSessions,
  type TelegramLink,
  telegramStatus,
  unlinkTelegram,
} from "./actions";
import { type NotificationPrefs, PREF_KINDS, SETTINGS_TABS, type SettingsTab } from "./prefs";
import type { SettingsData } from "./queries";


export function SettingsView({
  data,
  tab,
  roleLabel,
  newsroomName,
  botConfigured,
}: {
  data: SettingsData;
  tab: SettingsTab;
  roleLabel: string;
  newsroomName: string;
  botConfigured: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <>
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {SETTINGS_TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              const next = new URLSearchParams(search);
              next.set("tab", key);
              router.replace(`${pathname}?${next}`, { scroll: false });
            }}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
              tab === key ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t(`settings.tabs.${key}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <ProfileCard data={data} roleLabel={roleLabel} newsroomName={newsroomName} />
        <div className="min-w-0 space-y-5">
          {tab === "profile" && <ProfileTab data={data} />}
          {tab === "notifications" && <NotificationsTab prefs={data.prefs} telegramLinked={!!data.telegram} />}
          {tab === "channels" && <TelegramCard data={data} botConfigured={botConfigured} />}
          {tab === "sessions" && <SessionsTab />}
        </div>
      </div>
    </>
  );
}

// ─── Profile summary (language and theme) ─────────────────────────────────────

type Theme = "light" | "dark" | "system";

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onChange);
  };
}

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem("isnad-theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("isnad-theme");
    else localStorage.setItem("isnad-theme", theme);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function ProfileCard({ data, roleLabel, newsroomName }: { data: SettingsData; roleLabel: string; newsroomName: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const theme = useSyncExternalStore<Theme>(subscribeTheme, storedTheme, () => "system");
  const [pending, startTransition] = useTransition();

  return (
    <Card className="h-fit p-5">
      <div className="flex items-center gap-3">
        <Avatar name={data.profile.fullName || data.profile.email} size={44} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{data.profile.fullName || data.profile.email}</p>
          <p className="truncate text-xs text-muted">{[roleLabel, newsroomName].join(" · ")}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">{t("settings.language")}</p>
          <Segmented
            label={t("settings.language")}
            size="sm"
            value={locale}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
            ]}
            onChange={(next) => {
              if (next === locale || pending) return;
              startTransition(async () => {
                await saveLocale(next);
                router.push(pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${next}`) + (search.size ? `?${search}` : ""));
              });
            }}
          />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">{t("settings.theme")}</p>
          <Segmented
            label={t("settings.theme")}
            size="sm"
            value={theme}
            options={[
              { value: "light", label: t("settings.themes.light") },
              { value: "dark", label: t("settings.themes.dark") },
              { value: "system", label: t("settings.themes.system") },
            ]}
            onChange={applyTheme}
          />
        </div>
      </div>
    </Card>
  );
}

// ─── Profile tab ──────────────────────────────────────────────────────────────

function useRun() {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult>, success: string, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        after?.();
      } else toast.error(t(res.error));
    });
  }
  return { pending, run };
}

function ProfileTab({ data }: { data: SettingsData }) {
  const { t } = useI18n();
  const [name, setName] = useState(data.profile.fullName);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const profile = useRun();
  const password = useRun();

  return (
    <>
      <Card>
        <CardHeader title={t("settings.profile")} />
        <form
          className="space-y-4 px-5 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            profile.run(() => saveProfile({ fullName: name }), t("common.saved"));
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("settings.name")} htmlFor="profile-name">
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
            <Field label={t("settings.email")} htmlFor="profile-email" hint={t("settings.emailHint")}>
              <Input id="profile-email" value={data.profile.email} dir="ltr" readOnly disabled />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={profile.pending} disabled={!name.trim() || name.trim() === data.profile.fullName}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title={t("settings.password.title")} description={t("settings.password.body")} />
        <form
          className="space-y-4 px-5 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            password.run(() => changePassword({ current, next }), t("auth.passwordSaved"), () => {
              setCurrent("");
              setNext("");
            });
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("settings.password.current")} htmlFor="current-password">
              <Input id="current-password" type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label={t("auth.newPassword")} htmlFor="new-password" hint={t("auth.passwordHint")}>
              <Input id="new-password" type="password" dir="ltr" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={password.pending} disabled={!current || next.length < 8}>
              {t("settings.password.change")}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────

function NotificationsTab({ prefs, telegramLinked }: { prefs: NotificationPrefs; telegramLinked: boolean }) {
  const { t } = useI18n();
  const [value, setValue] = useState(prefs);
  const [saved, setSaved] = useState(prefs);
  const { pending, run } = useRun();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  return (
    <Card>
      <CardHeader
        title={t("settings.notify.matrixTitle")}
        description={t("settings.notify.matrixBody")}
        action={
          <Button variant="primary" size="sm" loading={pending} disabled={!dirty} onClick={() => run(() => saveNotificationPrefs(value), t("common.saved"), () => setSaved(value))}>
            {t("common.save")}
          </Button>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-y border-border bg-surface-sunken/50 text-xs text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{t("settings.notify.alert")}</th>
              <th className="w-24 px-3 py-2.5 text-center font-medium">{t("settings.notify.inApp")}</th>
              <th className="w-24 px-3 py-2.5 text-center font-medium">{t("settings.notify.telegramChannel")}</th>
            </tr>
          </thead>
          <tbody>
            {PREF_KINDS.map((kind) => (
              <tr key={kind} className="border-b border-border last:border-0">
                <td className="px-5 py-3">
                  <p className="font-medium">{t(`settings.notify.kindsList.${kind}.title`)}</p>
                  <p className="text-xs text-muted">{t(`settings.notify.kindsList.${kind}.body`)}</p>
                </td>
                <td className="px-3 py-3 text-center">
                  <input type="checkbox" checked disabled aria-label={t("settings.notify.alwaysInApp")} title={t("settings.notify.alwaysInApp")} className="size-4 accent-[var(--accent)]" />
                </td>
                <td className="px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
                    aria-label={`${t("settings.notify.telegramChannel")}: ${t(`settings.notify.kindsList.${kind}.title`)}`}
                    disabled={!value.telegram}
                    checked={value.telegram && value.telegram_kinds[kind]}
                    onChange={(e) => setValue((v) => ({ ...v, telegram_kinds: { ...v.telegram_kinds, [kind]: e.target.checked } }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-start justify-between gap-4 border-t border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium">{t("settings.notify.telegramMaster")}</p>
          <p className="text-xs text-muted">{telegramLinked ? t("settings.notify.telegramMasterHint") : t("settings.notify.telegramNotLinked")}</p>
        </div>
        <Switch label={t("settings.notify.telegramMaster")} checked={value.telegram} onCheckedChange={(on) => setValue((v) => ({ ...v, telegram: on }))} />
      </div>
    </Card>
  );
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

function TelegramCard({ data, botConfigured }: { data: SettingsData; botConfigured: boolean }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun();
  const linked = data.telegram;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="send" size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold">{t("settings.telegram")}</h2>
            {linked ? (
              <p className="mt-0.5 text-sm text-muted">
                {t("settings.telegramLink.linked", { username: linked.username ? `@${linked.username}` : t("settings.telegramLink.account") })} ·{" "}
                {t("settings.telegramLink.linkedSince", { date: formatDate(linked.linkedAt, locale) })}
              </p>
            ) : (
              <p className="mt-0.5 max-w-md text-sm text-muted">{t("settings.telegramLink.body")}</p>
            )}
          </div>
        </div>
        {linked ? (
          <Button variant="danger" size="sm" loading={pending} onClick={() => run(unlinkTelegram, t("settings.telegramLink.unlinked"))}>
            {t("settings.telegramLink.unlink")}
          </Button>
        ) : (
          <Button variant="primary" icon="send" disabled={!botConfigured} onClick={() => setOpen(true)}>
            {t("settings.telegramLink.title")}
          </Button>
        )}
      </div>
      {!botConfigured && !linked && <p className="border-t border-border px-5 py-3 text-xs text-muted">{t("settings.telegramLink.notConfigured")}</p>}
      {!data.newsroomTelegram && <p className="border-t border-border px-5 py-3 text-xs text-context-text">{t("settings.telegramLink.newsroomDisabled")}</p>}
      {open && <TelegramDialog onClose={() => setOpen(false)} />}
    </Card>
  );
}

function TelegramDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      setError(null);
      setExpired(false);
      const res = await createTelegramLink();
      if (res.ok && res.data) setLink(res.data);
      else if (!res.ok) setError(res.error);
    });
  }

  // A fresh link when the dialog opens.
  useEffect(load, []);

  // Wait for the bot to confirm the link, and notice when the token expires.
  useEffect(() => {
    if (!link) return;
    const until = new Date(link.expiresAt).getTime();
    const id = setInterval(async () => {
      if (Date.now() > until) {
        setExpired(true);
        clearInterval(id);
        return;
      }
      const status = await telegramStatus();
      if (status.linked) {
        clearInterval(id);
        toast.success(t("settings.telegramLink.done"));
        onClose();
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [link, onClose, router, t]);

  const display = link?.url.replace(/^https:\/\//, "") ?? "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        closeLabel={t("common.close")}
        title={t("settings.telegramLink.title")}
        description={t("settings.telegramLink.dialogBody")}
        footer={
          <>
            <Button
              icon="copy"
              disabled={!link || expired}
              onClick={async () => {
                if (!link) return;
                try {
                  await navigator.clipboard.writeText(link.url);
                  toast.success(t("common.copied"));
                } catch {
                  toast.error(t("errors.generic"));
                }
              }}
            >
              {t("settings.telegramLink.copy")}
            </Button>
            {expired ? (
              <Button variant="primary" icon="refresh" loading={pending} onClick={load}>
                {t("settings.telegramLink.newLink")}
              </Button>
            ) : (
              <a
                href={link?.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!link}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-on-accent shadow-card hover:bg-accent-hover",
                  !link && "pointer-events-none opacity-50",
                )}
              >
                <Icon name="external" size={18} />
                {t("settings.telegramLink.open")}
              </a>
            )}
          </>
        }
      >
        {error ? (
          <p className="rounded-md bg-differ-tint p-3 text-sm text-differ-text">{t(error)}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col-reverse items-center gap-5 sm:flex-row sm:items-start">
              <ol className="flex-1 space-y-4">
                {(["step1", "step2", "step3"] as const).map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium">{t(`settings.telegramLink.${step}`)}</p>
                      <p className="text-xs text-muted">{t(`settings.telegramLink.${step}Hint`)}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-white p-3">
                {link && !expired ? (
                  // The SVG comes from our own server (qrcode library), not from user input.
                  <div className="size-36" aria-label={t("settings.telegramLink.qr")} role="img" dangerouslySetInnerHTML={{ __html: link.qr }} />
                ) : (
                  <div className="flex size-36 items-center justify-center text-subtle">
                    <Icon name={expired ? "clock" : "loader"} size={24} className={expired ? "" : "animate-spin"} />
                  </div>
                )}
                <p className="text-[11px] text-ink/60">{t("settings.telegramLink.scan")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2 text-xs">
              <span className={cn("inline-flex items-center gap-1.5", expired ? "text-differ-text" : "text-muted")}>
                <Icon name="clock" size={14} />
                {expired ? t("settings.telegramLink.expired") : link ? t("settings.telegramLink.expiresAt", { time: formatDate(link.expiresAt, locale, "time") }) : t("common.loading")}
              </span>
              <span className="truncate text-muted" dir="ltr">
                {display}
              </span>
            </div>
            {link && !expired && (
              <p className="flex items-center gap-2 text-xs text-muted">
                <Icon name="loader" size={14} className="animate-spin" />
                {t("settings.telegramLink.waiting")}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

function SessionsTab() {
  const { t } = useI18n();
  const { pending, run } = useRun();
  return (
    <Card>
      <CardHeader title={t("settings.sessions.title")} description={t("settings.sessions.body")} />
      <div className="flex flex-wrap gap-2 px-5 pb-5">
        <Button icon="logout" loading={pending} onClick={() => run(signOutOtherSessions, t("settings.sessions.done"))}>
          {t("settings.sessions.signOutOthers")}
        </Button>
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="ghost">
            {t("common.signOut")}
          </Button>
        </form>
      </div>
    </Card>
  );
}
