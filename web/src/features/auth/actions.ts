"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/lib/env";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { inLocale, safeNext } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: "invalidCredentials" | "notInvited" | "rateLimited" | "emailInvalid" | "passwordShort" | "generic"; email?: string; sent?: boolean };

const emailSchema = z.string().trim().toLowerCase().email();

async function currentLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "ar";
}

function mapError(error: { status?: number; message?: string; code?: string }): AuthState["error"] {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return "rateLimited";
  if (error.code === "otp_disabled" || error.code === "signup_disabled" || /signups? not allowed/i.test(error.message ?? "")) return "notInvited";
  if (error.code === "invalid_credentials" || error.status === 400) return "invalidCredentials";
  return "generic";
}

export async function sendMagicLink(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "emailInvalid" };
  const locale = await currentLocale();
  const next = inLocale(safeNext(String(formData.get("next") ?? ""), `/${locale}`), locale);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${env.siteUrl}${next}` },
  });
  // An address without an account gets the same answer as one with an account, so the form can't
  // be used to find out who has access.
  if (error && mapError(error) !== "notInvited") return { error: mapError(error), email: parsed.data };
  redirect(`/${locale}/check-email?email=${encodeURIComponent(parsed.data)}&next=${encodeURIComponent(next)}`);
}

export async function resendMagicLink(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "emailInvalid" };
  const locale = await currentLocale();
  const next = inLocale(safeNext(String(formData.get("next") ?? ""), `/${locale}`), locale);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${env.siteUrl}${next}` },
  });
  if (error && mapError(error) !== "notInvited") return { error: mapError(error), email: parsed.data };
  return { sent: true, email: parsed.data };
}

export async function signInWithPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "emailInvalid" };
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "invalidCredentials", email: parsed.data };
  const locale = await currentLocale();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data, password });
  if (error) return { error: mapError(error), email: parsed.data };
  redirect(inLocale(safeNext(String(formData.get("next") ?? ""), `/${locale}`), locale));
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "emailInvalid" };
  const locale = await currentLocale();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${env.siteUrl}/${locale}/reset-password`,
  });
  // Don't reveal whether the account exists; only rate limits are worth reporting.
  if (error && mapError(error) === "rateLimited") return { error: "rateLimited", email: parsed.data };
  return { sent: true, email: parsed.data };
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "passwordShort" };
  const locale = await currentLocale();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "generic" };
  redirect(`/${locale}`);
}
