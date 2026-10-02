/**
 * TEST 10 — a place's 3D model must render grey while locked and in full
 * colour once the guest has unlocked it.
 *
 *   node tests/lock-state.mjs [baseUrl]
 *
 * The hotel's own model sits exactly at the map's centre, and an admin can open
 * a hotel page without having unlocked it — which gives a clean A/B at a fixed
 * camera position. The camera is moved only with the map's own zoom button, so
 * both captures frame the identical view.
 */

import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = "C:\\Users\\bliad\\AppData\\Local\\Temp\\mapshots";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const sql = neon(process.env.DATABASE_URL);
mkdirSync(OUT, { recursive: true });

const [hotel] = await sql`SELECT id FROM hotels WHERE name LIKE 'Seaside Grand%'`;
const [user] = await sql`SELECT id FROM users WHERE username = 'ratichak'`;

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

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#username", "ratichak");
await page.type("#password", "01024072661");
await page.click('button[type="submit"]');
for (let i = 0; i < 180; i += 1) {
  if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
  await new Promise((r) => setTimeout(r, 500));
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Captures the map at a fixed camera position.
 *
 * Mapbox does not preserve its WebGL drawing buffer, so `readPixels` comes back
 * empty — the composited screenshot is used instead and re-read through a 2D
 * canvas, which does give real pixels.
 */
async function capture(label) {
  await page.goto(`${BASE}/hotels/${hotel.id}`, { waitUntil: "domcontentloaded" });
  await settle(9000);

  // Zoom with the map's own control so both runs land on exactly the same view.
  for (let i = 0; i < 4; i += 1) {
    await page.click(".mapboxgl-ctrl-zoom-in");
    await settle(1200);
  }
  await settle(4000);

  await page.screenshot({ path: path.join(OUT, `lock-${label}.png`) });
  return page.screenshot({ encoding: "base64" });
}

/**
 * Compares the two captures. Only the pixels that actually CHANGED between
 * locked and unlocked are measured — those are the model itself, so the
 * surrounding map cannot dilute the result.
 */
async function compare(lockedShot, unlockedShot) {
  return page.evaluate(
    async (lockedUrl, unlockedUrl) => {
      const load = (b64) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${b64}`;
        });

      const [a, b] = await Promise.all([load(lockedUrl), load(unlockedUrl)]);
      const w = Math.min(a.width, b.width);
      const h = Math.min(a.height, b.height);

      const read = (img) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const lockedPixels = read(a);
      const unlockedPixels = read(b);

      const saturation = (r, g, b2) => {
        const max = Math.max(r, g, b2);
        const min = Math.min(r, g, b2);
        return max === 0 ? 0 : (max - min) / max;
      };

      let changed = 0;
      let lockedSat = 0;
      let unlockedSat = 0;
      for (let i = 0; i < lockedPixels.length; i += 4) {
        const dr = Math.abs(lockedPixels[i] - unlockedPixels[i]);
        const dg = Math.abs(lockedPixels[i + 1] - unlockedPixels[i + 1]);
        const db = Math.abs(lockedPixels[i + 2] - unlockedPixels[i + 2]);
        // Ignore noise from map label antialiasing.
        if (dr + dg + db < 30) continue;
        changed += 1;
        lockedSat += saturation(
          lockedPixels[i] / 255,
          lockedPixels[i + 1] / 255,
          lockedPixels[i + 2] / 255,
        );
        unlockedSat += saturation(
          unlockedPixels[i] / 255,
          unlockedPixels[i + 1] / 255,
          unlockedPixels[i + 2] / 255,
        );
      }

      return {
        changed,
        lockedSaturation: changed ? lockedSat / changed : 0,
        unlockedSaturation: changed ? unlockedSat / changed : 0,
      };
    },
    lockedShot,
    unlockedShot,
  );
}

console.log("Capturing with the hotel LOCKED (admin viewing without unlocking)...");
await sql`DELETE FROM hotel_unlocks WHERE user_id = ${user.id} AND hotel_id = ${hotel.id}`;
await sql`DELETE FROM place_check_ins WHERE user_id = ${user.id} AND place_type = 'hotel' AND place_id = ${hotel.id}`;
const lockedShot = await capture("locked");

console.log("Capturing with the hotel UNLOCKED...");
await sql`INSERT INTO hotel_unlocks (user_id, hotel_id) VALUES (${user.id}, ${hotel.id})
          ON CONFLICT DO NOTHING`;
const unlockedShot = await capture("unlocked");

const result = await compare(lockedShot, unlockedShot);
await browser.close();

console.log(`\n  pixels that changed: ${result.changed}`);
console.log(`  saturation while locked:   ${result.lockedSaturation.toFixed(4)}`);
console.log(`  saturation while unlocked: ${result.unlockedSaturation.toFixed(4)}`);

const delta = result.unlockedSaturation - result.lockedSaturation;
// A ratio, not an absolute delta: how saturated a model looks depends on its
// own colours, but "unlocked is markedly more colourful than locked" holds for
// any of them.
const ratio = result.lockedSaturation > 0
  ? result.unlockedSaturation / result.lockedSaturation
  : Infinity;
console.log(`  delta ${delta >= 0 ? "+" : ""}${delta.toFixed(4)}  (ratio ${ratio.toFixed(2)}x)`);

let failed = false;
if (result.changed < 200) {
  console.log("  FAIL  the model barely changed — locked and unlocked look the same");
  failed = true;
}
if (!(ratio >= 1.5 && delta > 0.01)) {
  console.log("  FAIL  the unlocked model is not meaningfully more colourful");
  failed = true;
}
if (!failed) {
  console.log("  PASS  the unlocked model renders in colour where the locked one is grey");
}
process.exit(failed ? 1 : 0);
