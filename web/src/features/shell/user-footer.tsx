"use client";

import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { useI18n } from "@/lib/i18n/provider";

export function UserFooter({ name, email }: { name: string; email: string }) {
  const { t, locale } = useI18n();
  return (
    <div className="border-t border-nav-border p-3">
      <Link
        href={`/${locale}/settings`}
        className="mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-nav-muted hover:bg-nav-raised/60 hover:text-nav-text"
      >
        <Icon name="settings" size={18} />
        {t("nav.settings")}
      </Link>
      <div className="flex items-center gap-3 px-3 py-2">
        <Avatar name={name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-nav-text">{name}</p>
          <p className="truncate text-xs text-nav-muted" dir="ltr">
            {email}
          </p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            aria-label={t("common.signOut")}
            title={t("common.signOut")}
            className="rounded-md p-1.5 text-nav-muted hover:bg-nav-raised hover:text-nav-text"
          >
            <Icon name="logout" size={18} className="ltr:rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
}
