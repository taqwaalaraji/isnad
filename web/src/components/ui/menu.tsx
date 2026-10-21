"use client";

import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 rounded-md border border-border bg-surface-raised p-1 shadow-popover"
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
  disabled,
}: {
  icon?: IconName;
  children: ReactNode;
  onSelect?: (event: Event) => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none select-none",
        "data-[highlighted]:bg-surface-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        danger ? "text-differ-text" : "text-text",
      )}
    >
      {icon && <Icon name={icon} size={16} className="text-muted" />}
      {children}
    </DropdownMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-2.5 py-1.5 text-xs text-muted">{children}</DropdownMenu.Label>;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />;
}
