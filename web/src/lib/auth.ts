import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import type { Database } from "@/lib/database.types";
import type { Locale } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

export type MemberRole = Database["public"]["Enums"]["member_role"];
export type PlatformRole = Database["public"]["Enums"]["platform_role"];

export const NEWSROOM_COOKIE = "isnad_newsroom";

export type Membership = {
  newsroomId: string;
  newsroomName: string;
  newsroomSlug: string;
  role: MemberRole;
  deskId: string | null;
  deskName: string | null;
};

export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  locale: Locale;
  platformRole: PlatformRole;
  memberships: Membership[];
  /** The newsroom the viewer is working in (cookie, else last used, else first). */
  active: Membership | null;
};

/**
 * The signed-in user with their newsrooms. Data Access Layer entry point: every page and
 * action resolves the viewer here; memoized for the duration of one request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Session checks read the clock (token expiry), so everything behind them renders per request.
  await connection();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, locale, platform_role, last_newsroom_id")
      .eq("id", userId)
      .single(),
    supabase
      .from("memberships")
      .select("newsroom_id, role, desk_id, status, newsrooms(name, slug, status), desks(name)")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);
  if (!profile) return null;

  const memberships: Membership[] = (rows ?? [])
    .filter((m) => m.newsrooms && m.newsrooms.status === "active")
    .map((m) => ({
      newsroomId: m.newsroom_id,
      newsroomName: m.newsrooms!.name,
      newsroomSlug: m.newsrooms!.slug,
      role: m.role,
      deskId: m.desk_id,
      deskName: m.desks?.name ?? null,
    }))
    .sort((a, b) => a.newsroomName.localeCompare(b.newsroomName));

  const chosen = (await cookies()).get(NEWSROOM_COOKIE)?.value;
  const active =
    memberships.find((m) => m.newsroomId === chosen) ??
    memberships.find((m) => m.newsroomId === profile.last_newsroom_id) ??
    memberships[0] ??
    null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email,
    locale: profile.locale,
    platformRole: profile.platform_role,
    memberships,
    active,
  };
});

/** For pages: the viewer, or a redirect to sign-in. */
export async function requireViewer(locale: Locale): Promise<Viewer> {
  const viewer = await getViewer();
  // The proxy let the request through, so a token exists; without a profile it's stale and must be cleared.
  if (!viewer) redirect(`/auth/session-ended?locale=${locale}`);
  return viewer;
}

/** For newsroom pages: a viewer with an active newsroom (staff without one go to the console). */
export async function requireNewsroom(locale: Locale): Promise<Viewer & { active: Membership }> {
  const viewer = await requireViewer(locale);
  if (!viewer.active) {
    if (isStaff(viewer)) redirect(`/${locale}/console/sources`);
    redirect(`/${locale}/no-newsroom`);
  }
  return viewer as Viewer & { active: Membership };
}

export async function requireNewsroomRole(locale: Locale, roles: MemberRole[]) {
  const viewer = await requireNewsroom(locale);
  if (!roles.includes(viewer.active.role)) notFound();
  return viewer;
}

export async function requireStaff(locale: Locale, adminOnly = false) {
  const viewer = await requireViewer(locale);
  if (adminOnly ? viewer.platformRole !== "admin" : !isStaff(viewer)) notFound();
  return viewer;
}

export function isStaff(viewer: Pick<Viewer, "platformRole">): boolean {
  return viewer.platformRole === "curator" || viewer.platformRole === "admin";
}

export function canDecide(viewer: Viewer): boolean {
  return viewer.active?.role === "editor" || viewer.active?.role === "admin";
}

export function isNewsroomAdmin(viewer: Viewer): boolean {
  return viewer.active?.role === "admin";
}
