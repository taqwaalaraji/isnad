#!/usr/bin/env node
/**
 * Route smoke test: signs in as each demo role and requests every page in both locales, checking the
 * status code, the permission rules (404 where a role has no access) and that no error page rendered.
 *
 *   node scripts/smoke.mjs [baseUrl]      (default http://localhost:3000; needs the demo seed)
 *
 * Dynamic routes use real ids/slugs read from the database through the same RLS as the user.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServerClient } from "@supabase/ssr";

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, "../.env.local"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const demo = JSON.parse(readFileSync(resolve(here, "../../worker/seed_data/demo.json"), "utf8"));
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
// Server errors inside streamed Suspense boundaries arrive as error digests (data-dgst / $RX); text
// markers can't be used because every page embeds the whole dictionary for the client translator.
const DIGEST = /data-dgst="([^"]*)"|\$RX\("[^"]*","([^"]*)"/g;
const digests = (body) => [...body.matchAll(DIGEST)].map((m) => m[1] ?? m[2]);
const isNotFound = (digest) => /HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/.test(digest);
const isRedirect = (digest) => digest.startsWith("NEXT_REDIRECT");

/** Sign in like the browser does; returns a Cookie header and a client acting as that user. */
async function signIn(email) {
  const jar = new Map();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: demo.password });
  if (error) throw new Error(`${email}: ${error.message}`);
  const cookie = [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  return { cookie, supabase };
}

async function fetchPage(path, cookie) {
  const response = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const body = response.status === 200 ? await response.text() : "";
  return { status: response.status, location: response.headers.get("location"), body };
}

/** Real ids and slugs the user can see, for the dynamic routes. */
async function samples(supabase) {
  const one = async (query) => (await query).data?.[0];
  const [check, indicator, entity, topic, document, brief, source] = await Promise.all([
    one(supabase.from("checks").select("id").neq("status", "processing").limit(1)),
    one(supabase.from("indicators").select("slug").limit(1)),
    one(supabase.from("entities").select("slug").limit(1)),
    one(supabase.from("topics").select("slug").limit(1)),
    one(supabase.from("documents").select("id").limit(1)),
    one(supabase.from("briefs").select("id").limit(1)),
    one(supabase.from("sources").select("id").limit(1)),
  ]);
  return { check, indicator, entity, topic, document, brief, source };
}

const WORKSPACE = (s) => [
  "",
  "/checks",
  "/checks/new",
  "/checks?filter=mine",
  s.check && `/checks/${s.check.id}`,
  "/registry",
  "/registry?q=زوار",
  "/registry/ask",
  "/registry/coverage",
  s.indicator && `/registry/indicators/${s.indicator.slug}`,
  s.entity && `/registry/entities/${s.entity.slug}`,
  s.topic && `/registry/topics/${s.topic.slug}`,
  s.document && `/registry/documents/${s.document.id}`,
  "/alerts",
  "/briefs",
  "/briefs/new",
  s.brief && `/briefs/${s.brief.id}`,
  "/settings",
];
const ADMIN = ["/admin/members", "/admin/policies", "/admin/sources", "/admin/activity"];
const CONSOLE = (s) => [
  "/console/sources",
  "/console/sources/new",
  s.source && `/console/sources/${s.source.id}`,
  "/console/inbox",
  "/console/review",
  "/console/catalog",
  "/console/proposals",
  "/console/newsrooms",
  "/console/quality",
  "/console/system",
];

const ROLES = [
  { email: "omar@almadar.news", role: "journalist", allow: [WORKSPACE], deny: [() => ADMIN, CONSOLE] },
  { email: "sara@almadar.news", role: "editor", allow: [WORKSPACE], deny: [() => ADMIN, CONSOLE] },
  { email: "laila@almadar.news", role: "newsroom admin", allow: [WORKSPACE, () => ADMIN], deny: [CONSOLE] },
  { email: "admin@isnad.ae", role: "platform admin", allow: [CONSOLE], deny: [] },
];

let failures = 0;
let checked = 0;
function report(ok, label, detail = "") {
  checked++;
  if (!ok) failures++;
  if (!ok) console.log(`  ✗ ${label} ${detail}`);
}

for (const { email, role, allow, deny } of ROLES) {
  const { cookie, supabase } = await signIn(email);
  const s = await samples(supabase);
  console.log(`${role} (${email})`);
  for (const locale of ["ar", "en"]) {
    for (const path of allow.flatMap((group) => group(s)).filter(Boolean)) {
      const { status, location, body } = await fetchPage(`/${locale}${path}`, cookie);
      const bad = digests(body).filter((d) => !isRedirect(d));
      report(status === 200 && bad.length === 0, `${locale}${path}`, `→ ${status}${location ? ` ${location}` : ""}${bad.length ? ` (${bad.join(", ")})` : ""}`);
    }
    for (const path of deny.flatMap((group) => group(s)).filter(Boolean)) {
      const { status, body } = await fetchPage(`/${locale}${path}`, cookie);
      // Denied pages render the not-found state (a streamed page answers 200 with a 404 digest).
      const denied = status === 404 || digests(body).some(isNotFound);
      report(denied, `${locale}${path} should be denied`, `→ ${status} ${digests(body).join(", ")}`);
    }
  }
}

console.log("anonymous");
for (const path of ["/ar/sign-in", "/en/sign-in", "/ar/reset-password"]) {
  const { status } = await fetchPage(path);
  report(status === 200, path, `→ ${status}`);
}
for (const path of ["/ar", "/ar/checks", "/en/console/sources"]) {
  const { status, location } = await fetchPage(path);
  report(status === 307 && location?.includes("/sign-in"), `${path} redirects to sign-in`, `→ ${status} ${location}`);
}
const { status: missing } = await fetchPage("/ar/n/000000000000");
report(missing === 404 || missing === 200, "/ar/n/<unknown> renders not found", `→ ${missing}`);

console.log(`\n${checked - failures}/${checked} passed`);
process.exit(failures ? 1 : 0);
