import { type NextRequest, NextResponse } from "next/server";

import { getViewer } from "@/lib/auth";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

/**
 * A token can outlive its account (user removed, profile missing). Pages send such sessions here to clear them;
 * a valid session is left alone, so this link can't be used to sign anyone out.
 */
export async function GET(request: NextRequest) {
  if (!(await getViewer())) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  const value = request.nextUrl.searchParams.get("locale") ?? request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : "ar";
  return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
}
