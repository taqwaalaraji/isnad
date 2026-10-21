import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Locale } from "@/lib/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";

export type SendResult = "sent" | "rate_limited" | "failed";

/** Where every invitation email lands: the invite page for this token. */
export function invitationUrl(locale: Locale, token: string): string {
  return `${env.siteUrl}/${locale}/invite/${token}`;
}

/**
 * Sends the invitation email through Supabase Auth: a sign-up invitation for an address without an
 * account (it sets a password on the invite page), or a one-time sign-in link for an existing account.
 * Both land on the invite page, which accepts the invitation.
 */
export async function sendInvitationEmail({
  email,
  fullName,
  locale,
  token,
}: {
  email: string;
  fullName: string;
  locale: Locale;
  token: string;
}): Promise<SendResult> {
  const redirectTo = invitationUrl(locale, token);
  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  let confirmed = false;
  if (profile) {
    const { data } = await admin.auth.admin.getUserById(profile.id);
    confirmed = !!data.user?.email_confirmed_at || !!data.user?.last_sign_in_at;
  }

  if (!confirmed) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName, locale, needs_password: true },
    });
    if (!error) return "sent";
    if (error.status === 429) return "rate_limited";
    // An account appeared in between, or was confirmed some other way: fall back to a sign-in link.
    if (error.code !== "email_exists") {
      console.error("invitation email failed", error.code ?? error.status);
      return "failed";
    }
  }

  // A client without a session, so sending the link never touches the admin's own session cookies.
  const anon = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (!error) return "sent";
  if (error.status === 429) return "rate_limited";
  console.error("invitation sign-in link failed", error.code ?? error.status);
  return "failed";
}
