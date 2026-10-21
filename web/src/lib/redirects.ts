import { env } from "@/lib/env";

/**
 * A safe in-app path from a `next` parameter (same-origin only), or the fallback. The result is
 * percent-encoded: redirects go out in a header, which can't carry raw Arabic text.
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  try {
    if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
      const url = new URL(next, "http://in-app.invalid");
      if (url.host !== "in-app.invalid") return fallback;
      return url.pathname + url.search + url.hash;
    }
    const url = new URL(next);
    const site = new URL(env.siteUrl);
    if (url.origin === site.origin) return url.pathname + url.search + url.hash;
  } catch {
    // Not a URL: fall through to the fallback.
  }
  return fallback;
}

/** Prefix an in-app path with the locale when it lacks one (the proxy passes `next` without it). */
export function inLocale(path: string, locale: string): string {
  if (/^\/(ar|en)(\/|$|\?)/.test(path) || /^\/(auth|api)\//.test(path)) return path;
  return `/${locale}${path === "/" ? "" : path}`;
}
