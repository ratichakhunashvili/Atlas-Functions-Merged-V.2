/**
 * Verifies the testing-shortcut gate against a real production build — the one
 * security property that cannot be checked against the dev server.
 *
 *   node tests/prod-gate.mjs [baseUrl]            expect shortcuts HIDDEN
 *   node tests/prod-gate.mjs [baseUrl] --expect-tools   expect them SHOWN
 *
 * The default run proves that `ENABLE_TEST_TOOLS=true` alone does nothing in a
 * production build. Run it again with ALLOW_TEST_TOOLS_IN_PRODUCTION=true set
 * on the server and `--expect-tools` to prove the deliberate opt-in works.
 */

import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3002";
/** When set, the shortcuts are expected to be PRESENT (the deliberate opt-in). */
const EXPECT_TOOLS = process.argv.includes("--expect-tools");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const sql = neon(process.env.DATABASE_URL);

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
};

const [hotel] = await sql`SELECT id FROM hotels WHERE name LIKE 'Seaside Grand%'`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1200, height: 900 },
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#username", "ratichak");
await page.type("#password", "01024072661");
await page.click('button[type="submit"]');
for (let i = 0; i < 120; i += 1) {
  if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
  await new Promise((r) => setTimeout(r, 500));
}
// Assert on the session rather than the URL: the credentials callback redirect
// is still in flight the moment the cookie appears.
await page.goto(`${BASE}/profile`, { waitUntil: "networkidle0" });
const profile = await page.evaluate(() => document.body.innerText);
check(
  "the test account still logs in against a production build",
  !page.url().includes("/login") && profile.includes("ratichak"),
  page.url(),
);
const want = (present) => (EXPECT_TOOLS ? present : !present);
const verb = EXPECT_TOOLS ? "DOES offer" : "does NOT offer";

check(`profile ${verb} testing shortcuts`, want(profile.includes("Testing shortcuts")));

await page.goto(`${BASE}/hotels/${hotel.id}`, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 4000));
const hotelPage = await page.evaluate(() => document.body.innerText);
check(`hotel page ${verb} testing shortcuts`, want(hotelPage.includes("Testing shortcuts")));
check(
  EXPECT_TOOLS
    ? "the force-unlock control is rendered"
    : "no force-unlock control is rendered",
  want(hotelPage.includes("Force-unlock") && hotelPage.includes("Mark current stop visited")),
);

await page.goto(`${BASE}/admin`, { waitUntil: "networkidle0" });
const admin = await page.evaluate(() => document.body.innerText);
check(
  EXPECT_TOOLS
    ? "admin announces that testing shortcuts are on"
    : "admin does not announce testing shortcuts",
  want(admin.includes("Testing shortcuts are enabled")),
);

await browser.close();
console.log(`\nPASS ${passed}   FAIL ${failed}`);
process.exit(failed ? 1 : 0);
