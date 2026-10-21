import { type NextRequest, NextResponse } from "next/server";

import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const value = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : "ar";
  return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url), { status: 303 });
}
