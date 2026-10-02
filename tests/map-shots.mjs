/**
 * Captures the hotel map under several camera states so the georeferenced 3D
 * layer can be checked by eye — the part of TEST 9 a script cannot assert.
 *
 *   node tests/map-shots.mjs [baseUrl] [outDir]
 *
 * The camera is driven with real mouse input (wheel to zoom, right-drag to
 * pitch and rotate), which also exercises the same interaction path a guest
 * uses. A correctly anchored model stays on its patch of ground throughout.
 */

import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = process.argv[3] ?? "C:\\Users\\bliad\\AppData\\Local\\Temp\\mapshots";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const sql = neon(process.env.DATABASE_URL);
mkdirSync(OUT, { recursive: true });

const [hotel] = await sql`SELECT id, qr_token FROM hotels WHERE name LIKE 'Seaside Grand%'`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  defaultViewport: { width: 1000, height: 820, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.setDefaultTimeout(90000);
page.on("console", (m) => {
  if (m.type() === "error") console.log("  console error:", m.text().slice(0, 200));
});
page.on("pageerror", (e) => console.log("  pageerror:", e.message.slice(0, 200)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#username", "ratichak");
await page.type("#password", "01024072661");
await page.click('button[type="submit"]');
for (let i = 0; i < 180; i += 1) {
  if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
  await new Promise((r) => setTimeout(r, 500));
}

await page.goto(`${BASE}/unlock/${hotel.qr_token}`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 6000));
await page.goto(`${BASE}/hotels/${hotel.id}`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 10000));

const box = await page.evaluate(() => {
  const canvas = document.querySelector(".mapboxgl-canvas");
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
if (!box) throw new Error("No map canvas found");
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
console.log(`  map canvas ${Math.round(box.width)}x${Math.round(box.height)}`);

const settle = (ms = 2500) => new Promise((r) => setTimeout(r, ms));

async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  wrote ${name}.png`);
}

async function wheel(deltaY, times = 1) {
  await page.mouse.move(cx, cy);
  for (let i = 0; i < times; i += 1) {
    await page.mouse.wheel({ deltaY });
    await settle(400);
  }
  await settle();
}

/** Right-button drag is Mapbox's pitch/rotate gesture. */
async function rightDrag(dx, dy) {
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
  await page.mouse.up({ button: "right" });
  await settle();
}

async function leftDrag(dx, dy) {
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
  await page.mouse.up();
  await settle();
}

await shot("01-initial");

await wheel(-240, 5);
await shot("02-zoomed-in");

await wheel(-240, 4);
await shot("03-zoomed-in-more");

await rightDrag(0, -140);
await shot("04-pitched");

await rightDrag(260, 0);
await shot("05-rotated");

await leftDrag(-150, -90);
await shot("06-panned");

await wheel(240, 6);
await shot("07-zoomed-out");

await page.setViewport({ width: 700, height: 950, deviceScaleFactor: 1 });
await settle(3000);
await shot("08-resized");

await browser.close();
