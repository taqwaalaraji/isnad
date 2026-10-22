#!/usr/bin/env node
/**
 * Product screenshots for screenshots/ (listed in screenshots/README.md): signs in as the demo roles and
 * captures the main screens in Arabic with the light theme, plus a few in English, dark and on a phone.
 * Opens dialogs only to show them (Escape closes them): nothing is saved, except Ask Isnad's question.
 *
 *   node scripts/screenshots.mjs [baseUrl] [name-filter]
 *     (default http://localhost:3000; needs `make seed-demo`, the worker API for Ask Isnad, and Chrome
 *      from `npx playwright install chromium`)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../screenshots");
const env = Object.fromEntries(
  readFileSync(resolve(here, "../.env.local"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
);
// The environment wins over .env.local, to shoot the app running against another Supabase.
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
  if (process.env[key]) env[key] = process.env[key];
}
const demo = JSON.parse(
  readFileSync(resolve(here, "../../worker/seed_data/demo.json"), "utf8"),
);
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const ONLY = process.argv[3] ?? "";

// The demo items the screenshots show.
const CHECK = "تقرير: التجارة الخارجية غير النفطية في النصف الأول 2026"; // the Sky News report
const ARTICLE = "خبر: السياحة والسكان في الإمارات"; // a published article with a difference
const DOCUMENT_URL = "%approaches-aed2-trillion%"; // the Dubai Media Office release behind 453bn

/** Session cookies for a demo user (the same sign-in as the browser) and a client acting as them. */
async function session(email) {
  const jar = new Map();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) =>
          cookies.forEach(({ name, value }) =>
            value ? jar.set(name, value) : jar.delete(name),
          ),
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: demo.password,
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  const { hostname } = new URL(BASE);
  return {
    supabase,
    cookies: [...jar].map(([name, value]) => ({
      name,
      value,
      domain: hostname,
      path: "/",
    })),
  };
}

// The screenshots in reading order; the number in each file name is its place here. "check-processing" is
// a frame of the demo recording (a check must be running to show it), not taken by this script.
const ORDER = [
  "sign-in",
  "home",
  "new-check",
  "check-processing",
  "checks",
  "check-video-and-numbers",
  "check-match-evidence",
  "check-different-context",
  "check-no-source",
  "check-differs-article",
  "check-differs-evidence",
  "check-transcript",
  "editor-edit-wording",
  "editor-escalate",
  "public-evidence-page",
  "registry",
  "registry-topic",
  "registry-indicator",
  "registry-document",
  "registry-entity",
  "registry-coverage",
  "ask-isnad",
  "brief-new",
  "brief",
  "alerts",
  "settings-telegram",
  "admin-members",
  "admin-policies",
  "admin-private-sources",
  "admin-activity",
  "console-sources",
  "console-inbox",
  "console-figure-review",
  "console-catalog",
  "console-newsrooms",
  "console-quality",
  "console-system",
  "check-english",
  "check-dark",
  "public-evidence-page-phone",
  "check-phone",
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
mkdirSync(OUT, { recursive: true });
let taken = 0;

/** A browser page for a user (or anonymous), with a theme, locale and viewport. */
async function open(email, { theme = "light", phone = false } = {}) {
  const context = await browser.newContext({
    viewport: phone
      ? { width: 390, height: 844 }
      : { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: "ar-AE",
    timezoneId: "Asia/Dubai",
    colorScheme: theme,
    isMobile: phone,
    hasTouch: phone,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem("isnad-theme", t);
    } catch {}
  }, theme);
  if (email) await context.addCookies((await session(email)).cookies);
  return context.newPage();
}

async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
}

