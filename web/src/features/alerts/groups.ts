import type { Database } from "@/lib/database.types";

export type AlertKind = Database["public"]["Enums"]["alert_kind"];

export const ALERT_FILTERS = ["all", "unread", "revisions", "releases", "decisions", "ready"] as const;
export type AlertFilter = (typeof ALERT_FILTERS)[number];

export const FILTER_KINDS: Record<Exclude<AlertFilter, "all" | "unread">, AlertKind[]> = {
  revisions: ["figure_revised"],
  releases: ["new_release", "new_figure"],
  decisions: ["review_requested", "check_escalated"],
  ready: ["check_ready"],
};

/** Where an alert leads. */
export function alertHref(kind: AlertKind, payload: Record<string, unknown>, locale: string): string | null {
  const s = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : null);
  switch (kind) {
    case "review_requested":
    case "check_ready":
      return s("check_id") ? `/${locale}/checks/${s("check_id")}` : null;
    case "check_escalated":
      return s("check_id") ? `/${locale}/checks/${s("check_id")}${s("claim_id") ? `?claim=${s("claim_id")}` : ""}` : null;
    case "figure_revised":
    case "new_figure":
      return s("indicator_id") ? `/${locale}/registry/indicators/${s("indicator_id")}` : null;
    case "new_release":
      return s("document_id") ? `/${locale}/registry/documents/${s("document_id")}` : null;
  }
}
