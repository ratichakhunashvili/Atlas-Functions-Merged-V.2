/** Pinpoints the exact form controls flagged as unlabelled by the QA sweep. */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";

const BASE = process.argv[2] ?? "http://localhost:3000";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n\r]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const sql = neon(process.env.DATABASE_URL);
const [attraction] = await sql`SELECT id FROM attractions WHERE name = 'Alphabet Tower'`;

const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1400, height: 1000 },
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await page.type("#username", "ratichak");
await page.type("#password", "01024072661");
await page.click('button[type="submit"]');
for (let i = 0; i < 180; i++) {
  if ((await page.cookies()).some((c) => c.name.includes("session-token"))) break;
  await new Promise((r) => setTimeout(r, 400));
}

for (const [label, url] of [
  ["/admin/attractions", `${BASE}/admin/attractions`],
  ["/admin/attractions/:id", `${BASE}/admin/attractions/${attraction.id}`],
  ["/admin/users", `${BASE}/admin/users`],
  ["/admin/partners", `${BASE}/admin/partners`],
  ["/admin/hotels", `${BASE}/admin/hotels`],
]) {
  await page.goto(url, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 2500));
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => {
        if (el.type === "hidden") return false;
        if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
        if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
        return !el.closest("label");
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type ?? "",
        name: el.name ?? "",
        outer: el.outerHTML.slice(0, 160),
      })),
  );
  console.log(`\n${label}: ${bad.length} unlabelled`);
  for (const b of bad) console.log(`   <${b.tag} type=${b.type} name="${b.name}">  ${b.outer}`);
}

await browser.close();
