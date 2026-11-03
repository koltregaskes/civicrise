// Headless console check: boot and one district played to its review (KOL-6951).
//
// Serves the built `out/` folder through Playwright request routing (no port),
// then fails on any console error or warning, uncaught page error, or failed
// or 404 same-origin request across three passes:
//   1. title screen boot (where the missing favicon used to 404);
//   2. title -> Scenarios -> North Quay, a fresh district run for 30 days;
//   3. the curated Rivergate review city resumed at 3x until the district
//      review ends (won or lost) and the scorecard shows.
// Page time runs on Playwright's fake clock, so in-game days pass quickly.
//
// Usage: npm run build && node scripts/playthrough-console.mjs [dir=out]
// Env:   PLAYWRIGHT_PREFIX    folder that holds node_modules/playwright, when
//                             Playwright is not a dependency of this repo.
//        SMOKE_CHROMIUM_PATH  optional Chromium executable.
//        PLAYTHROUGH_OUT      folder for screenshots (optional).
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? "out");
const requireFrom = createRequire(
  process.env.PLAYWRIGHT_PREFIX
    ? path.join(path.resolve(process.env.PLAYWRIGHT_PREFIX), "noop.js")
    : import.meta.url,
);
const { chromium } = requireFrom("playwright");

const ORIGIN = "https://civicrise.test";
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".map": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".woff2": "font/woff2",
};

async function serve(route) {
  const url = new URL(route.request().url());
  let rel = decodeURIComponent(url.pathname.slice(1));
  if (!rel || rel.endsWith("/")) rel += "index.html";
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return route.fulfill({ status: 403, body: "" });
  try {
    return route.fulfill({ status: 200, body: await readFile(file), contentType: types[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
  } catch {
    return route.fulfill({ status: 404, body: "not found" });
  }
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.SMOKE_CHROMIUM_PATH || undefined });
const passes = [];

async function openPage(query) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(`${ORIGIN}/**`, serve);
  // Off-site requests (web fonts) get an empty reply so the run stays offline.
  await context.route((u) => !u.href.startsWith(ORIGIN), (r) => r.fulfill({ status: 200, body: "" }));
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
  page.on("requestfailed", (r) => { if (r.url().startsWith(ORIGIN)) problems.push(`requestfailed: ${r.url()}`); });
  page.on("response", (r) => { if (r.url().startsWith(ORIGIN) && r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.clock.install();
  await page.goto(`${ORIGIN}/${query}`, { waitUntil: "load" });
  await page.clock.runFor(1500);
  return { context, page, problems };
}

const hudDay = (page) => page.evaluate(() => {
  const label = [...document.querySelectorAll(".micro-label")].find((n) => n.textContent.trim() === "Review");
  return label?.parentElement?.querySelector("span")?.textContent?.trim() ?? null;
});
const shot = async (page, name) => {
  if (process.env.PLAYTHROUGH_OUT) await page.screenshot({ path: path.join(process.env.PLAYTHROUGH_OUT, name) });
};

// 1. Title screen boot.
{
  const { context, page, problems } = await openPage("");
  const iconHref = await page.evaluate(() => document.querySelector('link[rel="icon"]')?.href ?? null);
  const iconStatus = iconHref ? (await page.request.fetch(iconHref).catch(() => null))?.status() ?? "fetch failed" : "no <link rel=icon>";
  // The routed origin answers page.request too, via the context route.
  const titleShown = await page.evaluate(() => document.body.innerText.includes("Civicrise"));
  await shot(page, "civicrise-title.png");
  passes.push({ name: "title screen boot", ok: titleShown && iconHref !== null, detail: `favicon ${iconHref ? iconHref.replace(ORIGIN, "") : "missing"} (${iconStatus})`, problems });
  await context.close();
}

// 2. Fresh North Quay district from the scenario picker, 30 in-game days.
{
  const { context, page, problems } = await openPage("");
  const scenariosButton = page.getByRole("button", { name: /scenario/i }).first();
  await scenariosButton.click();
  await page.locator(".scenario-card", { hasText: "North Quay" }).first().click();
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: "3x" }).click();
  const startDay = await hudDay(page);
  // 30 days at 3x is 30 / (0.19 * 3) ~ 53 s of page time.
  await page.clock.runFor(55_000);
  const endDay = await hudDay(page);
  await shot(page, "civicrise-north-quay.png");
  passes.push({ name: "North Quay fresh run, 30 days at 3x", ok: Boolean(startDay && endDay && startDay !== endDay), detail: `${startDay} -> ${endDay}`, problems });
  await context.close();
}

// 3. Rivergate review city resumed at 3x until the district review ends.
{
  const { context, page, problems } = await openPage("?autostart=1&review=1");
  const resume = page.getByRole("button", { name: "Resume" });
  if (await resume.count()) await resume.click();
  await page.getByRole("button", { name: "3x" }).click();
  const startDay = await hudDay(page);
  let outcome = null;
  for (let i = 0; i < 120 && !outcome; i += 1) {
    await page.clock.runFor(10_000);
    outcome = await page.evaluate(() => {
      const panel = document.querySelector(".outcome-panel");
      if (!panel) return null;
      return {
        label: panel.querySelector(".micro-label")?.textContent?.trim(),
        title: panel.querySelector("h2")?.textContent?.trim(),
        grade: panel.querySelector(".scorecard-grade")?.textContent?.trim(),
      };
    });
  }
  const endDay = await hudDay(page);
  await shot(page, "civicrise-rivergate-outcome.png");
  passes.push({ name: "Rivergate review district to its outcome", ok: Boolean(outcome), detail: `${startDay} -> ${endDay}: ${outcome ? `${outcome.label}, "${outcome.title}", grade ${outcome.grade}` : "no outcome within the time cap"}`, problems });
  await context.close();
}

await browser.close();
let failed = 0;
for (const p of passes) {
  const ok = p.ok && p.problems.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${p.name}: ${p.detail}; console errors/warnings, page errors and failed requests: ${p.problems.length}`);
  for (const line of p.problems.slice(0, 5)) console.log(`      ${line}`);
}
console.log(`${passes.length - failed} of ${passes.length} passes clean`);
process.exit(failed ? 1 : 0);
