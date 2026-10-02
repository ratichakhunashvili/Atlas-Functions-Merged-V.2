"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Shows a place's QR code with print and download actions.
 *
 * The image is fetched from an admin-only API route rather than embedded, and
 * the token itself is shown only in truncated form — it is the secret that
 * identifies the place.
 */
export default function QrCodeCard({
  title,
  qrSrc,
  token,
  onRegenerate,
}: {
  title: string;
  qrSrc: string;
  token: string;
  onRegenerate?: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  // Busts the browser cache after a token change, so the new code is shown.
  const [version, setVersion] = useState(0);

  const handleDownload = async () => {
    const response = await fetch(`${qrSrc}?v=${version}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "width=600,height=800");
    if (!printWindow) return;
    printWindow.document.write(
      `<html><head><title>${title}</title></head>
       <body style="font-family:system-ui;text-align:center;padding:40px">
         <h1 style="font-size:20px">${title}</h1>
         <img src="${qrSrc}?v=${version}" style="width:320px;height:320px" onload="window.print()" />
         <p style="color:#666;font-size:13px">Scan to open in the app</p>
       </body></html>`,
    );
    printWindow.document.close();
  };

  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- served by an auth-gated API route, not an optimizable static asset */}
      <img
        src={`${qrSrc}?v=${version}`}
        alt={`QR code for ${title}`}
        width={192}
        height={192}
        className="h-48 w-48 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800"
      />

      <p className="font-mono text-xs text-zinc-400">
        {token.slice(0, 8)}…{token.slice(-4)}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Print
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Download PNG
        </button>
        {onRegenerate && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                setTimeout(() => setArmed(false), 4000);
                return;
              }
              startTransition(async () => {
                await onRegenerate();
                setVersion((current) => current + 1);
                setArmed(false);
                router.refresh();
              });
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
              armed
                ? "bg-red-600 text-white"
                : "border border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
            }`}
          >
            {pending
              ? "Regenerating…"
              : armed
                ? "Confirm — old prints stop working"
                : "Regenerate token"}
          </button>
        )}
      </div>
    </div>
  );
}
