import type { MessageKey, Translate } from "@/lib/i18n/translate";

const ACTIONS = new Set([
  "check.created",
  "member.invited",
  "member.invitation_revoked",
  "member.updated",
  "member.deactivated",
  "member.reactivated",
  "desk.created",
  "desk.deleted",
  "policies.updated",
  "source.created",
  "source.proposed",
  "decision.approve",
  "decision.edit",
  "decision.escalate",
  "decision.reopen",
  "decision.send_for_review",
  "decision.approve_check",
  "decision.publish",
  "decision.archive",
  "decision.recheck",
]);

/** A readable label for an activity entry; unknown actions show as stored. */
export function actionLabel(action: string, t: Translate): string {
  return ACTIONS.has(action) ? t(`admin.activity.actions.${action.replace(".", "_")}` as MessageKey) : action;
}
