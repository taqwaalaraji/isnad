"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getViewer, NEWSROOM_COOKIE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function switchNewsroom(newsroomId: string) {
  const viewer = await getViewer();
  if (!viewer || !viewer.memberships.some((m) => m.newsroomId === newsroomId)) return;
  (await cookies()).set(NEWSROOM_COOKIE, newsroomId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  const supabase = await createClient();
  await supabase.from("profiles").update({ last_newsroom_id: newsroomId }).eq("id", viewer.id);
  revalidatePath("/", "layout");
}
