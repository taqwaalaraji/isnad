import { type NextRequest, NextResponse } from "next/server";

import { actionLabel } from "@/features/admin/activity-labels";
import { getViewer } from "@/lib/auth";
import { isLocale } from "@/lib/i18n/config";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Quote everything; neutralize spreadsheet formulas.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The newsroom's activity log (last 500 entries) as CSV, for admins. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer?.active || viewer.active.role !== "admin") return new NextResponse("Not found", { status: 404 });
  const raw = request.nextUrl.searchParams.get("locale");
  const locale = isLocale(raw) ? raw : viewer.locale;
  const t = await getT(locale);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("newsroom_activity", { target_newsroom: viewer.active.newsroomId, page_size: 500 });
  if (error) return new NextResponse("Error", { status: 500 });

  const header = [t("admin.activity.when"), t("admin.activity.who"), t("admin.activity.what"), t("admin.activity.target")];
  const lines = [header, ...(data ?? []).map((r) => [r.at, r.user_name ?? "", actionLabel(r.action, t), r.target_title ?? ""])];
  const body = "﻿" + lines.map((cols) => cols.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="isnad-activity-${viewer.active.newsroomSlug}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
