"use server";

import { createClient as createSessionlessClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";

import { getViewer } from "@/lib/auth";
import { env } from "@/lib/env";
import type { ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import { PREF_KINDS } from "./prefs";

export async function saveProfile(input: { fullName: string; locale?: "ar" | "en" }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const name = z.string().trim().min(1).max(120).safeParse(input.fullName);
  if (!name.success) return { ok: false, error: "settings.errors.nameRequired" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: name.data, ...(input.locale ? { locale: input.locale } : {}) })
    .eq("id", viewer.id);
  if (error) return { ok: false, error: "errors.generic" };
  refresh();
  return { ok: true };
}

export async function saveLocale(locale: "ar" | "en"): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  if (locale !== "ar" && locale !== "en") return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ locale }).eq("id", viewer.id);
  return error ? { ok: false, error: "errors.generic" } : { ok: true };
}

const passwordSchema = z.object({ current: z.string().min(1), next: z.string().min(8).max(200) });

/** Changing the password needs the current one, so an unattended session can't lock the owner out. */
export async function changePassword(input: z.input<typeof passwordSchema>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "auth.errors.passwordShort" };
  if (parsed.data.current === parsed.data.next) return { ok: false, error: "settings.errors.samePassword" };

  const probe = createSessionlessClient(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrong } = await probe.auth.signInWithPassword({ email: viewer.email, password: parsed.data.current });
  if (wrong) return { ok: false, error: wrong.status === 429 ? "auth.errors.rateLimited" : "settings.errors.currentPassword" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { ok: false, error: error.code === "weak_password" ? "auth.errors.passwordShort" : "errors.generic" };
  return { ok: true };
}

const prefsSchema = z.object({
  telegram: z.boolean(),
  telegram_kinds: z.object(Object.fromEntries(PREF_KINDS.map((k) => [k, z.boolean()])) as Record<(typeof PREF_KINDS)[number], z.ZodBoolean>),
});

export async function saveNotificationPrefs(input: z.input<typeof prefsSchema>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("notification_prefs").eq("id", viewer.id).single();
  // Merge, so keys other code keeps in the same column survive.
  const current = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("profiles")
    .update({ notification_prefs: { ...current, ...parsed.data } })
    .eq("id", viewer.id);
  if (error) return { ok: false, error: "errors.generic" };
  refresh();
  return { ok: true };
}

export type TelegramLink = { url: string; qr: string; expiresAt: string };

/** A one-time deep link (10 minutes) that links this account when opened in Telegram. */
export async function createTelegramLink(): Promise<ActionResult<TelegramLink>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const bot = env.telegramBotUsername;
  if (!bot) return { ok: false, error: "settings.telegramLink.notConfigured" };
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_telegram_link_token");
  if (error || !token) return { ok: false, error: "errors.generic" };
  const url = `https://t.me/${bot}?start=${token}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0E1230", light: "#00000000" } });
  return { ok: true, data: { url, qr, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() } };
}

export async function telegramStatus(): Promise<{ linked: boolean; username: string | null }> {
  const viewer = await getViewer();
  if (!viewer) return { linked: false, username: null };
  const supabase = await createClient();
  const { data } = await supabase.from("telegram_links").select("telegram_username").eq("user_id", viewer.id).maybeSingle();
  return { linked: !!data, username: data?.telegram_username ?? null };
}

export async function unlinkTelegram(): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const supabase = await createClient();
  const { error } = await supabase.from("telegram_links").delete().eq("user_id", viewer.id);
  if (error) return { ok: false, error: "errors.generic" };
  refresh();
  return { ok: true };
}

export async function signOutOtherSessions(): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return error ? { ok: false, error: "errors.generic" } : { ok: true };
}