async function shot(page, slug) {
  const name = `${String(ORDER.indexOf(slug) + 1).padStart(2, "0")}-${slug}`;
  if (ORDER.indexOf(slug) < 0) throw new Error(`${slug} is not in ORDER`);
  if (ONLY && !name.includes(ONLY)) return;
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${OUT}/${name}.jpg`,
    type: "jpeg",
    quality: 88,
  });
  taken += 1;
  console.log(`  ${name}.jpg`);
}

async function select(page, number) {
  await page.getByRole("button", { name: number }).first().click();
  await page.waitForTimeout(900);
}

async function scrollTo(page, locator) {
  await locator.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
}

const { supabase } = await session("sara@almadar.news");
const one = async (query) => (await query).data?.[0];
const check = await one(
  supabase.from("checks").select("id").eq("title", CHECK),
);
const article = await one(
  supabase.from("checks").select("id, public_slug").eq("title", ARTICLE),
);
const document = await one(
  supabase.from("documents").select("id").like("url", DOCUMENT_URL),
);
const brief = await one(
  supabase
    .from("briefs")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1),
);
if (!check || !article || !document)
  throw new Error("demo data missing: run `make seed-demo`");

// Anonymous: sign-in and the public evidence page.
{
  const page = await open(null);
  await go(page, "/ar/sign-in");
  await shot(page, "sign-in");
  if (article.public_slug) {
    await go(page, `/ar/n/${article.public_slug}`);
    await shot(page, "public-evidence-page");
  }
  await page.context().close();
}

// Editor (Sara, غرفة المدار): the newsroom.
{
  const page = await open("sara@almadar.news");
  await go(page, "/ar");
  await shot(page, "home");
  await go(page, "/ar/checks/new");
  await shot(page, "new-check");
  await go(page, "/ar/checks");
  await shot(page, "checks");

  await go(page, `/ar/checks/${check.id}`);
  await select(page, /453 مليار/);
  await shot(page, "check-video-and-numbers");
  await scrollTo(page, page.locator("blockquote"));
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(500);
  await shot(page, "check-match-evidence");
  await select(page, /الصادرات غير النفطية شكلت 23%/);
  await scrollTo(page, page.getByRole("table"));
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(500);
  await shot(page, "check-different-context");
  await select(page, /17 اتفاقية/);
  await page.mouse.wheel(0, 520);
  await page.waitForTimeout(600);
  await shot(page, "check-no-source");
  await page.getByRole("tab", { name: "التفريغ" }).click();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "check-transcript");
  await page.getByRole("tab", { name: /الأرقام/ }).click();
  await select(page, /تريليون درهم بالنصف الاول من 2022/); // still undecided in the demo
  await page.getByRole("button", { name: "تعديل", exact: true }).last().click();
  await page.waitForTimeout(800);
  await shot(page, "editor-edit-wording");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "إحالة", exact: true }).last().click();
  await page.waitForTimeout(800);
  await shot(page, "editor-escalate");
  await page.keyboard.press("Escape");

  await go(page, `/ar/checks/${article.id}`);
  await select(page, /95\.2 مليون مسافر/);
  await shot(page, "check-differs-article");
  await scrollTo(page, page.getByRole("table"));
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(500);
  await shot(page, "check-differs-evidence");

  await go(page, "/ar/registry");
  await shot(page, "registry");
  await go(page, "/ar/registry/topics/trade");
  await shot(page, "registry-topic");
  await go(page, "/ar/registry/indicators/non-oil-trade");
  await shot(page, "registry-indicator");
  await go(page, `/ar/registry/documents/${document.id}`);
  await shot(page, "registry-document");
  await go(page, "/ar/registry/entities/dubai-media-office");
  await shot(page, "registry-entity");
  await go(page, "/ar/registry/coverage");
  await shot(page, "registry-coverage");

  if (!ONLY || "ask-isnad".includes(ONLY)) {
    await go(page, "/ar/registry/ask");
    await page
      .getByRole("textbox")
      .first()
      .fill("كم بلغ عدد الزوار الدوليين لدبي في 2025؟");
    await page.keyboard.press("Enter");
    await page
      .getByText(/19\.59/)
      .first()
      .waitFor({ timeout: 120000 })
      .catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "ask-isnad");
  }
  await go(page, "/ar/briefs/new");
  await shot(page, "brief-new");
  if (brief) {
    await go(page, `/ar/briefs/${brief.id}`);
    await shot(page, "brief");
  }
  await go(page, "/ar/alerts");
  await shot(page, "alerts");
  await go(page, "/ar/settings");
  await page.getByRole("tab", { name: "القنوات" }).click();
  await page.waitForTimeout(700);
  await shot(page, "settings-telegram");
  await page.context().close();
}

// Newsroom admin (Laila).
{
  const page = await open("laila@almadar.news");
  for (const [path, name] of [
    ["/ar/admin/members", "admin-members"],
    ["/ar/admin/policies", "admin-policies"],
    ["/ar/admin/sources", "admin-private-sources"],
    ["/ar/admin/activity", "admin-activity"],
  ]) {
    await go(page, path);
    await shot(page, name);
  }
  await page.context().close();
}

// Isnad team (platform admin).
{
  const page = await open("admin@isnad.ae");
  for (const [path, name] of [
    ["/ar/console/sources", "console-sources"],
    ["/ar/console/inbox", "console-inbox"],
    ["/ar/console/review", "console-figure-review"],
    ["/ar/console/catalog", "console-catalog"],
    ["/ar/console/newsrooms", "console-newsrooms"],
    ["/ar/console/quality", "console-quality"],
    ["/ar/console/system", "console-system"],
  ]) {
    await go(page, path);
    await shot(page, name);
  }
  await page.context().close();
}

// The same product in English, in the dark theme, and on a phone.
{
  const page = await open("sara@almadar.news");
  await go(page, `/en/checks/${check.id}`);
  await select(page, /453 billion|453/);
  await shot(page, "check-english");
  await page.context().close();
}
{
  const page = await open("sara@almadar.news", { theme: "dark" });
  await go(page, `/ar/checks/${check.id}`);
  await select(page, /453 مليار/);
  await shot(page, "check-dark");
  await page.context().close();
}
{
  const page = await open(null, { phone: true });
  if (article.public_slug) {
    await go(page, `/ar/n/${article.public_slug}`);
    await shot(page, "public-evidence-page-phone");
  }
  await page.context().close();
}
{
  const page = await open("sara@almadar.news", { phone: true });
  await go(page, `/ar/checks/${check.id}`);
  await shot(page, "check-phone");
  await page.context().close();
}

await browser.close();
console.log(`${taken} screenshots in ${OUT}`);
