"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { adminErrorKey } from "@/features/admin/errors";
import { getViewer, NEWSROOM_COOKIE } from "@/lib/auth";
import type { ActionResult } from "@/lib/errors";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { sendInvitationEmail, type SendResult } from "./email";

const ROLES = ["journalist", "editor", "admin"] as const;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().max(120).default(""),
  role: z.enum(ROLES),
  deskId: z.string().uuid().nullable(),
  locale: z.string(),
});

function asLocale(value: string): Locale {
  return isLocale(value) ? value : "ar";
}

function sendError(result: SendResult): ActionResult {
  return { ok: false, error: result === "rate_limited" ? "auth.errors.rateLimited" : "admin.errors.emailFailed" };
}

/** The viewer as an admin of their active newsroom, or null. */
async function activeAdmin() {
  const viewer = await getViewer();
  if (!viewer?.active || viewer.active.role !== "admin") return null;
  return viewer as typeof viewer & { active: NonNullable<typeof viewer.active> };
}

export async function inviteMember(input: z.input<typeof inviteSchema>): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "admin.errors.emailInvalid" };
  const { email, fullName, role, deskId } = parsed.data;

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invitation", {
    target_newsroom: viewer.active.newsroomId,
    invite_email: email,
    invite_name: fullName,
    invite_role: role,
    invite_desk: deskId ?? undefined,
  });
  if (error || !token) return { ok: false, error: adminErrorKey(error) };

  const sent = await sendInvitationEmail({ email, fullName, locale: asLocale(parsed.data.locale), token });
  refresh();
  return sent === "sent" ? { ok: true } : sendError(sent);
}

export async function resendInvitation(invitationId: string, locale: string): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const supabase = await createClient();
  const { data: invitation } = await supabase
    .from("invitations")
    .select("email, full_name, newsroom_id")
    .eq("id", invitationId)
    .eq("newsroom_id", viewer.active.newsroomId)
    .maybeSingle();
  if (!invitation) return { ok: false, error: "auth.invite.invalid" };
  const { data: token, error } = await supabase.rpc("renew_invitation", { target_invitation: invitationId });
  if (error || !token) return { ok: false, error: adminErrorKey(error) };
  const sent = await sendInvitationEmail({
    email: invitation.email,
    fullName: invitation.full_name,
    locale: asLocale(locale),
    token,
  });
  refresh();
  return sent === "sent" ? { ok: true } : sendError(sent);
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  const viewer = await activeAdmin();
  if (!viewer) return { ok: false, error: "errors.not_allowed" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { target_invitation: invitationId });
  if (error) return { ok: false, error: adminErrorKey(error) };
  refresh();
  return { ok: true };
}

const acceptSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{48}$/),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().optional(),
  locale: z.string(),
});

/** Accept as the signed-in user: set a password if the account is new, then join the newsroom. */
export async function acceptInvitation(input: z.input<typeof acceptSchema>): Promise<ActionResult> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "auth.invite.nameRequired" };
  const { token, fullName, password } = parsed.data;
  const locale = asLocale(parsed.data.locale);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { ok: false, error: "errors.not_authenticated" };
  const needsPassword = (claims.claims.user_metadata as { needs_password?: boolean } | undefined)?.needs_password === true;

  if (needsPassword) {
    if (!password || password.length < 8) return { ok: false, error: "auth.errors.passwordShort" };
    const { error } = await supabase.auth.updateUser({ password, data: { needs_password: false } });
    if (error) return { ok: false, error: error.code === "weak_password" ? "auth.errors.passwordShort" : "errors.generic" };
  }

  await supabase.from("profiles").update({ full_name: fullName, locale }).eq("id", userId);
  const { data: newsroomId, error } = await supabase.rpc("accept_invitation", { raw_token: token });
  if (error || !newsroomId) return { ok: false, error: adminErrorKey(error) };

  (await cookies()).set(NEWSROOM_COOKIE, newsroomId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  redirect(`/${locale}`);
}

/** For a visitor without a session: email a sign-in link to the invited address (never shown to them). */
export async function sendInviteSignInLink(token: string, locale: string): Promise<ActionResult> {
  if (!/^[0-9a-f]{48}$/.test(token)) return { ok: false, error: "auth.invite.invalid" };
  const admin = createAdminClient();
  const { data: email } = await admin.rpc("invitation_email", { raw_token: token });
  if (!email) return { ok: false, error: "auth.invite.invalid" };
  const { data: invitation } = await admin.from("invitations").select("full_name").eq("email", email).is("accepted_at", null).limit(1).maybeSingle();
  const sent = await sendInvitationEmail({ email, fullName: invitation?.full_name ?? "", locale: asLocale(locale), token });
  return sent === "sent" ? { ok: true } : sendError(sent);
}

/** Signed in with another account: sign out and come back to the invitation after signing in. */
export async function switchAccountForInvite(token: string, locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const safeLocale = asLocale(locale);
  const next = /^[0-9a-f]{48}$/.test(token) ? `/${safeLocale}/invite/${token}` : `/${safeLocale}`;
  redirect(`/${safeLocale}/sign-in?next=${encodeURIComponent(next)}`);
}
