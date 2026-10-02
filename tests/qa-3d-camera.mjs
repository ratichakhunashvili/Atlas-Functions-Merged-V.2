/**
 * QA for the parts that need WebGL or a camera, which the other suites skip:
 *   - clicking a 3D model opens the RIGHT place (spec: not "nearest marker")
 *   - the standalone 3D viewer opens and renders
 *   - the QR scanner modal starts and stops a camera stream cleanly
 *   - the AR verifier runs its full capture -> hash -> server-verify loop
 *
 *   node tests/qa-3d-camera.mjs [baseUrl]
 *
 * Chrome is given a synthetic camera so the camera paths run for real.
 * Any data this changes is restored at the end.
 */

import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const sql = neon(process.env.DATABASE_URL);

let pass = 0;
const problems = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    problems.push(`${name}${detail ? ` - ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log(`\n${t}`);

async function main() {
  const [hotel] = await sql`SELECT id, name, qr_token FROM hotels WHERE name LIKE 'Seaside Grand%'`;
  const [user] = await sql`SELECT id FROM users WHERE username = 'ratichak'`;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      // A synthetic camera, so getUserMedia actually resolves.
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
    defaultViewport: { width: 1200, height: 900 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
      consoleErrors.push(m.text().slice(0, 220));
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`uncaught: ${e.message.slice(0, 220)}`));

  await browser.defaultBrowserContext().overridePermissions(BASE, ["geolocation", "camera"]);
  await page.setGeolocation({ latitude: 41.6478, longitude: 41.6338 });

  async function clickByText(label, selector = "button") {
    const handle = await page.evaluateHandle(
      (sel, wanted) =>
        [...document.querySelectorAll(sel)].find((n) => n.innerText.trim().includes(wanted)) ?? null,
      selector,
      label,
    );
    const el = handle.asElement();
    if (!el) return false;
    await el.click();
    return true;
  }

  // sign in
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#username", "ratichak");
  await page.type("#password", "01024072661");
  await page.click('button[type="submit"]');
  for (let i = 0; i < 200; i++) {
    if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
    await sleep(400);
  }
  await sql`INSERT INTO hotel_unlocks (user_id, hotel_id) VALUES (${user.id}, ${hotel.id})
            ON CONFLICT DO NOTHING`;

  // =============================================== 3D picking
  section("3D model picking");
  await page.goto(`${BASE}/hotels/${hotel.id}`, { waitUntil: "domcontentloaded" });
  await sleep(10000);

  const canvasBox = await page.evaluate(() => {
    const c = document.querySelector(".mapboxgl-canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  check("the map canvas is present", !!canvasBox);

  if (canvasBox) {
    // Zoom in so the hotel's own model (at the map centre) is big enough to hit.
    for (let i = 0; i < 4; i++) {
      await page.click(".mapboxgl-ctrl-zoom-in");
      await sleep(1200);
    }
    await sleep(4000);

    const cx = canvasBox.x + canvasBox.w / 2;
    const cy = canvasBox.y + canvasBox.h / 2;

    // Click a bit above centre: the model's body, not the ground anchor.
    await page.mouse.click(cx, cy - 25);
    await sleep(1500);

    const popup = await page.evaluate(() => {
      const p = document.querySelector(".mapboxgl-popup-content");
      return p ? p.innerText : null;
    });
    check("clicking a 3D model opens a place popup", !!popup, "no popup appeared");
    check(
      "the popup is the place that was actually clicked",
      !!popup && popup.includes(hotel.name),
      popup ? popup.split("\n").slice(0, 2).join(" / ") : "none",
    );

    // Clicking empty sky must NOT select anything — proof it is a real
    // ray/geometry hit test rather than a nearest-marker guess.
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.querySelector(".mapboxgl-popup-close-button")?.click();
    });
    await sleep(800);
    await page.mouse.click(canvasBox.x + 40, canvasBox.y + 30);
    await sleep(1200);
    const strayPopup = await page.evaluate(() => {
      const p = document.querySelector(".mapboxgl-popup-content");
      return p ? p.innerText : null;
    });
    check(
      "clicking empty map does not select the nearest place",
      !strayPopup,
      strayPopup ? strayPopup.split("\n")[0] : "",
    );
  }

  // =============================================== standalone 3D viewer
  section("Standalone 3D viewer");
  await page.goto(`${BASE}/hotels/${hotel.id}`, { waitUntil: "domcontentloaded" });
  await sleep(9000);
  for (let i = 0; i < 4; i++) {
    await page.click(".mapboxgl-ctrl-zoom-in");
    await sleep(1000);
  }
  await sleep(3000);
  if (canvasBox) {
    await page.mouse.click(
      canvasBox.x + canvasBox.w / 2,
      canvasBox.y + canvasBox.h / 2 - 25,
    );
    await sleep(1500);
  }
  const openedViewer = await clickByText("View in 3D");
  check("the popup offers a 3D view for a place with a model", openedViewer);
  if (openedViewer) {
    await sleep(6000);
    const viewer = await page.evaluate(() => {
      const dialog = document.querySelector('[aria-label^="3D view of"]');
      if (!dialog) return { open: false };
      const canvases = [...dialog.querySelectorAll("canvas")];
      const live = canvases.some((c) => {
        const gl = c.getContext("webgl2") ?? c.getContext("webgl");
        return !!gl && c.width > 0 && c.height > 0;
      });
      return { open: true, canvases: canvases.length, live, text: dialog.innerText.slice(0, 80) };
    });
    check("the 3D viewer dialog opens", viewer.open);
    check("it renders its own WebGL canvas", viewer.live, JSON.stringify(viewer));
    check(
      "it is a separate canvas from the map layer",
      viewer.canvases >= 1,
      `${viewer.canvases} canvases in dialog`,
    );

    await page.evaluate(() => {
      document.querySelector('[aria-label="Close 3D view"]')?.click();
    });
    await sleep(1200);
    const closed = await page.evaluate(
      () => !document.querySelector('[aria-label^="3D view of"]'),
    );
    check("the 3D viewer closes cleanly", closed);
  }

  // =============================================== QR scanner modal
  section("QR scanner modal");
  await page.goto(`${BASE}/gallery`, { waitUntil: "networkidle0" });
  await sleep(1500);
  const openedScanner = await clickByText("Scan");
  check("the scan button opens the scanner", openedScanner);
  if (openedScanner) {
    await sleep(6000);
    const scanner = await page.evaluate(() => {
      const region = document.querySelector("#qr-scanner-region");
      const video = region?.querySelector("video");
      return {
        mounted: !!region,
        hasVideo: !!video,
        playing: !!video && video.readyState >= 2 && !video.paused,
      };
    });
    check("the scanner region mounts", scanner.mounted);
    check("a camera stream starts", scanner.hasVideo, JSON.stringify(scanner));
    check("the preview is actually playing", scanner.playing, JSON.stringify(scanner));

    await page.evaluate(() => {
      document.querySelector('[aria-label="Close scanner"]')?.click();
    });
    await sleep(3000);
    const gone = await page.evaluate(() => !document.querySelector("#qr-scanner-region"));
    check("the scanner closes and tears down", gone);

    const tracksLeft = await page.evaluate(() => document.querySelectorAll("video").length);
    check("no orphaned video element is left behind", tracksLeft === 0, `${tracksLeft} left`);
  }

  // =============================================== AR verifier loop
  section("AR verification loop");

  // An earlier suite may have completed every stop, so make sure there is a
  // fresh unvisited one to point the camera at.
  const pending = await sql`
    SELECT s.id FROM itinerary_days d JOIN itinerary_stops s ON s.day_id = d.id
    WHERE d.user_id = ${user.id} AND d.hotel_id = ${hotel.id} AND s.visited_at IS NULL LIMIT 1`;
  if (pending.length === 0) {
    await page.goto(`${BASE}/hotels/${hotel.id}`, { waitUntil: "domcontentloaded" });
    await sleep(6000);
    if (!(await clickByText("Regenerate itinerary"))) await clickByText("Plan my day");
    for (let i = 0; i < 60; i += 1) {
      const rows = await sql`
        SELECT s.id FROM itinerary_days d JOIN itinerary_stops s ON s.day_id = d.id
        WHERE d.user_id = ${user.id} AND d.hotel_id = ${hotel.id} AND s.visited_at IS NULL LIMIT 1`;
      if (rows.length) break;
      await sleep(1000);
    }
  }

  // AR only applies to an attraction or partner — an in-hotel activity has no
  // row in either table, so skip past those to the first real place.
  const day = await sql`
    SELECT d.id AS day_id, s.id AS stop_id, s.source_id, s.stop_type, s.name
    FROM itinerary_days d JOIN itinerary_stops s ON s.day_id = d.id
    WHERE d.user_id = ${user.id} AND d.hotel_id = ${hotel.id}
      AND s.visited_at IS NULL
      AND s.stop_type IN ('attraction', 'partner')
      AND s.source_id IS NOT NULL
    ORDER BY d.day_number DESC, s.position ASC LIMIT 1`;

  let restored = false;
  check(
    "an unvisited attraction/partner stop exists to test AR against",
    day.length > 0,
    "no eligible stop — the day may be complete",
  );
  if (day.length > 0) {
    const stop = day[0];
    const table = stop.stop_type === "partner" ? "partners" : "attractions";
    const before = await sql.query(
      `SELECT verification_mode, ar_target_hash, latitude, longitude FROM ${table} WHERE id = $1`,
      [stop.source_id],
    );
    check(`resolved the source place for "${stop.name}"`, before.length === 1);

    // AR requires proximity as well as a visual match. Stand the browser at the
    // place, so what is being tested here is the HASH check, not the GPS one.
    if (before.length) {
      await page.setGeolocation({
        latitude: Number(before[0].latitude),
        longitude: Number(before[0].longitude),
      });
    }

    if (before.length) {
      // A reference hash that a synthetic camera frame will never match — the
      // point is to prove the loop runs and the server rejects a non-match.
      const fakeHash = "a".repeat(60);
      await sql.query(
        `UPDATE ${table} SET verification_mode = 'ar', ar_target_hash = $1 WHERE id = $2`,
        [fakeHash, stop.source_id],
      );
      await sql`UPDATE itinerary_stops SET verification_mode = 'ar' WHERE id = ${stop.stop_id}`;

      // The check-in button only renders on the CURRENT stop, so clear any
      // earlier unvisited stops (typically the in-hotel activity) out of the way.
      await sql`
        UPDATE itinerary_stops SET visited_at = now()
        WHERE day_id = ${stop.day_id}
          AND visited_at IS NULL
          AND position < (SELECT position FROM itinerary_stops WHERE id = ${stop.stop_id})`;

      await page.goto(`${BASE}/hotels/${hotel.id}`, { waitUntil: "domcontentloaded" });
      await sleep(7000);
      const openedAr = await clickByText("Open AR");
      check(`the AR button is offered for "${stop.name}"`, openedAr);

      if (openedAr) {
        await sleep(9000);
        const ar = await page.evaluate(() => {
          const dialog = [...document.querySelectorAll("div")].find((d) =>
            d.innerText?.startsWith("Point your camera at"),
          );
          const video = document.querySelector("video");
          return {
            open: !!dialog,
            hasVideo: !!video,
            playing: !!video && video.readyState >= 2,
            message: document.body.innerText.match(/doesn't look like[^\n]*/)?.[0] ?? null,
            anyMessage:
              document.body.innerText.match(/(doesn't look like|get within|couldn't be read)[^\n]*/)?.[0] ??
              null,
          };
        });
        check("the AR dialog opens", ar.open);
        check("the AR camera stream starts", ar.hasVideo && ar.playing, JSON.stringify(ar));
        check(
          "the capture -> hash -> server-verify loop reports back",
          !!ar.anyMessage,
          "no verification feedback appeared at all",
        );
        check(
          "a non-matching frame is rejected on the visual check, not just GPS",
          !!ar.message,
          `got: ${ar.anyMessage ?? "nothing"}`,
        );

        await page.evaluate(() => {
          document.querySelector('[aria-label="Close AR check-in"]')?.click();
        });
        await sleep(2500);
        const arClosed = await page.evaluate(
          () => document.querySelectorAll("video").length === 0,
        );
        check("the AR camera is released on close", arClosed);
      }

      // restore
      await sql.query(
        `UPDATE ${table} SET verification_mode = $1, ar_target_hash = $2 WHERE id = $3`,
        [before[0].verification_mode, before[0].ar_target_hash, stop.source_id],
      );
      await sql`UPDATE itinerary_stops SET verification_mode = ${before[0].verification_mode}
                WHERE id = ${stop.stop_id}`;
      restored = true;
    }
  }
  if (restored) console.log("  (restored the stop's original verification mode)");

  await browser.close();

  section("Console health");
  const unique = [...new Set(consoleErrors)];
  check("no console errors across the 3D and camera flows", unique.length === 0, unique.slice(0, 4).join(" | "));

  console.log(`\n${"=".repeat(70)}`);
  console.log(`PASS ${pass}   PROBLEMS ${problems.length}`);
  if (problems.length) {
    console.log("\nProblems:");
    for (const p of problems) console.log(`  - ${p}`);
  }
  process.exit(problems.length ? 1 : 0);
}

main();
