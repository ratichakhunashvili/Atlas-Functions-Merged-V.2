import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
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
  matcher: ["/admin/:path*", "/gallery/:path*", "/hotels/:path*", "/profile/:path*", "/login", "/signup"],
};
