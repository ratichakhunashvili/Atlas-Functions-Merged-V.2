"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SITE_ACCESS_COOKIE,
  checkSitePassword,
  siteAccessTokenValue,
} from "@/lib/site-access";

export type SiteAccessState = { error: string } | undefined;

/** Only a same-site relative path is ever honoured, so this can't be turned into an open redirect. */
function safeCallbackPath(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "");
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) return raw;
  return "/";
}

export async function submitSitePassword(
  _prevState: SiteAccessState,
  formData: FormData,
): Promise<SiteAccessState> {
  const password = String(formData.get("password") ?? "");
  const callbackUrl = safeCallbackPath(formData.get("callbackUrl"));

  if (!checkSitePassword(password)) {
    return { error: "That password isn't right." };
  }

  const store = await cookies();
  store.set(SITE_ACCESS_COOKIE, siteAccessTokenValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(callbackUrl);
}
