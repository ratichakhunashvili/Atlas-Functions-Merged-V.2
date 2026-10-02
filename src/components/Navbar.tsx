"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { resolveScan } from "@/actions/scan";
import { LogoutIcon, QrIcon, SlidersIcon, UserIcon } from "@/components/icons";

// html5-qrcode touches browser-only camera APIs, so it must never be
// evaluated during server-side rendering.
const QRScannerModal = dynamic(() => import("@/components/QRScannerModal"), {
  ssr: false,
});

export default function Navbar({
  user,
}: {
  user: { username: string; role: "user" | "admin" };
}) {
  const router = useRouter();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // One scan does everything: the server decides whether the token is a hotel
  // (unlock) or a place (check in + achievement), so the guest never picks.
  const handleScan = useCallback(
    async (decodedText: string) => {
      const result = await resolveScan(decodedText);
      if (result.kind === "unknown") {
        setScanError(result.message);
        return;
      }
      if (result.kind === "place" && !result.hotelId) {
        setScanError(result.message);
        return;
      }
      const key = result.kind === "hotel" || result.ok ? "scan" : "scanError";
      router.push(`/hotels/${result.hotelId}?${key}=${encodeURIComponent(result.message)}`);
      router.refresh();
    },
    [router],
  );

  return (
    <>
      {/* Three equal columns only once there is room for them; on a phone the
          centred scan button would otherwise sit on top of the links. */}
      <nav className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:grid sm:grid-cols-3">
          <Link href="/gallery" className="shrink-0 text-base font-semibold sm:text-lg">
            Merged V.2
          </Link>

          <div className="flex min-w-0 justify-center">
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label="Scan a QR code"
              className="flex shrink-0 items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95 sm:px-5 sm:py-2.5"
            >
              <QrIcon className="h-4 w-4" />
              {/* Icon-only on a phone, where the full label would crowd the links. */}
              <span className="hidden sm:inline">Scan QR</span>
            </button>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 text-sm sm:gap-4">
            <span className="hidden text-zinc-400 lg:inline">{user.username}</span>
            <Link
              href="/profile"
              aria-label="Your profile"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <UserIcon className="h-5 w-5 sm:hidden" />
              <span className="hidden sm:inline">Profile</span>
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin"
                aria-label="Admin"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <SlidersIcon className="h-5 w-5 sm:hidden" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Log out"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <LogoutIcon className="h-5 w-5 sm:hidden" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </nav>

      {scannerOpen && (
        <QRScannerModal
          onClose={() => setScannerOpen(false)}
          onScan={(text) => {
            setScannerOpen(false);
            void handleScan(text);
          }}
        />
      )}

      {scanError && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4">
          <button
            type="button"
            onClick={() => setScanError(null)}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white shadow-lg"
          >
            {scanError}
          </button>
        </div>
      )}
    </>
  );
}
