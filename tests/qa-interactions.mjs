/**
 * Deep interaction QA. Exercises every admin CRUD path, every validation rule,
 * and the guest flows that the happy-path e2e does not cover.
 *
 *   node tests/qa-interactions.mjs [baseUrl]
 *
 * Creates its own throwaway records (all prefixed "QA ") and deletes them again,
 * so it leaves the seed data as it found it.
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    problems.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const section = (t) => console.log(`\n${t}`);

// A tiny valid PNG and a non-image, for upload validation.
const tmp = mkdtempSync(path.join(tmpdir(), "qa-"));
const PNG = path.join(tmp, "qa.png");
writeFileSync(
  PNG,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const NOT_AN_IMAGE = path.join(tmp, "notes.txt");
writeFileSync(NOT_AN_IMAGE, "this is not an image");

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    defaultViewport: { width: 1400, height: 1100 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
      consoleErrors.push(m.text().slice(0, 200));
    }
  });
  page.on("pageerror", (e) => consoleErrors.push(`uncaught: ${e.message.slice(0, 200)}`));

  await browser.defaultBrowserContext().overridePermissions(BASE, ["geolocation"]);
  await page.setGeolocation({ latitude: 41.6478, longitude: 41.6338 });

  const text = () => page.evaluate(() => document.body.innerText);

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
  async function waitForText(needle, timeout = 45000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if ((await text()).includes(needle)) return true;
      await sleep(300);
    }
    return false;
  }

  // ---- sign in -----------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#username", "ratichak");
  await page.type("#password", "01024072661");
  await page.click('button[type="submit"]');
  for (let i = 0; i < 200; i++) {
    if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
    await sleep(400);
  }

  // ======================================================= FORM VALIDATION
  section("Form validation");

  await page.goto(`${BASE}/admin/hotels`, { waitUntil: "networkidle0" });
  await sleep(2500);
  // Submit with everything empty: the browser's own required-field guard should
  // stop it, so nothing is created.
  const hotelsBefore = (await sql`SELECT count(*)::int n FROM hotels`)[0].n;
  await clickByText("Create hotel");
  await sleep(2500);
  const hotelsAfterEmpty = (await sql`SELECT count(*)::int n FROM hotels`)[0].n;
  check("empty hotel form does not create a record", hotelsAfterEmpty === hotelsBefore);

  // Name filled, photo missing. The browser's own required-field guard blocks
  // this before it reaches the server; the server check is the backstop.
  await page.type('input[name="name"]', "QA Validation Hotel");
  const blocked = await page.$eval("form", (f) => !f.checkValidity());
  check("a hotel with no photo fails validation before submitting", blocked);
  await clickByText("Create hotel");
  await sleep(2500);
  check(
    "no hotel is created without a photo",
    (await sql`SELECT count(*)::int n FROM hotels WHERE name = 'QA Validation Hotel'`)[0].n === 0,
  );
  check("no stack trace is shown to the user", !(await text()).includes("at Object."));

  // Wrong file type -> rejected by the storage guard.
  const fileInput = await page.$('input[name="photo"]');
  await fileInput.uploadFile(NOT_AN_IMAGE);
  await clickByText("Create hotel");
  const typeError = await waitForText("Expected", 30000);
  check("a non-image upload is rejected", typeError, (await text()).slice(0, 120));

  // ======================================================= HOTEL CRUD
  section("Hotel create / edit / delete");

  await page.goto(`${BASE}/admin/hotels`, { waitUntil: "networkidle0" });
  await sleep(2500);
  await page.type('input[name="name"]', "QA Test Hotel");
  await page.type('input[name="address"]', "QA Street 1");
  await (await page.$('input[name="photo"]')).uploadFile(PNG);
  await clickByText("Create hotel");
  await sleep(6000);

  const created = await sql`SELECT id, qr_token, latitude, longitude FROM hotels WHERE name = 'QA Test Hotel'`;
  check("hotel is created", created.length === 1);
  if (created.length === 1) {
    check("the new hotel got coordinates from the map picker", created[0].latitude !== null);
    check("the new hotel got a unique QR token", !!created[0].qr_token);
    check(
      "the QR token is not the row id",
      created[0].qr_token !== created[0].id,
      "token equals the primary key",
    );

    // Edit it.
    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await page.evaluate(() => {
      const input = document.querySelector('input[name="name"]');
      input.value = "";
    });
    await page.type('input[name="name"]', "QA Test Hotel Renamed");
    await clickByText("Save hotel");
    check("hotel edit saves", await waitForText("Hotel saved", 30000));
    const renamed = await sql`SELECT name FROM hotels WHERE id = ${created[0].id}`;
    check("the rename reached the database", renamed[0]?.name === "QA Test Hotel Renamed");

    // Add an activity, an event and an achievement to it.
    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await page.type('input[name="name"][placeholder="Rooftop spa"]', "QA Sauna");
    await clickByText("Add activity");
    check("hotel activity is added", await waitForText("Added QA Sauna", 30000));

    // --- activity edit + active/inactive switch -------------------------
    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await clickByText("Edit");
    await sleep(900);
    await page.evaluate(() => {
      const input = [...document.querySelectorAll('input[name="name"]')].find(
        (i) => i.value === "QA Sauna",
      );
      if (input) input.value = "";
    });
    const editName = await page.evaluateHandle(
      () => [...document.querySelectorAll('input[name="name"]')].find((i) => !i.value) ?? null,
    );
    if (editName.asElement()) await editName.asElement().type("QA Sauna Renamed");
    await clickByText("Save activity");
    check("hotel activity can be edited", await waitForText("Activity saved", 30000));
    const renamedActivity = await sql`
      SELECT name FROM hotel_activities WHERE hotel_id = ${created[0].id}`;
    check(
      "the activity rename reached the database",
      renamedActivity.some((a) => a.name === "QA Sauna Renamed"),
      renamedActivity.map((a) => a.name).join(", "),
    );

    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await clickByText("Deactivate");
    await sleep(3500);
    const deactivated = await sql`
      SELECT active FROM hotel_activities WHERE hotel_id = ${created[0].id}`;
    check(
      "an activity can be deactivated without deleting it",
      deactivated.some((a) => a.active === false),
      JSON.stringify(deactivated),
    );

    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await clickByText("Activate");
    await sleep(3500);
    const reactivated = await sql`
      SELECT active FROM hotel_activities WHERE hotel_id = ${created[0].id}`;
    check(
      "and reactivated again",
      reactivated.every((a) => a.active === true),
      JSON.stringify(reactivated),
    );

    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await page.type('input[name="title"]', "QA Event");
    // datetime-local needs the value set through React's own setter.
    await page.$eval('input[name="startsAt"]', (el) => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, "2027-01-01T20:00");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await clickByText("Add event");
    check("hotel event is added", await waitForText("Added QA Event", 30000));

    // An end time before the start must be refused.
    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await page.type('input[name="title"]', "QA Backwards Event");
    await page.evaluate(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      const starts = document.querySelector('input[name="startsAt"]');
      const ends = document.querySelector('input[name="endsAt"]');
      setter.call(starts, "2027-01-01T20:00");
      starts.dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(ends, "2027-01-01T18:00");
      ends.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickByText("Add event");
    check(
      "an end time before the start is refused",
      await waitForText("end time is before the start", 30000),
    );

    // --- event edit ------------------------------------------------------
    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    const eventEditOpened = await page.evaluate(() => {
      const row = [...document.querySelectorAll("li")].find((li) =>
        li.innerText.includes("QA Event"),
      );
      const button = [...(row?.querySelectorAll("button") ?? [])].find(
        (b) => b.innerText.trim() === "Edit",
      );
      if (!button) return false;
      button.click();
      return true;
    });
    check("an event offers an edit control", eventEditOpened);
    if (eventEditOpened) {
      await sleep(900);
      await page.evaluate(() => {
        const input = document.querySelector('input[name="title"]');
        if (input) input.value = "";
      });
      await page.type('input[name="title"]', "QA Event Renamed");
      await clickByText("Save event");
      check("hotel event can be edited", await waitForText("Event saved", 30000));
      const renamedEvent = await sql`
        SELECT title FROM hotel_events WHERE hotel_id = ${created[0].id}`;
      check(
        "the event rename reached the database",
        renamedEvent.some((e) => e.title === "QA Event Renamed"),
        renamedEvent.map((e) => e.title).join(", "),
      );
    }

    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await clickByText("Create achievement");
    check("hotel achievement is created", await waitForText("Achievement created", 30000));
    const ach = await sql`SELECT * FROM achievements WHERE place_type='hotel' AND place_id=${created[0].id}`;
    check("the achievement is stored against the hotel", ach.length === 1);

    // Deleting the hotel must take its achievement with it.
    await page.goto(`${BASE}/admin/hotels/${created[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await clickByText("Delete hotel");
    await sleep(400);
    await clickByText("Tap again to confirm");
    await sleep(6000);
    const gone = await sql`SELECT id FROM hotels WHERE id = ${created[0].id}`;
    check("hotel is deleted", gone.length === 0);
    const orphanAch = await sql`SELECT id FROM achievements WHERE place_type='hotel' AND place_id=${created[0].id}`;
    check("its achievement is cleaned up (no orphan)", orphanAch.length === 0);
    const orphanAct = await sql`SELECT id FROM hotel_activities WHERE hotel_id = ${created[0].id}`;
    check("its activities cascade away", orphanAct.length === 0);
    const orphanEvt = await sql`SELECT id FROM hotel_events WHERE hotel_id = ${created[0].id}`;
    check("its events cascade away", orphanEvt.length === 0);
  }

  // ======================================================= ATTRACTION CRUD
  section("Attraction create / edit / delete");
  await page.goto(`${BASE}/admin/attractions`, { waitUntil: "networkidle0" });
  await sleep(2500);
  await page.type('input[name="name"]', "QA Test Attraction");
  await (await page.$('input[name="photo"]')).uploadFile(PNG);
  await clickByText("Create attraction");
  await sleep(6000);
  const qaAttr = await sql`SELECT id, verification_mode FROM attractions WHERE name = 'QA Test Attraction'`;
  check("attraction is created", qaAttr.length === 1);
  if (qaAttr.length === 1) {
    check("default verification mode is GPS", qaAttr[0].verification_mode === "gps");

    await page.goto(`${BASE}/admin/attractions/${qaAttr[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await page.select('select[name="verificationMode"]', "qr");
    await clickByText("Save attraction");
    check("attraction edit saves", await waitForText("Attraction saved", 30000));
    const updated = await sql`SELECT verification_mode FROM attractions WHERE id = ${qaAttr[0].id}`;
    check("verification mode change persisted", updated[0].verification_mode === "qr");

    await page.goto(`${BASE}/admin/attractions/${qaAttr[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3000);
    await clickByText("Delete attraction");
    await sleep(400);
    await clickByText("Tap again to confirm");
    await sleep(6000);
    check(
      "attraction is deleted",
      (await sql`SELECT id FROM attractions WHERE id = ${qaAttr[0].id}`).length === 0,
    );
  }

  // ======================================================= PARTNER CRUD
  section("Partner create / assign / delete");
  await page.goto(`${BASE}/admin/partners`, { waitUntil: "networkidle0" });
  await sleep(2500);
  await page.type('input[name="name"]', "QA Test Partner");
  await (await page.$('input[name="photo"]')).uploadFile(PNG);
  await clickByText("Create partner");
  await sleep(6000);
  const qaPartner = await sql`SELECT id FROM partners WHERE name = 'QA Test Partner'`;
  check("partner is created", qaPartner.length === 1);

  if (qaPartner.length === 1) {
    await page.goto(`${BASE}/admin/partners/${qaPartner[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    const warned = (await text()).includes("Not assigned to any hotel yet");
    check("an unassigned partner is flagged as invisible to guests", warned);

    await clickByText("Assign");
    await sleep(4000);
    const assigned = await sql`SELECT * FROM hotel_partners WHERE partner_id = ${qaPartner[0].id}`;
    check("partner can be assigned to a hotel", assigned.length === 1);

    await page.goto(`${BASE}/admin/partners/${qaPartner[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3500);
    await clickByText("Assigned");
    await sleep(4000);
    const unassigned = await sql`SELECT * FROM hotel_partners WHERE partner_id = ${qaPartner[0].id}`;
    check("partner can be unassigned", unassigned.length === 0);

    await page.goto(`${BASE}/admin/partners/${qaPartner[0].id}`, { waitUntil: "networkidle0" });
    await sleep(3000);
    await clickByText("Delete partner");
    await sleep(400);
    await clickByText("Tap again to confirm");
    await sleep(6000);
    check(
      "partner is deleted",
      (await sql`SELECT id FROM partners WHERE id = ${qaPartner[0].id}`).length === 0,
    );
  }

  // ======================================================= USER MANAGEMENT
  section("User management guards");
  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle0" });
  await sleep(2500);
  const usersPage = await text();
  check("the signed-in admin is marked '(you)'", usersPage.includes("(you)"));
  const selfControls = await page.evaluate(() => {
    const row = [...document.querySelectorAll("tbody tr")].find((r) => r.innerText.includes("(you)"));
    return row
      ? { hasSelect: !!row.querySelector("select"), hasDelete: row.innerText.includes("Delete") }
      : null;
  });
  check("an admin cannot change their own role from the table", selfControls?.hasSelect === false);
  check("an admin cannot delete their own account", selfControls?.hasDelete === false);

  // ======================================================= QR MANAGEMENT
  section("QR codes");
  await page.goto(`${BASE}/admin/qr-codes`, { waitUntil: "networkidle0" });
  await sleep(7000);
  const qrImages = await page.evaluate(() =>
    [...document.querySelectorAll('img[alt^="QR code"]')].map((i) => ({
      ok: i.complete && i.naturalWidth > 0,
      src: i.getAttribute("src"),
    })),
  );
  check("QR code images are present", qrImages.length > 0, `${qrImages.length} found`);
  check("every QR image renders", qrImages.every((i) => i.ok), `${qrImages.filter((i) => !i.ok).length} broken`);
  const tokenShown = await page.evaluate(() => document.body.innerText.match(/[0-9a-f]{8}…[0-9a-f]{4}/));
  check("tokens are shown truncated, not in full", !!tokenShown);

  // ======================================================= GUEST EDGE CASES
  section("Guest edge cases");

  // Generating a day with no interests selected must explain itself.
  const [guest] = await sql`SELECT id FROM users WHERE username = 'testguest'`;
  const [hotelA] = await sql`SELECT id, qr_token FROM hotels WHERE name LIKE 'Seaside Grand%'`;
  await sql`DELETE FROM user_category_preferences WHERE user_id = ${guest.id}`;
  await sql`DELETE FROM itinerary_days WHERE user_id = ${guest.id}`;
  await sql`INSERT INTO hotel_unlocks (user_id, hotel_id) VALUES (${guest.id}, ${hotelA.id}) ON CONFLICT DO NOTHING`;

  await page.goto(`${BASE}/api/auth/signout`, { waitUntil: "networkidle0" });
  const signOutButton = await page.$('button[type="submit"]');
  if (signOutButton) await signOutButton.click();
  await sleep(2500);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type("#username", "testguest");
  await page.type("#password", "testguest-local-only");
  await page.click('button[type="submit"]');
  for (let i = 0; i < 200; i++) {
    if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
    await sleep(400);
  }

  await page.goto(`${BASE}/hotels/${hotelA.id}`, { waitUntil: "domcontentloaded" });
  await sleep(6000);
  await clickByText("Plan my day");
  const prefPrompt = await waitForText("Pick your interests", 40000);
  check("generating with no interests explains what to do", prefPrompt);

  // A guest must not reach the admin area.
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle0" });
  check("a plain guest is bounced out of /admin", !page.url().includes("/admin"), page.url());

  // A hotel they have not unlocked must not open.
  const [hotelC] = await sql`SELECT id FROM hotels WHERE name LIKE 'Harbour View%'`;
  await page.goto(`${BASE}/hotels/${hotelC.id}`, { waitUntil: "networkidle0" });
  check("a locked hotel redirects to the gallery", page.url().includes("/gallery"), page.url());
  check("and says why", (await text()).includes("Scan that hotel"));

  // Scanning an unknown code must fail gracefully.
  await page.goto(`${BASE}/unlock/definitely-not-a-token`, { waitUntil: "domcontentloaded" });
  const badScan = await waitForText("couldn't use that code", 30000);
  check("an unknown QR code fails gracefully", badScan, (await text()).slice(0, 140));

  await browser.close();

  section("Console health during interactions");
  const unique = [...new Set(consoleErrors)];
  check("no console errors during the interaction run", unique.length === 0, unique.slice(0, 5).join(" | "));

  console.log(`\n${"=".repeat(70)}`);
  console.log(`PASS ${pass}   PROBLEMS ${problems.length}`);
  if (problems.length) {
    console.log("\nProblems:");
    for (const p of problems) console.log(`  - ${p}`);
  }
  process.exit(problems.length ? 1 : 0);
}

main();
