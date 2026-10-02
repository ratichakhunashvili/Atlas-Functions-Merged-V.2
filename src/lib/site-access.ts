import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A site-wide password wall, used only when `SITE_ACCESS_PASSWORD` is set.
 *
 * It exists for one specific gap: Vercel's own Deployment Protection (password
 * or "Vercel Authentication") only covers a deployment's raw per-build URL and
 * preview URLs on a Hobby plan — it does NOT cover the production alias
 * (`<project>.vercel.app`), which is the link anyone actually shares. This
 * closes that gap at the application level instead.
 *
 * Unset locally and on an ordinary deployment, so nothing here changes how the
 * app runs by default — it only engages when someone deliberately sets the
 * password on a deployment they are choosing to expose this way.
 *
 * The password itself is never stored in the cookie. The cookie holds an
 * HMAC of the password keyed by AUTH_SECRET, so it reveals nothing if read
 * out of a shared browser, and a cookie from one deployment is worthless
 * against another unless both secrets match.
 */
export const SITE_ACCESS_COOKIE = "site-access";

export function siteAccessRequired(): boolean {
  return Boolean(process.env.SITE_ACCESS_PASSWORD);
}

function expectedToken(): string | null {
  const password = process.env.SITE_ACCESS_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!password || !secret) return null;
  return createHmac("sha256", secret).update(password).digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch rather than returning false,
  // so unequal lengths are rejected up front.
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/** Checks a password a visitor typed into the gate form. */
export function checkSitePassword(candidate: string): boolean {
  const password = process.env.SITE_ACCESS_PASSWORD;
  if (!password || !candidate) return false;
  return timingSafeStringEqual(candidate, password);
}

/** Checks the cookie value on an incoming request. */
export function isValidSiteAccessToken(token: string | undefined): boolean {
  const expected = expectedToken();
  if (!expected || !token) return false;
  return timingSafeStringEqual(token, expected);
}

/** The value to store in the cookie once a password check succeeds. */
export function siteAccessTokenValue(): string {
  const expected = expectedToken();
  if (!expected) throw new Error("Site access is not configured.");
  return expected;
}
