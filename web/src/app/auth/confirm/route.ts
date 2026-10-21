import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { inLocale, safeNext } from "@/lib/redirects";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["email", "magiclink", "invite", "recovery", "signup", "email_change"];

// Email links (magic link, invitation, password reset) land here with a token hash.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : "ar";
  const fallback = type === "recovery" ? `/${locale}/reset-password` : `/${locale}`;
  const next = inLocale(safeNext(searchParams.get("next"), fallback), locale);

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }
  // Keep where the link was going (e.g. an invitation) so signing in another way still lands there.
  const failed = new URL(`/${locale}/sign-in`, request.url);
  failed.searchParams.set("error", "link");
  if (next !== fallback) failed.searchParams.set("next", next);
  return NextResponse.redirect(failed);
}
