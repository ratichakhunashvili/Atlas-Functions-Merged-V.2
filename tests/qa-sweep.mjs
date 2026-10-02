/**
 * Deep QA sweep. Visits every route as every role, records EVERY console
 * message, failed request, non-OK response, hydration warning and broken image,
 * and reports them grouped by page.
 *
 *   node tests/qa-sweep.mjs [baseUrl]
 *
 * Reports only; it changes no data beyond logging in.
 */

import { readFileSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const sql = neon(process.env.DATABASE_URL);

const findings = [];
function report(page, severity, kind, detail) {
  findings.push({ page, severity, kind, detail });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Noise that is not a defect in our code.
const IGNORE = [
  // Blob-hosted uploads can be slow to warm; a one-off image timeout is not a defect.
  /blob\.vercel-storage\.com/i,
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /\[HMR\]/i,
  /Input elements should have autocomplete/i,
  /WebGL.*deprecated/i,
  /Slow network is detected/i,
];
const isNoise = (text) => IGNORE.some((re) => re.test(text));

async function main() {
  const [hotel] = await sql`SELECT id, qr_token FROM hotels WHERE name LIKE 'Seaside Grand%'`;
  const [attraction] = await sql`SELECT id FROM attractions WHERE name = 'Alphabet Tower'`;
  const [partner] = await sql`SELECT id FROM partners WHERE name = 'Seaside Cafe'`;
  const [user] = await sql`SELECT id FROM users WHERE username = 'ratichak'`;
  const [guest] = await sql`SELECT id FROM users WHERE username = 'testguest'`;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
    defaultViewport: { width: 1400, height: 1000 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await browser.defaultBrowserContext().overridePermissions(BASE, ["geolocation"]);
  await page.setGeolocation({ latitude: 41.6478, longitude: 41.6338 });

  let currentPage = "(startup)";
  // Some routes are *supposed* to 404 — a missing place, an unknown path. Those
  // are correct behaviour, so they must not be reported as defects.
  let expecting404 = false;

  page.on("console", (m) => {
    const text = m.text();
    if (isNoise(text)) return;
    // The browser logs a console error for any 404 response; on a route that is
    // meant to 404 that is the expected outcome, not a defect.
    if (expecting404 && /Failed to load resource.*404/.test(text)) return;
    const type = m.type();
    if (type === "error") report(currentPage, "error", "console.error", text.slice(0, 400));
    else if (type === "warning") report(currentPage, "warn", "console.warn", text.slice(0, 400));
  });
  page.on("pageerror", (e) =>
    report(currentPage, "error", "uncaught exception", e.message.slice(0, 400)),
  );
  page.on("requestfailed", (r) => {
    const failure = r.failure()?.errorText ?? "";
    if (failure.includes("ERR_ABORTED")) return; // navigation cancellations
    report(currentPage, "error", "request failed", `${r.url().slice(0, 160)} — ${failure}`);
  });
  page.on("response", (r) => {
    const status = r.status();
    const url = r.url();
    if (expecting404 && status === 404) return;
    if (status >= 400 && !url.includes("/api/auth/")) {
      report(currentPage, "error", `HTTP ${status}`, url.slice(0, 160));
    }
  });

  async function visit(label, url, { settle = 1800, map = false, expect404 = false } = {}) {
    currentPage = expect404 ? `${label} [404 expected]` : label;
    expecting404 = expect404;
    try {
      await page.goto(url, {
        waitUntil: map ? "domcontentloaded" : "networkidle0",
        timeout: 70000,
      });
    } catch (error) {
      report(label, "error", "navigation", error.message.slice(0, 200));
      return;
    }
    await sleep(map ? 5000 : settle);

    // Broken <img> elements.
    const brokenImages = await page.evaluate(() =>
      [...document.querySelectorAll("img")]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute("src")?.slice(0, 120) ?? "(no src)"),
    );
    for (const src of brokenImages) report(label, "error", "broken image", src);

    // Images missing alt entirely (decorative alt="" is fine).
    const noAlt = await page.evaluate(
      () => [...document.querySelectorAll("img")].filter((i) => i.getAttribute("alt") === null).length,
    );
    if (noAlt > 0) report(label, "warn", "a11y", `${noAlt} <img> without an alt attribute`);

    // Form controls with no accessible name.
    const unlabelled = await page.evaluate(() =>
      [...document.querySelectorAll("input, select, textarea")].filter((el) => {
        if (el.type === "hidden") return false;
        if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
        if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
        return !el.closest("label");
      }).length,
    );
    if (unlabelled > 0) {
      report(label, "warn", "a11y", `${unlabelled} form control(s) without an accessible name`);
    }

    // Buttons with no discernible text.
    const namelessButtons = await page.evaluate(() =>
      [...document.querySelectorAll("button")].filter(
        (b) => !b.innerText.trim() && !b.getAttribute("aria-label"),
      ).length,
    );
    if (namelessButtons > 0) {
      report(label, "warn", "a11y", `${namelessButtons} button(s) with no label`);
    }

    // Horizontal overflow at desktop width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 4) report(label, "warn", "layout", `horizontal overflow of ${overflow}px`);
  }

  async function login(username, password) {
    currentPage = "login";
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
    await page.type("#username", username);
    await page.type("#password", password);
    await page.click('button[type="submit"]');
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if ((await page.cookies()).some((c) => c.name.includes("session-token"))) return true;
      await sleep(400);
    }
    report("login", "error", "auth", `could not sign in as ${username}`);
    return false;
  }

  async function logout() {
    await page.goto(`${BASE}/api/auth/signout`, { waitUntil: "networkidle0" });
    const button = await page.$('button[type="submit"]');
    if (button) {
      await button.click();
      await sleep(2000);
    }
    const cookies = await page.cookies();
    if (cookies.length) await page.deleteCookie(...cookies);
  }

  console.log("--- anonymous ---");
  await visit("/ (root)", `${BASE}/`);
  await visit("/login", `${BASE}/login`);
  await visit("/signup", `${BASE}/signup`);
  await visit("/gallery (anon -> login)", `${BASE}/gallery`);
  await visit("/admin (anon -> login)", `${BASE}/admin`);

  console.log("--- plain guest ---");
  await login("testguest", "testguest-local-only");
  await visit("/gallery (guest)", `${BASE}/gallery`);
  await visit("/profile (guest)", `${BASE}/profile`);
  await visit("/admin (guest, should bounce)", `${BASE}/admin`);
  await visit("/hotels/:id (guest, locked)", `${BASE}/hotels/${hotel.id}`, { map: true });
  await logout();

  console.log("--- admin ---");
  await login("ratichak", "01024072661");

  const routes = [
    ["/gallery", `${BASE}/gallery`, {}],
    ["/profile", `${BASE}/profile`, {}],
    ["/hotels/:id", `${BASE}/hotels/${hotel.id}`, { map: true }],
    ["/admin", `${BASE}/admin`, {}],
    ["/admin/hotels", `${BASE}/admin/hotels`, { settle: 3000 }],
    ["/admin/hotels/:id", `${BASE}/admin/hotels/${hotel.id}`, { settle: 4000 }],
    ["/admin/attractions", `${BASE}/admin/attractions`, { settle: 3000 }],
    ["/admin/attractions/:id", `${BASE}/admin/attractions/${attraction.id}`, { settle: 4000 }],
    ["/admin/partners", `${BASE}/admin/partners`, { settle: 3000 }],
    ["/admin/partners/:id", `${BASE}/admin/partners/${partner.id}`, { settle: 4000 }],
    ["/admin/achievements", `${BASE}/admin/achievements`, {}],
    ["/admin/models", `${BASE}/admin/models`, {}],
    ["/admin/qr-codes", `${BASE}/admin/qr-codes`, { settle: 6000 }],
    ["/admin/users", `${BASE}/admin/users`, {}],
    ["/admin/users/:id", `${BASE}/admin/users/${user.id}`, {}],
    ["/admin/users/:guest", `${BASE}/admin/users/${guest.id}`, {}],
    ["/admin/itineraries", `${BASE}/admin/itineraries`, {}],
    ["/admin/check-ins", `${BASE}/admin/check-ins`, {}],
  ];
  for (const [label, url, options] of routes) await visit(label, url, options);

  console.log("--- error / edge routes ---");
  await visit("/unlock/<garbage>", `${BASE}/unlock/not-a-real-token`, { settle: 6000 });
  await visit("/hotels/<bad uuid>", `${BASE}/hotels/00000000-0000-0000-0000-000000000000`, {
    expect404: true,
  });
  await visit(
    "/admin/hotels/<bad uuid>",
    `${BASE}/admin/hotels/00000000-0000-0000-0000-000000000000`,
    { expect404: true },
  );
  await visit("/nope", `${BASE}/nope`, { expect404: true });

  // The replacement 404 page must actually render, not just return the status.
  const notFoundBody = await page.evaluate(() => document.body.innerText);
  if (!notFoundBody.includes("We couldn't find that page")) {
    report("/nope", "error", "404 page", "custom not-found UI did not render");
  }
  if (!notFoundBody.includes("Back to your hotels")) {
    report("/nope", "error", "404 page", "no way back from the 404 page");
  }

  console.log("--- mobile viewport ---");
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  for (const [label, url, options] of [
    ["mobile /gallery", `${BASE}/gallery`, {}],
    ["mobile /hotels/:id", `${BASE}/hotels/${hotel.id}`, { map: true }],
    ["mobile /profile", `${BASE}/profile`, {}],
    ["mobile /admin", `${BASE}/admin`, {}],
    ["mobile /login", `${BASE}/login`, {}],
  ]) {
    await visit(label, url, options);
  }

  await browser.close();

  // ---------------------------------------------------------------- report
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");

  const lines = [];
  const byPage = new Map();
  for (const f of findings) {
    if (!byPage.has(f.page)) byPage.set(f.page, []);
    byPage.get(f.page).push(f);
  }
  for (const [pageName, items] of byPage) {
    lines.push(`\n## ${pageName}`);
    const seen = new Set();
    for (const item of items) {
      const key = `${item.kind}|${item.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const count = items.filter((i) => `${i.kind}|${i.detail}` === key).length;
      lines.push(
        `  [${item.severity.toUpperCase()}] ${item.kind}: ${item.detail}${count > 1 ? `  (x${count})` : ""}`,
      );
    }
  }

  const output = lines.join("\n");
  console.log(output);
  console.log(`\n${"=".repeat(70)}`);
  console.log(`ERRORS ${errors.length}   WARNINGS ${warnings.length}`);
  writeFileSync("qa-report.txt", output, "utf8");
  console.log("Full report written to qa-report.txt");
}

main();
