import type { Database } from "@/lib/database.types";

export type SettingsTab = "profile" | "notifications" | "channels" | "sessions";
export const SETTINGS_TABS: SettingsTab[] = ["profile", "notifications", "channels", "sessions"];

export const PREF_KINDS = ["revisions", "review", "check_ready", "follows"] as const;
export type PrefKind = (typeof PREF_KINDS)[number];

/**
 * Stored in profiles.notification_prefs. Alerts always appear in Isnad; `telegram` is the channel
 * switch and `telegram_kinds` chooses which alerts also go to Telegram. The worker reads both.
 */
export type NotificationPrefs = {
  telegram: boolean;
  telegram_kinds: Record<PrefKind, boolean>;
};

type AlertKind = Database["public"]["Enums"]["alert_kind"];

export const KIND_GROUP: Record<AlertKind, PrefKind> = {
  figure_revised: "revisions",
  review_requested: "review",
  check_escalated: "review",
  check_ready: "check_ready",
  new_release: "follows",
  new_figure: "follows",
};

export function readPrefs(raw: unknown): NotificationPrefs {
  const value = (raw ?? {}) as { telegram?: unknown; telegram_kinds?: Record<string, unknown> };
  const kinds = value.telegram_kinds ?? {};
  return {
    telegram: value.telegram !== false,
    telegram_kinds: Object.fromEntries(PREF_KINDS.map((k) => [k, kinds[k] !== false])) as Record<PrefKind, boolean>,
  };
}
