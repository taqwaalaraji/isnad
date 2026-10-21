"use client";

import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "./cn";
import { Icon } from "./icon";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeLabel: string;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <RadixDialog.Content
        className={cn(
          "fixed start-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-y-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2",
          "max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-border bg-surface-raised shadow-popover focus:outline-none",
          size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <RadixDialog.Title className="text-lg font-semibold text-text">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-sm text-muted">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            aria-label={closeLabel}
            className="-me-2 -mt-1 rounded-md p-2 text-muted hover:bg-surface-sunken hover:text-text"
          >
            <Icon name="x" size={18} />
          </RadixDialog.Close>
        </div>
        {children ? <div className="px-6 py-4">{children}</div> : <div className="h-4" />}
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
