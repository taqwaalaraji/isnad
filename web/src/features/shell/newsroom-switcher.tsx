"use client";

import { useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import type { Membership } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/provider";

import { switchNewsroom } from "./actions";

export function NewsroomSwitcher({ active, memberships }: { active: Membership; memberships: Membership[] }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const subtitle = [t(`roles.${active.role}`), active.deskName].filter(Boolean).join(" · ");
  const card = (
    <span className="flex w-full items-center gap-3 rounded-md border border-nav-border bg-nav-raised px-3 py-2.5 text-start">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-lapis text-sm font-bold text-white">
        {active.newsroomName.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-nav-text">{active.newsroomName}</span>
        <span className="block truncate text-xs text-nav-muted">{subtitle}</span>
      </span>
      {memberships.length > 1 && <Icon name="chevron-down" size={16} className="text-nav-muted" />}
    </span>
  );
  if (memberships.length < 2) return card;
  return (
    <Menu>
      <MenuTrigger className="w-full rounded-md disabled:opacity-60" disabled={pending}>
        {card}
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>{t("nav.switchNewsroom")}</MenuLabel>
        {memberships.map((m) => (
          <MenuItem
            key={m.newsroomId}
            icon={m.newsroomId === active.newsroomId ? "check" : "newsroom"}
            onSelect={() => startTransition(() => switchNewsroom(m.newsroomId))}
          >
            {m.newsroomName}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
