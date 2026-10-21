import "server-only";

import { createClient } from "@/lib/supabase/server";

import { readPrefs } from "./prefs";

export async function settingsData(userId: string, newsroomId: string) {
  const supabase = await createClient();
  const [profile, telegram, newsroom] = await Promise.all([
    supabase.from("profiles").select("full_name, email, locale, notification_prefs").eq("id", userId).single(),
    supabase.from("telegram_links").select("telegram_username, linked_at").eq("user_id", userId).maybeSingle(),
    supabase.from("newsrooms").select("telegram_enabled").eq("id", newsroomId).single(),
  ]);
  if (profile.error) throw profile.error;
  return {
    profile: { fullName: profile.data.full_name, email: profile.data.email, locale: profile.data.locale },
    prefs: readPrefs(profile.data.notification_prefs),
    telegram: telegram.data ? { username: telegram.data.telegram_username, linkedAt: telegram.data.linked_at } : null,
    newsroomTelegram: newsroom.data?.telegram_enabled ?? true,
  };
}

export type SettingsData = Awaited<ReturnType<typeof settingsData>>;
