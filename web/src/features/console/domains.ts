/** "https://www.scad.gov.ae/en/x" → "scad.gov.ae"; null when it isn't a domain name. */
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].split(":")[0].replace(/^www\./, "").replace(/\.$/, "");
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ? host : null;
}

/** A URL-safe identifier from an English name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-|-$/g, "");
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
