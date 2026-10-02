import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  SITE_ACCESS_COOKIE,
  isValidSiteAccessToken,
  siteAccessRequired,
} from "@/lib/site-access";

/** Paths the password wall itself must stay reachable through, or nobody could ever pass it. */
const SITE_ACCESS_EXEMPT_PREFIXES = ["/site-access", "/_next", "/uploads", "/favicon.ico"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // The password wall runs before anything else, including the login page and
  // NextAuth's own routes — see lib/site-access.ts for why it exists. It only
  // ever engages when SITE_ACCESS_PASSWORD is explicitly set.
  if (siteAccessRequired() && !SITE_ACCESS_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) {
    const token = req.cookies.get(SITE_ACCESS_COOKIE)?.value;
    if (!isValidSiteAccessToken(token)) {
      const url = new URL("/site-access", req.nextUrl);
      url.searchParams.set("callbackUrl", pathname + req.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  const isAdminRoute = pathname.startsWith("/admin");
  const isGalleryRoute = pathname.startsWith("/gallery");
  const isHotelRoute = pathname.startsWith("/hotels");
  const isProfileRoute = pathname.startsWith("/profile");
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!req.auth && (isAdminRoute || isGalleryRoute || isHotelRoute || isProfileRoute)) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isAdminRoute && req.auth?.user?.role !== "admin") {
    return NextResponse.redirect(new URL("/gallery", req.nextUrl));
  }

  if (isAuthPage && req.auth?.user) {
    return NextResponse.redirect(new URL("/gallery", req.nextUrl));
  }
});

export const config = {
  // Broad on purpose: the password wall above must see every route, not just
  // the ones the auth checks below care about. Next's own static assets are
  // excluded, both for performance and because they carry no useful content on
  // their own.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
