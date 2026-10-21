import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

/** Full-page state (not found, error, no access): icon, title, explanation, actions. */
export function StatePanel({ icon, title, body, children }: { icon: IconName; title: ReactNode; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-card">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name={icon} size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        {body && <p className="mt-2 text-sm text-muted">{body}</p>}
        {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
