import { errorKey } from "@/lib/errors";
import type { MessageKey } from "@/lib/i18n/translate";

const CODES: Record<string, MessageKey> = {
  last_admin: "admin.members.lastAdmin",
  already_member: "admin.members.alreadyMember",
  email_invalid: "admin.errors.emailInvalid",
  desk_invalid: "admin.errors.deskInvalid",
  member_not_found: "admin.errors.memberNotFound",
  invitation_invalid: "auth.invite.invalid",
  invitation_used: "auth.invite.used",
  invitation_expired: "auth.invite.expired",
  invitation_wrong_account: "auth.invite.wrongAccount",
  // Unique violations: a desk or source with the same name or slug.
  duplicate_key: "admin.errors.duplicate",
  "23505": "admin.errors.duplicate",
};

/** Map a database error raised by the admin functions to a message key. */
export function adminErrorKey(error: { message?: string; code?: string } | null | undefined): MessageKey {
  const message = error?.message ?? "";
  for (const [code, key] of Object.entries(CODES)) {
    if (message.includes(code) || error?.code === code) return key;
  }
  return errorKey(error);
}
