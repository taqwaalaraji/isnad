"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth";
import { env } from "@/lib/env";
import { type ActionResult, errorKey } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

import type { AskAnswer } from "./types";

const followSchema = z.object({
  targetType: z.enum(["indicator", "entity"]),
  targetId: z.string().uuid(),
  follow: z.boolean(),
});

/** Follow or unfollow an indicator or entity; followers are alerted to new and revised figures. */
export async function setFollow(input: z.input<typeof followSchema>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer?.active) return { ok: false, error: "errors.not_authenticated" };
  const parsed = followSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "errors.generic" };
  const { targetType, targetId, follow } = parsed.data;
  const supabase = await createClient();
  const { error } = follow
    ? await supabase
        .from("follows")
        .upsert(
          { user_id: viewer.id, newsroom_id: viewer.active.newsroomId, target_type: targetType, target_id: targetId },
          { onConflict: "user_id,target_type,target_id", ignoreDuplicates: true },
        )
    : await supabase.from("follows").delete().eq("user_id", viewer.id).eq("target_type", targetType).eq("target_id", targetId);
  if (error) return { ok: false, error: errorKey(error) };
  refresh();
  return { ok: true };
}

const questionSchema = z.string().trim().min(3).max(500);

/** Ask Isnad: the worker answers from approved registry figures only, and code checks every number. */
export async function askRegistry(question: string): Promise<ActionResult<AskAnswer>> {
  const viewer = await getViewer();
  if (!viewer?.active) return { ok: false, error: "errors.not_authenticated" };
  const parsed = questionSchema.safeParse(question);
  if (!parsed.success) return { ok: false, error: "registry.ask.tooShort" };
  try {
    const response = await fetch(`${env.workerApiUrl}/internal/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.internalApiToken}` },
      body: JSON.stringify({ question: parsed.data, newsroom_id: viewer.active.newsroomId }),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("askRegistry: worker responded", response.status);
      return { ok: false, error: "registry.ask.unavailable" };
    }
    return { ok: true, data: (await response.json()) as AskAnswer };
  } catch (error) {
    console.error("askRegistry: worker unreachable", error instanceof Error ? error.message : error);
    return { ok: false, error: "registry.ask.unavailable" };
  }
}
