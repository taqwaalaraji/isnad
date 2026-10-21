import type { MessageKey } from "@/lib/i18n/translate";

const KNOWN = [
  "not_allowed",
  "not_authenticated",
  "claims_pending",
  "claims_escalated",
  "check_not_reviewable",
  "check_not_approved",
  "check_processing",
  "check_not_editable",
  "url_invalid",
  "wording_required",
  "text_required",
  "editor_invalid",
  "invalid_decision",
  "claim_not_found",
] as const;

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: MessageKey };

/** Map a Postgres/RPC error to a dictionary key the UI can show. */
export function errorKey(error: { message?: string } | null | undefined): MessageKey {
  const message = error?.message ?? "";
  const known = KNOWN.find((k) => message.includes(k));
  return known ? (`errors.${known}` as MessageKey) : "errors.generic";
}
