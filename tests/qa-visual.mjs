/** Captures every key screen at desktop and phone width, light and dark, for visual review. */
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "C:\\Users\\bliad\\AppData\\Local\\Temp\\qa-visual";
mkdirSync(OUT, { recursive: true });

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const sql = neon(process.env.DATABASE_URL);
const [hotel] = await sql`SELECT id FROM hotels WHERE name LIKE 'Seaside Grand%'`;
const [attraction] = await sql`SELECT id FROM attractions WHERE name = 'Alphabet Tower'`;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1400, height: 1000 },
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await browser.defaultBrowserContext().overridePermissions(BASE, ["geolocation"]);
await page.setGeolocation({ latitude: 41.6478, longitude: 41.6338 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#username", "ratichak");
await page.type("#password", "01024072661");
await page.click('button[type="submit"]');
for (let i = 0; i < 200; i++) {
  if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
  await sleep(400);
}

const screens = [
  ["gallery", `${BASE}/gallery`, false],
  ["hotel", `${BASE}/hotels/${hotel.id}`, true],
  ["profile", `${BASE}/profile`, false],
  ["admin-dashboard", `${BASE}/admin`, false],
  ["admin-hotels", `${BASE}/admin/hotels`, true],
  ["admin-hotel-detail", `${BASE}/admin/hotels/${hotel.id}`, true],
  ["admin-attraction-detail", `${BASE}/admin/attractions/${attraction.id}`, true],
  ["admin-achievements", `${BASE}/admin/achievements`, false],
  ["admin-models", `${BASE}/admin/models`, false],
  ["admin-users", `${BASE}/admin/users`, false],
  ["admin-qr", `${BASE}/admin/qr-codes`, true],
  ["admin-checkins", `${BASE}/admin/check-ins`, false],
  ["notfound", `${BASE}/this-page-does-not-exist`, false],
];

async function capture(prefix, width, height, scheme) {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await page.setViewport({ width, height, isMobile: width < 500, hasTouch: width < 500 });
  for (const [name, url, heavy] of screens) {
    try {
      await page.goto(url, { waitUntil: heavy ? "domcontentloaded" : "networkidle0", timeout: 70000 });
    } catch {
      /* captured anyway */
    }
    await sleep(heavy ? 6000 : 2000);
    await page.screenshot({
      path: path.join(OUT, `${prefix}-${name}.png`),
      fullPage: width < 500,
    });
    console.log(`  ${prefix}-${name}.png`);
  }
}

await capture("desktop-light", 1400, 1000, "light");
await capture("mobile-light", 390, 844, "light");
await capture("desktop-dark", 1400, 1000, "dark");

await browser.close();
console.log(`\nScreens written to ${OUT}`);
