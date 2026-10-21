"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth";
import type { ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const ids = z.array(z.string().uuid()).min(1).max(200);

export async function markAlertsRead(alertIds?: string[]): Promise<ActionResult<number>> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  if (alertIds && !ids.safeParse(alertIds).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_alerts_read", alertIds ? { alert_ids: alertIds } : {});
  if (error) return { ok: false, error: "errors.generic" };
  refresh();
  return { ok: true, data: data ?? 0 };
}

export async function dismissAlerts(alertIds: string[]): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "errors.not_authenticated" };
  if (!ids.safeParse(alertIds).success) return { ok: false, error: "errors.generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_alerts", { alert_ids: alertIds });
  if (error) return { ok: false, error: "errors.generic" };
  refresh();
  return { ok: true };
}

const follow = z.object({ type: z.enum(["indicator", "entity"]), id: z.string().uuid(), on: z.boolean() });

export async function setFollow(input: z.input<typeof follow>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.active) return { ok: false, error: "errors.not_authenticated" };
  const parsed = follow.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const { type, id, on } = parsed.data;
  const supabase = await createClient();
  const { error } = on
    ? await supabase
        .from("follows")
        .upsert({ user_id: viewer.id, newsroom_id: viewer.active.newsroomId, target_type: type, target_id: id }, { onConflict: "user_id,target_type,target_id", ignoreDuplicates: true })
    : await supabase.from("follows").delete().eq("user_id", viewer.id).eq("target_type", type).eq("target_id", id);
  if (error) return { ok: false, error: "errors.generic" };
  return { ok: true };
}
