import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";

// Pages anyone can open. Everything else under a locale needs a session.
const PUBLIC_PAGES = [/^\/(sign-in|check-email|reset-password)(\/|$)/, /^\/invite\//, /^\/n\//];

function preferredLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const header = request.headers.get("accept-language") ?? "";
  return /^\s*en\b/i.test(header) ? "en" : defaultLocale;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Route handlers outside the locale tree (auth callbacks, API) only need the session refreshed.
  const isRouteHandler = pathname.startsWith("/auth/") || pathname.startsWith("/api/");

  const segment = pathname.split("/")[1];
  if (!isRouteHandler && !isLocale(segment)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${preferredLocale(request)}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  // Validates the session and refreshes it when the access token has expired.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  if (isRouteHandler) {
    return response;
  }

  const locale = segment as Locale;
  const rest = pathname.slice(locale.length + 1) || "/";
  const isPublic = PUBLIC_PAGES.some((pattern) => pattern.test(rest));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/sign-in`;
    url.search = rest === "/" ? "" : `?next=${encodeURIComponent(rest + search)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && /^\/(sign-in|check-email)(\/|$)/.test(rest)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/((?!_next/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest|woff2?|ttf|css|js|map|json|pdf|mp4|webm|mp3|m4a|wav|ogg)$).*)"],
};
